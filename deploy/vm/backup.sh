#!/usr/bin/env bash
# Daily database backup. Runs ON THE VM under cron (FR-487).
#
#   ./backup.sh            take a backup now (no argument = run, so the crontab idiom works)
#   ./backup.sh install    install or refresh the daily schedule. Idempotent.
#   ./backup.sh status     report the schedule and the artifacts on disk
#   ./backup.sh --help
#
# ═══════════════════════════════════════════════════════════════════════════════════════════════
# **THIS IS THE OBLIGATION v3.0.0 ACCEPTED IN EXCHANGE FOR DROPPING THE MANAGED PROVIDER.**
#
# Standing decision 17 moved PostgreSQL into the application's own stack. The engine, the
# project-owned contract and the reviewed migrations are unchanged; what changed is **who operates
# the database** — and with it, backups became this project's obligation rather than a vendor's.
# The constitution names three parts, and this script is the first two:
#
#   1. at least daily, automated                        -> `install`, below
#   2. a written retention period                       -> BACKUP_KEEP_LOCAL in .env, reported by
#                                                          `status` so it is never merely implied
#   3. a restore that has ACTUALLY BEEN PERFORMED        -> `verify-backup-local.sh`, and an entry
#                                                          in OPERATIONS-LOG.md (SC-413)
# ═══════════════════════════════════════════════════════════════════════════════════════════════
#
# THE ORDERING IS THE DESIGN:  lock -> disk floor -> name -> dump -> verify -> prune
#
# Pruning happens LAST and only after the new artifact has been verified readable. Reversing that
# turns a backup script into a data-destruction script: a persistently failing dump would walk the
# retained set 7 -> 6 -> ... -> 0 while every run "succeeded" at taking a backup.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CRON_MARKER='# mynet-backup'
CRONTAB_CMD="${MYNET_CRONTAB_CMD:-crontab}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

load_config() {
  local file="${SCRIPT_DIR}/.env"
  [[ -f "$file" ]] || { echo "ERROR: no .env beside this script at ${file}" >&2; exit 2; }
  set -a
  # The directive must sit immediately before the `.` itself — on the previous line it attached
  # to `set -a` instead and the warning stood.
  # shellcheck source=/dev/null
  . "$file"
  set +a

  : "${POSTGRES_USER:?POSTGRES_USER must be set in .env}"
  : "${DATABASE_NAME:?DATABASE_NAME must be set in .env}"
  BACKUP_DIR="${BACKUP_DIR:-${SCRIPT_DIR}/backups}"
  BACKUP_KEEP_LOCAL="${BACKUP_KEEP_LOCAL:-7}"
  BACKUP_MIN_FREE_MB="${BACKUP_MIN_FREE_MB:-2048}"
  BACKUP_LOG="${BACKUP_LOG:-${BACKUP_DIR}/backup.log}"

  # ───────────────────────────────────────────────────────────────────────────────────────────
  # Checked on BOTH paths, not only on `install`. Without `flock`, `if ! flock -n 9` sees
  # command-not-found (127), takes the true branch, and every scheduled run exits 3 logging
  # "another backup run holds the lock" — a cause that is not the cause, sending anyone who does
  # look in the wrong direction while no backups are taken at all.
  # ───────────────────────────────────────────────────────────────────────────────────────────
  command -v flock >/dev/null || {
    echo "ERROR: flock is required (util-linux). Without it two overlapping runs both write." >&2
    exit 2
  }

  # ───────────────────────────────────────────────────────────────────────────────────────────
  # `BACKUP_DIR` is settable from `.env`, but the verify step reads the artifact from `/backups`
  # INSIDE the container, which is where `docker-compose.yml` bind-mounts `./backups` and nowhere
  # else. Pointing it elsewhere — the obvious move when the OS disk gets tight — makes every run
  # dump successfully and then exit 6 on a file the container cannot see, so backups stop
  # entirely. Refuse with the reason rather than failing daily for an opaque one.
  # ───────────────────────────────────────────────────────────────────────────────────────────
  if [[ "$BACKUP_DIR" != "${SCRIPT_DIR}/backups" ]]; then
    echo "ERROR: BACKUP_DIR is ${BACKUP_DIR}, but docker-compose.yml mounts ${SCRIPT_DIR}/backups" >&2
    echo "       at /backups, which is where the verify step reads the artifact from." >&2
    exit 2
  fi
}

# The outcome of the last run, in one line, where `status` can read it. See `cmd_status`.
LAST_RUN_FILE() { printf '%s/.last-run' "$BACKUP_DIR"; }

record_outcome() {
  printf '%s exit=%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "${2:-}" > "$(LAST_RUN_FILE)" || true
}

free_mb() { df -Pm "$1" 2>/dev/null | awk 'NR==2 {print $4}'; }

usage() {
  cat <<EOF
Usage: $(basename "$0") [run|install|status|--help]

  (no argument), run   Take a compressed dump, verify it is readable, then prune.
  install              Install or refresh the daily schedule (02:30 host-local). Idempotent.
  status               Show the schedule, the retention period, and the artifacts on disk.

Exit codes: 0 success  2 usage/config  3 skipped (another run holds the lock)
            4 refused (low disk)  5 dump failed  6 the dump is not readable
EOF
}

cmd_run() {
  load_config
  mkdir -p "$BACKUP_DIR" "$(dirname -- "$BACKUP_LOG")"

  # An `if`, not `[[ -t 1 ]] && echo …`: the AND-list evaluates to status 1 under cron, where
  # stdout is not a terminal, and `set -e` would abort the run on the announcement.
  if [[ -t 1 ]]; then echo "Backing up. All output is appended to ${BACKUP_LOG}."; fi
  exec >>"$BACKUP_LOG" 2>&1

  log "=== Backup run started (pid $$) ==="

  # 1. One run at a time. The run holding the lock is already doing the work, so exiting quietly
  #    is correct — and it must exit having touched nothing at all.
  exec 9>"${BACKUP_DIR}/.backup.lock"
  if ! flock -n 9; then
    log "SKIPPED: another backup run holds the lock. Nothing was written or deleted."
    record_outcome 3 "skipped: lock held"
    exit 3
  fi

  # 2. Disk floor. The dump is written to the same filesystem PostgreSQL writes to, so a run that
  #    would fill the disk stops the live database. Refuse and change NOTHING.
  local free
  free="$(free_mb "$BACKUP_DIR")"
  if [[ -z "$free" ]]; then
    log "REFUSED: could not measure free space on the filesystem holding ${BACKUP_DIR}. Nothing changed."
    record_outcome 4 "refused: free space unmeasurable"
    exit 4
  fi
  if (( free < BACKUP_MIN_FREE_MB )); then
    log "REFUSED: ${free} MiB free, below the ${BACKUP_MIN_FREE_MB} MiB floor."
    log "         No backup was taken and nothing was deleted."
    record_outcome 4 "refused: below disk floor"
    exit 4
  fi
  log "Free space: ${free} MiB (floor ${BACKUP_MIN_FREE_MB} MiB)."

  # 3. Name it. UTC, and never overwrite: two runs in one second get distinct names rather than
  #    one of them silently replacing the other.
  # Declared and assigned separately: `local x="$(cmd)"` masks the command's exit status behind
  # `local`'s own, which is always 0 (SC2155).
  local name
  name="mynet-${DATABASE_NAME}-$(date -u +%Y%m%dT%H%M%SZ).dump"
  local n=1
  while [[ -e "${BACKUP_DIR}/${name}" ]]; do
    name="mynet-${DATABASE_NAME}-$(date -u +%Y%m%dT%H%M%SZ)-${n}.dump"
    n=$((n + 1))
  done
  log "Artifact: ${name}"

  # 4. The dump. `--format=custom` rather than plain SQL: it is compressed, and `pg_restore` can
  #    read it selectively — which is what makes a partial restore possible at all.
  cd "$SCRIPT_DIR"
  if ! docker compose exec -T postgres pg_dump \
        --username "$POSTGRES_USER" --dbname "$DATABASE_NAME" \
        --format=custom --no-owner --no-privileges \
        > "${BACKUP_DIR}/${name}"; then
    log "FAILED: pg_dump failed. The partial artifact is removed; nothing else was deleted."
    rm -f "${BACKUP_DIR}/${name}"
    record_outcome 5 "pg_dump failed"
    exit 5
  fi
  log "Dump written: ${BACKUP_DIR}/${name} ($(stat -c %s -- "${BACKUP_DIR}/${name}") bytes)."

  # ───────────────────────────────────────────────────────────────────────────────────────────
  # 5. **VERIFY IT IS READABLE BEFORE PRUNING ANYTHING.**
  #
  # `pg_dump` exiting 0 is not evidence that the file can be restored: a full disk, a truncated
  # write or a redirection that lost its target all produce a zero exit and an unusable artifact.
  # `pg_restore --list` parses the archive's own table of contents, which is the cheapest thing
  # that actually reads the file.
  #
  # This is the gate the whole ordering exists for. Pruning before it turns a persistent failure
  # into silent, progressive data destruction.
  # ───────────────────────────────────────────────────────────────────────────────────────────
  if ! docker compose exec -T postgres pg_restore --list "/backups/${name}" >/dev/null 2>&1; then
    log "FAILED: ${name} is not a readable archive. It is kept for inspection and NOTHING was pruned."
    record_outcome 6 "artifact not readable"
    exit 6
  fi
  log "Verified readable: pg_restore --list parses ${name}."

  # 6. Prune, oldest first, keeping BACKUP_KEEP_LOCAL. Only reached on a verified artifact.
  local pruned=0
  while IFS= read -r old; do
    [[ -n "$old" ]] || continue
    rm -f -- "$old"
    log "Pruned: $(basename -- "$old")"
    pruned=$((pruned + 1))
  done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' -printf '%T@ %p\n' \
            | sort -rn | tail -n +$((BACKUP_KEEP_LOCAL + 1)) | cut -d' ' -f2-)
  (( pruned == 0 )) && log "Nothing to prune: at most ${BACKUP_KEEP_LOCAL} artifacts present."

  record_outcome 0 "success: ${name}"
  log "=== Backup run finished: success ==="
}

cmd_install() {
  load_config
  # 02:30 host-local — after the low-traffic hours of every timezone the seeded conferences use,
  # and well clear of the retention sweep the API runs on its own two-hour cycle.
  local line="30 2 * * * ${SCRIPT_DIR}/backup.sh run ${CRON_MARKER}"

  # Idempotent by construction: drop every line carrying the marker, then append exactly one.
  # Matching the MARKER rather than the path means the entry is still found if the path changes.
  local existing filtered
  existing="$("$CRONTAB_CMD" -l 2>/dev/null || true)"
  filtered="$(printf '%s' "$existing" | grep -vF -- "$CRON_MARKER" || true)"
  {
    [[ -n "$filtered" ]] && printf '%s\n' "$filtered"
    printf '%s\n' "$line"
  } | "$CRONTAB_CMD" -

  echo "Installed. Exactly one entry carries the '${CRON_MARKER}' marker:"
  echo "  ${line}"
  echo "Retention: ${BACKUP_KEEP_LOCAL} artifacts in ${BACKUP_DIR}."
  echo "Run log:   ${BACKUP_LOG}"
  echo
  echo "**A restore has not been performed until it has been performed.** Run"
  echo "  ./verify-backup-local.sh"
  echo "and record the result in deploy/vm/OPERATIONS-LOG.md before this environment holds real"
  echo "attendee data (SC-413)."
}

cmd_status() {
  load_config
  echo "== Schedule =="
  local entry
  entry="$("$CRONTAB_CMD" -l 2>/dev/null | grep -F -- "$CRON_MARKER" || true)"
  if [[ -n "$entry" ]]; then echo "  ${entry}"; else echo "  NOT INSTALLED. Run: $(basename "$0") install"; fi

  echo
  # The retention period is REPORTED rather than left implied. The constitution requires it to be
  # written down; a number only visible in a .env nobody opens is not written down.
  echo "== Retention: ${BACKUP_KEEP_LOCAL} artifacts, in ${BACKUP_DIR} =="
  if [[ -d "$BACKUP_DIR" ]]; then
    find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' \
      -printf '  %f  %s bytes  %TY-%Tm-%Td %TH:%TM\n' 2>/dev/null | LC_ALL=C sort | grep . \
      || echo "  (none yet)"
  else
    echo "  (${BACKUP_DIR} does not exist yet)"
  fi

  # ───────────────────────────────────────────────────────────────────────────────────────────
  # **The last outcome, and whether it is stale.**
  #
  # `cmd_run` redirects all output into the log before doing anything, so cron captures nothing
  # and can mail nothing. In an environment the README states has no monitoring, this command is
  # the only place a failing schedule can surface — and it reported the crontab entry, the
  # retention number and a directory listing, none of which changes when backups stop.
  #
  # Exits non-zero when the newest artifact is older than ~36 hours, so this can be wired to
  # anything later without changing it.
  # ───────────────────────────────────────────────────────────────────────────────────────────
  echo
  echo "== Last run =="
  if [[ -r "$(LAST_RUN_FILE)" ]]; then
    sed 's/^/  /' "$(LAST_RUN_FILE)"
  else
    echo "  (no run recorded yet)"
  fi

  local newest_age stale=0
  newest_age="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' -printf '%T@\n' 2>/dev/null \
    | sort -rn | head -1)"
  if [[ -z "$newest_age" ]]; then
    echo "  STALE: there is no backup artifact at all."
    stale=1
  else
    local hours
    hours=$(( ( $(date +%s) - ${newest_age%.*} ) / 3600 ))
    if (( hours > 36 )); then
      echo "  STALE: the newest backup is ${hours} hours old (the schedule is daily)."
      stale=1
    else
      echo "  Newest backup is ${hours} hours old."
    fi
  fi

  echo
  echo "Run log: ${BACKUP_LOG}"
  echo "Restore procedure: deploy/vm/README.md section 5."

  return "$stale"
}

case "${1:-run}" in
  run|"")    cmd_run ;;
  install)   cmd_install ;;
  status)    cmd_status ;;
  -h|--help) usage ;;
  *)         usage >&2; exit 2 ;;
esac
