#!/usr/bin/env bash
# Put an environment behind a maintenance page, take it out again, or ask which it is.
# Run from your DEV MACHINE; it acts on the VM over SSH.
#
#   ./maintenance.sh <uat|prod> on [--until "<text>"]
#   ./maintenance.sh <uat|prod> off
#   ./maintenance.sh <uat|prod> status
#   ./maintenance.sh <uat|prod> verify        # asserts 503 + Retry-After with curl, not by eye
#
# ═══════════════════════════════════════════════════════════════════════════════════════════════
# **THE FLAG IS A FILE, AND THAT IS THE DESIGN.**
#
# Caddy tests for /srv/maintenance/ON on every request (see the Caddyfile). So entering and
# leaving maintenance is a `touch` and an `rm`: no config reload, no container recreate, no
# restart. It also means the page keeps serving while the API is stopped, rebuilding or
# crash-looping — because the matcher runs in front of both the file server and the proxy.
# ═══════════════════════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "${SCRIPT_DIR}/_common.sh"
mynet::load_env "${1:-}"; shift || true

ACTION="${1:-status}"; shift || true

UNTIL_TEXT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --until)
      [[ $# -ge 2 ]] || { echo "ERROR: --until needs a value." >&2; exit 2; }
      UNTIL_TEXT="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 2 ;;
  esac
done

mynet::require_az
REMOTE="$(mynet::remote)"
FLAG="${COMPOSE_DIR}/maintenance/ON"
PAGE="${COMPOSE_DIR}/maintenance/index.html"

case "$ACTION" in
  on)
    # ─────────────────────────────────────────────────────────────────────────────────────────
    # The page is rendered from the LOCAL working tree on every run, then the flag is raised.
    #
    # That ordering matters: raising the flag first would serve the *previous* run's page — with
    # a stale return time — for as long as the render took.
    # ─────────────────────────────────────────────────────────────────────────────────────────
    RENDERED="$(mktemp)"
    trap 'rm -f "$RENDERED"' EXIT

    if [[ -n "$UNTIL_TEXT" ]]; then
      # Substituted into the comment placeholder, so an operator who omits `--until` publishes a
      # page that reads correctly rather than one containing the word "RETURN_TIME".
      python3 - "${SCRIPT_DIR}/maintenance/index.html" "$UNTIL_TEXT" > "$RENDERED" <<'PY'
import html, sys
template = open(sys.argv[1], encoding="utf-8").read()
until = html.escape(sys.argv[2])
marker = "      <p>Please try again in a few minutes.</p>"
replacement = f'      <p>We expect to be back by <span class="until">{until}</span>.</p>'
sys.stdout.write(template.replace(marker, replacement, 1))
PY
    else
      cp "${SCRIPT_DIR}/maintenance/index.html" "$RENDERED"
    fi

    scp -q "$RENDERED" "${REMOTE}:${PAGE}"
    ssh "$REMOTE" "touch '${FLAG}'"
    echo "Maintenance ON for ${MYNET_ENV}. Visitors get 503 with a Retry-After."
    # ─────────────────────────────────────────────────────────────────────────────────────────
    # **An `if`, NOT `[[ -n … ]] && echo …`** — and this is the second time this project has
    # been bitten by that AND-list.
    #
    # This was the last command in the branch, and the branch's `case` is the last statement in
    # the file. With no `--until`, the test fails, the AND-list's status becomes the SCRIPT's
    # exit status, and `deploy.sh` — which calls this under `set -e` at step [1b/6] — aborted.
    # **Every deploy that did not pass `--until` failed immediately after raising the
    # maintenance flag**, leaving the environment behind a 503 with "DEPLOY FAILED" printed.
    #
    # `backup.sh` documents the identical trap on its own announcement line and guards against
    # it. This is the same trap, in the sibling script, un-guarded.
    # ─────────────────────────────────────────────────────────────────────────────────────────
    if [[ -n "$UNTIL_TEXT" ]]; then
      echo "  Announced return: ${UNTIL_TEXT}"
    fi
    ;;

  off)
    # A pure `rm`. Nothing restarts, so leaving maintenance cannot itself fail the way entering
    # it can.
    ssh "$REMOTE" "rm -f '${FLAG}'"
    echo "Maintenance OFF for ${MYNET_ENV}."
    ;;

  status)
    if ssh "$REMOTE" "test -f '${FLAG}'"; then
      echo "${MYNET_ENV}: maintenance is ON."
    else
      echo "${MYNET_ENV}: maintenance is off."
    fi
    ;;

  verify)
    # ═════════════════════════════════════════════════════════════════════════════════════════
    # T073 — **VERIFIED WITH `curl -sI`, NEVER BY EYE.**
    #
    # A maintenance page that renders perfectly while answering **200** looks completely correct
    # in a browser and silently defeats external monitoring: every uptime check reports the site
    # as healthy for the whole window, and a genuine outage during it is invisible. The status
    # code and the `Retry-After` header are the only signal monitoring gets, so they are what is
    # asserted.
    # ═════════════════════════════════════════════════════════════════════════════════════════
    mynet::require_domain
    echo "== Verifying the maintenance response for ${MYNET_ENV} =="
    HEADERS="$(curl -sSI --max-time 15 "https://${APP_DOMAIN}/" || true)"
    printf '%s\n' "$HEADERS" | sed 's/^/  /'

    STATUS="$(printf '%s' "$HEADERS" | head -1 | awk '{print $2}')"
    if [[ "$STATUS" != "503" ]]; then
      echo "FAIL: expected 503, got '${STATUS:-<none>}'." >&2
      echo "      A page that renders correctly while answering 200 defeats every uptime check." >&2
      exit 1
    fi
    if ! printf '%s' "$HEADERS" | grep -qi '^retry-after:'; then
      echo "FAIL: no Retry-After header. Monitoring cannot tell a planned window from an outage." >&2
      exit 1
    fi
    echo "PASS: 503 with Retry-After."
    ;;

  *)
    echo "Usage: $(basename "$0") <uat|prod> {on [--until \"<text>\"]|off|status|verify}" >&2
    exit 2 ;;
esac
