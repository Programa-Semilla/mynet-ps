#!/usr/bin/env bash
# Idempotent deploy for a MyNet environment's single-VM stack. Run from your DEV MACHINE.
#
# Usage:  ./deploy.sh <uat|prod> [--migrate] [--no-build] [--until "<text>"] [--logs]
#   --migrate        Apply pending database migrations before starting the new API
#   --no-build       Recreate containers without rebuilding the API image
#   --until "<text>" Expected return time shown on the maintenance page
#   --logs           Tail api+caddy logs afterwards
#
# ═══════════════════════════════════════════════════════════════════════════════════════════════
# **THE BUILT CLIENT IS NOT BUILT ON THE VM** (research D6). It is built HERE — on the deploying
# machine — and rsynced. Building it on a Standard_B2s would be slower and would need the whole
# toolchain on the machine.
#
# **What this does NOT currently give you is provenance**, and the previous version of this
# comment claimed otherwise: it said `apps/web/dist` "is produced by the same `build` job CI
# already runs, so what is deployed is what was verified". Nothing downloads CI's `web-dist`
# artifact; step [2/6] below runs its own build. So the deployed bundle is a *rebuild* of the
# deployed commit, not the byte-identical artifact the asset budget was measured against.
#
# In practice the rebuild is deterministic from a clean checkout, which is what the CI deploy
# jobs do. Closing the gap properly means consuming the `web-dist` artifact here; it is recorded
# rather than glossed so that the next reader does not assume it is already done.
# ═══════════════════════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/_common.sh"
mynet::load_env "${1:-}"; shift || true

DO_MIGRATE="false"; DO_BUILD="true"; DO_LOGS="false"; UNTIL_TEXT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --migrate)  DO_MIGRATE="true"; shift ;;
    --no-build) DO_BUILD="false"; shift ;;
    --logs)     DO_LOGS="true"; shift ;;
    --until)
      [[ $# -ge 2 ]] || { echo "ERROR: --until needs a value." >&2; exit 2; }
      UNTIL_TEXT="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

mynet::require_az
mynet::require_domain
command -v rsync >/dev/null || { echo "rsync missing." >&2; exit 1; }

REMOTE="$(mynet::remote)"
REPO_ROOT="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "== [1/6] Preflight: SSH to $REMOTE [$MYNET_ENV] =="
if ! SSH_ERR="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" 'echo ok' 2>&1)"; then
  if grep -qi 'host key verification failed' <<<"$SSH_ERR"; then
    VM_IP="${REMOTE#*@}"
    cat >&2 <<EOF
ERROR: $VM_IP is not in known_hosts, and BatchMode cannot prompt to accept it.

Verify the host key through the Azure control plane -- independent of SSH -- then trust it.
Blindly accepting it on a production host defeats the point of host-key checking.

  # 1. Fingerprints as the VM itself reports them, via the guest agent:
  az vm run-command invoke -g $RESOURCE_GROUP -n $VM_NAME \\
    --command-id RunShellScript \\
    --scripts 'for f in /etc/ssh/ssh_host_*_key.pub; do ssh-keygen -lf \$f; done' \\
    --query 'value[0].message' -o tsv

  # 2. Fingerprints as offered over the network -- these MUST match step 1:
  ssh-keyscan -T 10 $VM_IP 2>/dev/null | ssh-keygen -lf -

  # 3. Only if they match:
  ssh-keyscan -T 10 $VM_IP 2>/dev/null >> ~/.ssh/known_hosts
EOF
  else
    echo "Cannot SSH to $REMOTE (key/NSG/host?):" >&2
    echo "$SSH_ERR" >&2
  fi
  exit 1
fi

# T069a, second half — verified against the VM's OWN configuration, not the committed files, and
# BEFORE anything is synced, deployed or put into maintenance.
mynet::require_remote_data_separation "$REMOTE"

# ═══════════════════════════════════════════════════════════════════════════════════════════════
# **THE TRAP IS ARMED BEFORE MAINTENANCE IS ENTERED, NOT AFTER.**
#
# `maintenance.sh on` raises the flag and then does more fallible things. Arming afterwards leaves
# a window in which the site is already behind a 503 and the script has aborted under `set -e`
# with no trap installed — so the operator is told nothing at all. Arming first can at worst
# over-report, which is the safe direction, and the message says "may be".
# ═══════════════════════════════════════════════════════════════════════════════════════════════
MAINT_ON=true
MAINT_REPORTED=false
warn_maintenance() {
  [[ "${MAINT_ON:-false}" == "true" && "${MAINT_REPORTED:-false}" == "false" ]] || return 0
  MAINT_REPORTED=true
  echo "" >&2
  echo "DEPLOY FAILED — ${MYNET_ENV} may STILL BE IN MAINTENANCE (this is deliberate)." >&2
  echo "  Attendees see the maintenance page, not a broken site." >&2
  echo "  Check:  ./maintenance.sh ${MYNET_ENV} status" >&2
  echo "  Fix and re-run, or lift by hand: ./maintenance.sh ${MYNET_ENV} off" >&2
}
# The SIGNAL traps must EXIT, and are therefore separate from ERR/EXIT: a bash trap handler that
# does not exit does not stop the script — bash resumes after the interrupted command. One handler
# on all four produced a Ctrl-C that printed "DEPLOY FAILED" and then carried on to exit 0.
trap 'warn_maintenance' ERR EXIT
trap 'warn_maintenance; exit 130' INT
trap 'warn_maintenance; exit 143' TERM

echo "== [1b/6] Entering maintenance [$MYNET_ENV] =="
MAINT_ARGS=()
[[ -n "$UNTIL_TEXT" ]] && MAINT_ARGS=(--until "$UNTIL_TEXT")
"${SCRIPT_DIR}/maintenance.sh" "$MYNET_ENV" on "${MAINT_ARGS[@]+"${MAINT_ARGS[@]}"}"

echo "== [2/6] Building the client =="
if [[ "$DO_BUILD" == "true" ]]; then
  # ═══════════════════════════════════════════════════════════════════════════════════════════
  # **THE VAPID PUBLIC KEY IS READ BACK OUT OF THE VM'S OWN `.env`, AND THAT IS THE POINT.**
  #
  # 007 needs the *public* half compiled into the client bundle, and the *private* half in the
  # API's environment. The obvious arrangement — public key in `envs/<env>.env`, private key in
  # the VM's `.env` — puts one key pair in two files, and a pair that drifts fails in the worst
  # available way: the browser subscribes with one key, the server signs with another, the push
  # service answers 403 for every delivery, and nothing anywhere looks broken.
  #
  # So there is one copy. This reads it over the SSH connection step [1/6] has already proved,
  # before anything is built with it. Absent — no `.env` yet, or no keys chosen (register entry
  # 20 is open) — the client is built without one, `isSupported()` is false, no permission is
  # ever requested, and the product is complete minus notifications (FR-552).
  #
  # It is not a secret: `VITE_`-prefixed values are bundled and world-readable by construction,
  # which is exactly why only the public half may carry that prefix.
  # ═══════════════════════════════════════════════════════════════════════════════════════════
  VAPID_PUBLIC="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" \
    "sed -n 's/^PUSH_VAPID_PUBLIC_KEY=//p' '${COMPOSE_DIR}/.env' 2>/dev/null | tail -n1" || true)"
  if [[ -n "$VAPID_PUBLIC" ]]; then
    echo "   Web Push: building with the VAPID public key from ${COMPOSE_DIR}/.env"
  else
    echo "   Web Push: no PUSH_VAPID_PUBLIC_KEY on the VM — building without notifications."
  fi

  # `VITE_API_BASE_URL=/api` (T066) — the only client-side configuration one origin needs. The
  # HTTP layer already defaults to a relative base, so this is configuration rather than code.
  # 010 T075 — FR-828. Set for UAT and unset for production, which is what keeps the marker out
  # of a production bundle entirely rather than hidden inside one. `vite.config.ts` turns this
  # into a build-time literal, so the element is dead code the bundler removes.
  VITE_UAT_MARKER="$([[ "$MYNET_ENV" == "uat" ]] && echo true || echo false)" \
  VITE_API_BASE_URL=/api PUSH_VAPID_PUBLIC_KEY="$VAPID_PUBLIC" \
    pnpm --filter @mynet/web build

  # ═══════════════════════════════════════════════════════════════════════════════════════════
  # 011 — **the administrative client is a SECOND build, and it is not optional.** The Caddyfile
  # serves `admin.{$APP_DOMAIN}` from `/srv/admin`; without this the administrative host answers
  # 404 for its document while every other check in this script passes, because nothing else
  # touches that origin.
  #
  # **No VAPID key**, deliberately. `apps/admin` registers no service worker and takes no
  # dependency on `@mynet/platform` (FR-923) — it needs none of the seven device capabilities —
  # so passing the key would build in a value nothing can read.
  # ═══════════════════════════════════════════════════════════════════════════════════════════
  VITE_API_BASE_URL=/api pnpm --filter @mynet/admin build
fi
[[ -d apps/web/dist ]] || { echo "ERROR: apps/web/dist is missing. Run without --no-build." >&2; exit 1; }
[[ -d apps/admin/dist ]] || { echo "ERROR: apps/admin/dist is missing. Run without --no-build." >&2; exit 1; }

echo "== [3/6] Sync source -> $REMOTE:$APP_DIR =="
rsync -az --delete \
  --exclude '.git' \
  --exclude '**/node_modules' \
  --exclude '**/dist' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '**/.env' \
  --exclude '**/.env.local' \
  --include '**/.env.example' \
  --exclude 'deploy/vm/backups' \
  --exclude 'deploy/vm/web' \
  --exclude 'deploy/vm/admin' \
  --exclude 'deploy/vm/maintenance/ON' \
  --exclude 'deploy/vm/maintenance/index.html' \
  ./ "${REMOTE}:${APP_DIR}/"
# ─────────────────────────────────────────────────────────────────────────────────────────────
# EVERY EXCLUDE HERE IS LOAD-BEARING, not tidiness:
#   .env         holds every secret and exists only on the VM; --delete would remove it.
#                **The patterns now match at ANY depth, and that is a fix.** This excluded only
#                `deploy/vm/.env`, so the REPOSITORY ROOT's `.env` and `.env.local` — the
#                developer's own password pepper, attempt-hash key and database URL, which
#                `apps/api/src/env.ts` loads from exactly there — were copied verbatim onto every
#                UAT and production VM on every deploy, in plaintext, on a publicly reachable
#                host. Both files exist in a normal working tree, so this was the behaviour and
#                not a hypothesis.
#   backups      are the artifacts FR-487 exists to keep.
#   web          is the built client, pushed separately below — under --delete it would be
#                removed a few seconds into every deploy, so Caddy would serve 404 for the
#                document while the API was perfectly healthy.
#   admin        the same, for the administrative client (013). It fails the same way and is
#                *less* likely to be noticed, because no attendee-facing check touches that host.
#   ON           is created on the VM and never exists locally, so --delete would take the site
#                OUT of maintenance during the exact window this exists to cover — while every
#                command still reported success.
#   index.html   the repo ships the TEMPLATE at this path; maintenance.sh renders the SERVED page
#                to the same path on the VM. Without the exclude, every sync would overwrite the
#                rendered page with the un-substituted template and discard an operator's
#                announced return time — invisibly, because the placeholder is an HTML comment.
# ─────────────────────────────────────────────────────────────────────────────────────────────

# The built client, pushed as its own tree so that `--delete` above cannot reach it.
rsync -az --delete apps/web/dist/ "${REMOTE}:${COMPOSE_DIR}/web/"
# The administrative client, likewise, into the directory `docker-compose.yml` mounts at
# /srv/admin. Two trees, because the two products are two origins (011, decision 37).
rsync -az --delete apps/admin/dist/ "${REMOTE}:${COMPOSE_DIR}/admin/"

echo "== [4/6] Ensure .env and the database are up =="
ssh "$REMOTE" "test -f ${COMPOSE_DIR}/.env" || {
  echo "ERROR: no .env on the VM at ${COMPOSE_DIR}/.env" >&2
  echo "First time: ssh in, 'cp ${COMPOSE_DIR}/.env.example ${COMPOSE_DIR}/.env' and fill it." >&2
  exit 1
}
ssh "$REMOTE" "cd ${COMPOSE_DIR} && docker compose up -d postgres"

echo "   waiting for PostgreSQL to report healthy..."
DB_OK="false"
for _ in $(seq 1 36); do
  # `|| true` because `pipefail` IS inherited by command-substitution subshells: without it one
  # transient ssh blip aborts the deploy instead of retrying, which is the loop's whole purpose.
  h="$(ssh "$REMOTE" "cd ${COMPOSE_DIR} && docker compose ps --format '{{.Health}}' postgres" 2>/dev/null | tr -d '[:space:]' || true)"
  if [[ "$h" == "healthy" ]]; then DB_OK="true"; break; fi
  sleep 5
done
[[ "$DB_OK" == "true" ]] || { echo "PostgreSQL did not become healthy in time." >&2; exit 1; }
echo "   PostgreSQL healthy."

if [[ "$DO_MIGRATE" == "true" ]]; then
  echo "== [4b/6] Applying migrations =="
  # ───────────────────────────────────────────────────────────────────────────────────────────
  # Run from the API image itself, so the migrations applied are the ones that shipped with the
  # build being deployed. Applying them from the operator's working tree would let a machine with
  # uncommitted changes move a production schema.
  #
  # **BEFORE the new API starts, and this ordering is what the rollback procedure depends on.**
  # `deploy/vm/README.md` section 6 states what happens when the schema has moved ahead of the
  # application (FR-489) — the answer is only bounded because migrations are additive here.
  # ───────────────────────────────────────────────────────────────────────────────────────────
  ssh "$REMOTE" "cd ${COMPOSE_DIR} && docker compose build api && docker compose run --rm api node dist/db/migrate.js"
fi

echo "== [5/6] Deploy the API and the proxy =="
if [[ "$DO_BUILD" == "true" ]]; then
  ssh "$REMOTE" "cd ${COMPOSE_DIR} && docker compose up -d --build api caddy"
else
  ssh "$REMOTE" "cd ${COMPOSE_DIR} && docker compose up -d api caddy"
fi
# ───────────────────────────────────────────────────────────────────────────────────────────
# **Dangling images older than a week only.** This was an unconditional `docker image prune -f`,
# which removed the *previous* `mynet-api:local` the moment a new one replaced it — so after any
# deploy there was no earlier image on the host to fall back to, and the README's rollback
# procedure had nothing to roll back to. Keeping a week's worth costs disk that `mem_limit` and
# the log caps have already made room for.
# ───────────────────────────────────────────────────────────────────────────────────────────
ssh "$REMOTE" "docker image prune -f --filter 'until=168h' >/dev/null 2>&1 || true"

echo "== [5b/6] Waiting for the API to actually SERVE =="
# ═══════════════════════════════════════════════════════════════════════════════════════════════
# **A STARTED CONTAINER IS NOT EVIDENCE.** `restart: unless-stopped` keeps a crash-looping
# container reporting as running, and the API must still reach PostgreSQL before it can answer
# anything. So this is a real request against `/ready` — the probe that queries the database
# (FR-482) — through the compose network, polled to a wall-clock bound.
#
# `/ready`, not `/health`: `/health` answers `ok` from a process that has never reached its
# database, which is precisely the deploy SC-412 exists to catch before it takes traffic.
# ═══════════════════════════════════════════════════════════════════════════════════════════════
CADDY_STATE="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" \
  "cd ${COMPOSE_DIR} && docker compose ps --format '{{.State}}' caddy" 2>/dev/null | tr -d '[:space:]' || true)"
if [[ "$CADDY_STATE" != *running* ]]; then
  # Caddy is what serves the maintenance page, so if it is down visitors are getting a bare
  # connection refusal — the exact failure the page exists to eliminate. That deserves its own
  # message rather than "the API never served", which would point at the wrong container.
  echo "ERROR: caddy is not running on ${MYNET_ENV} (state: '${CADDY_STATE:-unknown}')." >&2
  echo "  The maintenance page is NOT being served — visitors see a connection error." >&2
  echo "  Check: ssh ${REMOTE} 'cd ${COMPOSE_DIR} && docker compose logs caddy'" >&2
  exit 1
fi

API_OK="false"; API_ERR=""
DEADLINE=$(( $(date +%s) + 150 ))
while [[ $(date +%s) -lt $DEADLINE ]]; do
  # Bounded by WALL CLOCK, not by iteration count: an API that accepts the connection and then
  # stalls is exactly what this catches, and a per-attempt timeout is what makes the bound real.
  if API_ERR="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$REMOTE" \
        "cd ${COMPOSE_DIR} && docker compose exec -T caddy wget -q -T 5 -O /dev/null http://api:3000/ready" 2>&1)"; then
    API_OK="true"; break
  fi
  sleep 5
done
if [[ "$API_OK" != "true" ]]; then
  echo "ERROR: the API never reported ready within the time limit." >&2
  # The last attempt's stderr is kept and printed. Discarding it makes every distinct failure —
  # SSH dropped, service missing, DNS, connection refused, database unreachable — read as the same
  # sentence, which is the one thing an operator gating a window cannot use.
  [[ -n "$API_ERR" ]] && { echo "  Last error from the probe:" >&2; echo "$API_ERR" | sed 's/^/    /' >&2; }
  echo "  ${MYNET_ENV} stays in maintenance." >&2
  exit 1
fi
echo "   API is ready."

echo "== [6/6] Leaving maintenance [$MYNET_ENV] =="
# ONLY here: the flag is lifted after the updated API has itself answered a readiness request,
# never merely because a container started.
"${SCRIPT_DIR}/maintenance.sh" "$MYNET_ENV" off
MAINT_ON=false

# ═══════════════════════════════════════════════════════════════════════════════════════════════
# **THE SMOKE CHECK (SC-411) — and it now exists.**
#
# `security-headers.ts` and `security-headers.test.ts` both deferred the static document's headers
# to "a deployment smoke check (T080)". There was no such check anywhere: `strict-transport-
# security` was asserted ABSENT in the only environment tested and asserted present nowhere. SC-411
# requires the declared headers to be "verified by automated check rather than by eye", so a
# comment pointing at a check that does not exist is worse than no comment — it reads as coverage.
#
# Runs AFTER maintenance is lifted, because the maintenance page is a different response; this has
# to check what an attendee actually receives. Non-fatal: the deploy has already succeeded and the
# environment is serving, so a header regression is reported loudly rather than by rolling back a
# healthy release.
# ═══════════════════════════════════════════════════════════════════════════════════════════════
echo "== Smoke check: security headers on the served document (SC-411) =="
SMOKE_HEADERS="$(curl -sSI --max-time 20 "https://${APP_DOMAIN}/" 2>/dev/null || true)"
SMOKE_MISSING=()
for header in \
  'content-security-policy' \
  'x-content-type-options' \
  'referrer-policy' \
  'strict-transport-security'; do
  grep -qi "^${header}:" <<<"$SMOKE_HEADERS" || SMOKE_MISSING+=("$header")
done
# `img-src … data:` is what keeps every face in the directory from going blank (FR-481), and it
# is the directive a later tightening is most likely to remove.
grep -qiE '^content-security-policy:.*img-src[^;]*data:' <<<"$SMOKE_HEADERS" \
  || SMOKE_MISSING+=("content-security-policy: img-src must permit data: (FR-481)")

if [[ ${#SMOKE_MISSING[@]} -gt 0 ]]; then
  echo "WARNING: the served document is missing declared security headers (SC-411, FR-480):" >&2
  printf '  %s\n' "${SMOKE_MISSING[@]}" >&2
  echo "  ${MYNET_ENV} is serving; this is a header regression, not a failed deploy." >&2
else
  echo "   every declared header is present, and img-src permits data:."
fi

ssh "$REMOTE" "cd ${COMPOSE_DIR} && docker compose ps"

if [[ "$DO_LOGS" == "true" ]]; then
  echo "== Tailing logs (Ctrl-C to stop) =="
  ssh -t "$REMOTE" "cd ${COMPOSE_DIR} && docker compose logs -f --tail 80 api caddy"
fi

echo "== Done [$MYNET_ENV]. https://${APP_DOMAIN} =="
