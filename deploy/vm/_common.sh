#!/usr/bin/env bash
# Shared helpers for the env-aware VM deployment scripts. SOURCE this; do not execute.
#
# Provides: mynet::load_env, mynet::require_az, mynet::resolve_ip, mynet::remote.
#
# Modelled on mission-control's deploy/vm/_common.sh, which is proven in another project by the
# same owner (research D9). Adapted rather than copied: this stack is PostgreSQL plus a static
# client behind Caddy, not SQL Server behind an application that serves its own assets.

# Directory this helper lives in (deploy/vm), resolved even when sourced.
MYNET_VM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mynet::load_env() {
  local env="${1:-}"
  case "$env" in
    uat|prod) ;;
    *) echo "ERROR: environment must be 'uat' or 'prod' (got '${env:-<none>}')." >&2; return 2 ;;
  esac
  local file="${MYNET_VM_DIR}/envs/${env}.env"
  [[ -f "$file" ]] || { echo "ERROR: missing env file $file" >&2; return 1; }
  set -a
  # The directive must sit immediately before the `.` itself — on the previous line it attached
  # to `set -a` instead and the warning stood.
  # shellcheck source=/dev/null
  . "$file"
  set +a
  MYNET_ENV="$env"
  APP_DIR="/home/${ADMIN_USER}/app"
  COMPOSE_DIR="${APP_DIR}/deploy/vm"
  export MYNET_ENV SUBSCRIPTION RESOURCE_GROUP VM_NAME LOCATION VM_SIZE APP_DOMAIN ADMIN_USER
  export APP_DIR COMPOSE_DIR DATABASE_HOST DATABASE_NAME

  # T069a — checked on EVERY load, before any script does anything (FR-485).
  mynet::require_data_separation || return 1
}

mynet::require_az() {
  command -v az >/dev/null || { echo "ERROR: az CLI missing." >&2; return 1; }
  az account show >/dev/null 2>&1 || { echo "ERROR: not logged in. Run: az login" >&2; return 1; }
  mynet::require_subscription
}

# Refuse to run against the wrong subscription. This VERIFIES rather than switching: silently
# calling `az account set` would leave the operator's shell pointed at production long after the
# script exits. A no-op when the env file leaves SUBSCRIPTION blank, which is the "use whatever is
# active" behaviour an unprovisioned environment needs.
mynet::require_subscription() {
  [[ -n "${SUBSCRIPTION:-}" ]] || return 0
  local active
  active="$(az account show --query id -o tsv 2>/dev/null)"
  [[ "$active" == "$SUBSCRIPTION" ]] && return 0
  echo "ERROR: wrong subscription for '${MYNET_ENV}'." >&2
  echo "  expected: ${SUBSCRIPTION}" >&2
  echo "  active:   ${active:-<none>}  ($(az account show --query name -o tsv 2>/dev/null))" >&2
  echo "  Fix:      az account set --subscription ${SUBSCRIPTION}" >&2
  return 1
}

# ═══════════════════════════════════════════════════════════════════════════════════════════════
# T069a — **UAT MUST NEVER POINT AT PRODUCTION DATA** (FR-485, and 001's FR-067 carried forward).
#
# This is an ENFORCEMENT, not a convention, and the distinction is the whole task. Two separate
# env files are a convention: they describe an intention, and nothing checks that the intention
# survived somebody debugging a UAT problem against production's connection string "just to see".
# 001 satisfied its equivalent with a mechanism — a `preview-base` branch that was permanently
# data-free — and v3.0.0 carries FR-067 forward to bind UAT.
#
# So this resolves BOTH environments' database coordinates from their committed env files and
# refuses to run any UAT script when they collide. It names the resolved host in the error,
# because "they collide" is not actionable and "uat resolves to <host>, which is production's" is.
#
# **It fires on `load_env`, before any script has done anything** — provisioned, synced, deployed
# or backed up. A guard that ran at deploy time would already have rsynced a repository onto a
# machine pointed at production.
# ═══════════════════════════════════════════════════════════════════════════════════════════════
mynet::require_data_separation() {
  # Production may legitimately be "itself". The rule is one-directional: UAT must not be
  # production, and checking it in both directions would make production unusable.
  [[ "${MYNET_ENV}" == "uat" ]] || return 0

  local prod_file="${MYNET_VM_DIR}/envs/prod.env"
  [[ -f "$prod_file" ]] || return 0

  # Read production's values WITHOUT sourcing the file into this shell — sourcing it would
  # overwrite the UAT values that have just been loaded, which is the exact accident being
  # guarded against, produced by the guard itself.
  local prod_host prod_name prod_vm
  prod_host="$(grep -E '^DATABASE_HOST=' "$prod_file" | head -1 | cut -d= -f2-)"
  prod_name="$(grep -E '^DATABASE_NAME=' "$prod_file" | head -1 | cut -d= -f2-)"
  prod_vm="$(grep -E '^VM_NAME=' "$prod_file" | head -1 | cut -d= -f2-)"

  # ─────────────────────────────────────────────────────────────────────────────────────────
  # The host alone is not the test, and this is the subtle part.
  #
  # Both environments address their database as `postgres` — the compose service name — on their
  # own private, loopback-only network. The hosts are therefore *identical strings* that name two
  # completely different machines, and a naive host comparison would refuse every legitimate UAT
  # run on day one.
  #
  # What actually separates them is the VM. So the rule is: a UAT database is production's when
  # it resolves to the same host AND the same database name AND the same machine. Any external or
  # shared host — the case this exists for — differs in the first, and a copied connection string
  # differs in the second.
  # ─────────────────────────────────────────────────────────────────────────────────────────
  local same_host=false same_name=false same_vm=false
  [[ "${DATABASE_HOST:-}" == "$prod_host" ]] && same_host=true
  [[ "${DATABASE_NAME:-}" == "$prod_name" ]] && same_name=true
  [[ "${VM_NAME:-}" == "$prod_vm" ]] && same_vm=true

  if [[ "$same_name" == "true" ]]; then
    cat >&2 <<EOF
ERROR: UAT resolves to production's DATABASE NAME.

  uat  DATABASE_NAME=${DATABASE_NAME:-<unset>}   (envs/uat.env)
  prod DATABASE_NAME=${prod_name:-<unset>}       (envs/prod.env)

FR-485 and 001's FR-067 forbid a non-production environment being connected to real attendee
data, and require the tooling to REFUSE rather than merely be configured not to. Nothing has
been provisioned, synced, deployed or backed up.

Fix: give UAT its own database name in deploy/vm/envs/uat.env.
EOF
    return 1
  fi

  if [[ "$same_host" == "true" && "$same_vm" == "true" ]]; then
    cat >&2 <<EOF
ERROR: UAT resolves to production's DATABASE HOST on production's VM.

  host: ${DATABASE_HOST:-<unset>}
  vm:   ${VM_NAME:-<unset>}   (identical to envs/prod.env)

Two environments sharing a machine is not two environments (FR-484). Nothing has been changed.

Fix: give UAT its own VM_NAME in deploy/vm/envs/uat.env.
EOF
    return 1
  fi

  return 0
}

# ═══════════════════════════════════════════════════════════════════════════════════════════════
# The SECOND half of FR-485: what the VM is actually configured with.
#
# `require_data_separation` above compares the two COMMITTED env files, and those values never
# reach a container — `docker-compose.yml` interpolates `DATABASE_NAME` and `DATABASE_HOST` from
# the uncommitted `.env` ON THE VM, which is excluded from rsync and which the committed files
# have no influence over. So the committed check, on its own, compares two inert files to each
# other: exactly the convention it claims to replace.
#
# This closes it by reading what is in force. It runs after SSH is available, so it is called by
# the scripts that connect rather than by `load_env`.
# ═══════════════════════════════════════════════════════════════════════════════════════════════
mynet::require_remote_data_separation() {
  [[ "${MYNET_ENV}" == "uat" ]] || return 0

  local remote="$1"
  local prod_file="${MYNET_VM_DIR}/envs/prod.env"
  [[ -f "$prod_file" ]] || return 0

  local prod_name live_name
  prod_name="$(grep -E '^DATABASE_NAME=' "$prod_file" | head -1 | cut -d= -f2-)"
  [[ -n "$prod_name" ]] || return 0

  # `|| true`: a VM with no `.env` yet is a first deploy, which `deploy.sh` reports on its own.
  live_name="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$remote" \
    "grep -E '^DATABASE_NAME=' ${COMPOSE_DIR}/.env 2>/dev/null | head -1 | cut -d= -f2-" 2>/dev/null | tr -d '[:space:]' || true)"

  [[ -n "$live_name" ]] || return 0

  if [[ "$live_name" == "$prod_name" ]]; then
    cat >&2 <<EOF
ERROR: the UAT VM's OWN .env names production's database.

  ${COMPOSE_DIR}/.env on ${remote}:  DATABASE_NAME=${live_name}
  deploy/vm/envs/prod.env:            DATABASE_NAME=${prod_name}

This is the value the running containers actually use — the committed env files do not reach
them. FR-485 and 001's FR-067 forbid a non-production environment being connected to real
attendee data, and require the tooling to REFUSE. Nothing has been deployed or backed up.

Fix: correct DATABASE_NAME in the .env on that VM.
EOF
    return 1
  fi

  return 0
}

mynet::resolve_ip() {
  local ip
  ip="$(az vm show -d -g "$RESOURCE_GROUP" -n "$VM_NAME" --query publicIps -o tsv 2>/dev/null)"
  [[ -n "$ip" ]] || {
    echo "ERROR: could not resolve public IP for $VM_NAME in $RESOURCE_GROUP (provisioned?)." >&2
    return 1
  }
  printf '%s' "$ip"
}

# Fails LOUDLY when the IP cannot be resolved.
#
# Written as a one-liner — `printf '%s@%s' "$ADMIN_USER" "$(mynet::resolve_ip)"` — the command
# substitution's non-zero status is discarded because `printf` itself succeeds, so `set -e` never
# fires and callers receive the well-formed but useless "azureuser@". Every later ssh then fails
# for a reason the caller cannot see. Recorded in mission-control's own deep review; not repeated.
mynet::remote() {
  local ip
  ip="$(mynet::resolve_ip)" || return 1
  printf '%s@%s' "$ADMIN_USER" "$ip"
}

# Refuses when the environment has no domain yet. Caddy cannot obtain a certificate without a
# resolving A record (FR-479), and the failure it produces otherwise is an ACME error deep in a
# container log rather than a sentence naming the missing decision.
mynet::require_domain() {
  [[ -n "${APP_DOMAIN:-}" ]] && return 0
  cat >&2 <<EOF
ERROR: no APP_DOMAIN set for '${MYNET_ENV}' (deploy/vm/envs/${MYNET_ENV}.env).

Caddy obtains its certificate from Let's Encrypt, which requires a public A record resolving to
this VM (FR-479). Without one it cannot serve HTTPS at all, and the client cannot sign in --
the session cookie is Secure in every deployed environment (FR-478).

This is an owner decision the specification records as open: no domain has been registered.
EOF
  return 1
}
