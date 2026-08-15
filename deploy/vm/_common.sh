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

  # T007 (010) — checked before the data-separation guard, because a guard comparing unset
  # values reports success (FR-836).
  mynet::require_env_values || return 1

  # T069a — checked on EVERY load, before any script does anything (FR-485).
  mynet::require_data_separation || return 1
}

# ═══════════════════════════════════════════════════════════════════════════════════════════════
# T007 (010) — **A MISSING VALUE FAILS AT THE POINT THAT NAMES IT** (FR-836, SC-817).
#
# This is register entry 17's lesson, written as code. That entry records two authentication
# secrets that were never set in the deployment workflow at all, and were — in its own words —
# "invisible only because `db-branch` failed first". Both would have failed one line further on,
# with an error naming something else entirely.
#
# ───────────────────────────────────────────────────────────────────────────────────────────────
# **IT REPORTS EVERY MISSING VALUE, NOT THE FIRST ONE.** Failing on the first turns a single
# five-minute fix into one round trip per blank line, and an operator who has just filled in a
# value and been refused again learns nothing about how much further there is to go.
#
# **AND IT RUNS BEFORE `require_data_separation`, WHICH IS THE SUBTLE PART.** That guard compares
# UAT's `DATABASE_NAME` against production's and refuses when they collide. With both unset it
# compares an empty string to an empty string, finds them equal — and refuses with a message about
# production data, for an environment that simply has not been filled in. Worse, if only one is
# unset it finds them *different* and reports success: a guard carrying FR-485 would be passing
# on a configuration it cannot actually check.
# ───────────────────────────────────────────────────────────────────────────────────────────────
#
# `APP_DOMAIN` and `SUBSCRIPTION` are deliberately NOT here. Each is required by a subset of
# operations rather than by all of them, and each has its own guard that says so at the moment it
# matters — `mynet::require_domain` and `mynet::require_subscription`. Production leaves both
# blank on purpose (FR-823, FR-894), and a blanket requirement here would make every production
# script refuse for the wrong reason.
# ═══════════════════════════════════════════════════════════════════════════════════════════════
mynet::require_env_values() {
  local -a missing=()
  local key

  # Every value any script needs to address the machine at all. Ordered as they appear in the
  # env file, so the report reads like the file the operator is about to edit.
  for key in RESOURCE_GROUP VM_NAME LOCATION VM_SIZE ADMIN_USER DATABASE_HOST DATABASE_NAME; do
    [[ -n "${!key:-}" ]] || missing+=("$key")
  done

  [[ ${#missing[@]} -eq 0 ]] && return 0

  {
    echo "ERROR: deploy/vm/envs/${MYNET_ENV}.env is missing ${#missing[@]} required value(s):"
    echo
    for key in "${missing[@]}"; do
      printf '  %s=\n' "$key"
    done
    cat <<EOF

Nothing has been provisioned, synced, deployed or backed up.

FR-836: a missing required value must fail HERE, naming itself — not later at a point that names
something else. Register entry 17 records two authentication secrets that were never set in the
deployment workflow and were invisible only because an unrelated step failed first.

Fix: fill the value(s) above in deploy/vm/envs/${MYNET_ENV}.env.
     Secrets do not belong in that file — they live in the .env beside the compose file ON THE
     VM. See deploy/vm/.env.example, where every row states what a blank value costs.
EOF
  } >&2

  return 1
}

mynet::require_az() {
  command -v az >/dev/null || { echo "ERROR: az CLI missing." >&2; return 1; }
  az account show >/dev/null 2>&1 || { echo "ERROR: not logged in. Run: az login" >&2; return 1; }
  mynet::require_subscription
}

# ═══════════════════════════════════════════════════════════════════════════════════════════════
# Refuse to run against the wrong subscription. This VERIFIES rather than switching: silently
# calling `az account set` would leave the operator's shell pointed at production long after the
# script exits.
#
# ───────────────────────────────────────────────────────────────────────────────────────────────
# **T007 (010) — A BLANK SUBSCRIPTION IS NOW A REFUSAL, WHERE IT USED TO BE A NO-OP** (FR-821).
#
# It returned 0 when the env file left `SUBSCRIPTION` blank — "use whatever is active" — which is
# precisely what FR-821 forbids: *"A script MUST NOT inherit whatever subscription happens to be
# active."* That default was correct while no subscription had been named and the alternative was
# a script nobody could run; v3.4.0 named one, so the default is now the hazard it always was.
#
# It is not theoretical. On the machine this was implemented on, `az account show` returned a
# personal subscription and not the project's — so an inherited default would have provisioned
# MyNet's UAT environment into somebody's own account, successfully and silently.
#
# **Production refuses here, and that is the intended outcome** — `envs/prod.env` leaves
# `SUBSCRIPTION` blank under FR-894, because feature 010 provisions UAT and nothing else.
# ───────────────────────────────────────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════════════════════
mynet::require_subscription() {
  if [[ -z "${SUBSCRIPTION:-}" ]]; then
    cat >&2 <<EOF
ERROR: no SUBSCRIPTION set for '${MYNET_ENV}' (deploy/vm/envs/${MYNET_ENV}.env).

FR-821 requires every cloud call to be pinned to a subscription BY IDENTIFIER, and forbids a
script inheriting whatever subscription happens to be active. Running without one would provision
into \`az account show\`'s current answer, which is not a decision anybody made.
EOF
    if [[ "${MYNET_ENV}" == "prod" ]]; then
      cat >&2 <<EOF

This is expected for production. Feature 010 provisions UAT and nothing else (FR-894), so
envs/prod.env deliberately leaves this blank. Filling it in is the first half of provisioning
production — a decision to record in the constitution, not a line to complete in passing.
EOF
    fi
    return 1
  fi

  # FR-821's second half: refuse when the named subscription is not *accessible*. Checked against
  # the tenant rather than against the active selection, so "you are signed in to the wrong
  # account" is distinguishable from "you have the right account and the wrong one selected" —
  # two problems with completely different fixes, which the old single message conflated.
  if ! az account list --all --query "[?id=='${SUBSCRIPTION}'].id" -o tsv 2>/dev/null | grep -q .; then
    cat >&2 <<EOF
ERROR: subscription ${SUBSCRIPTION} is not accessible to the signed-in account.

  signed in as: $(az account show --query user.name -o tsv 2>/dev/null || echo '<nobody>')

Either this account has no access to it, or you are signed in to the wrong tenant.
  Fix:  az login   (then re-run)
EOF
    return 1
  fi

  local active
  active="$(az account show --query id -o tsv 2>/dev/null)"
  [[ "$active" == "$SUBSCRIPTION" ]] && return 0

  echo "ERROR: wrong subscription selected for '${MYNET_ENV}'." >&2
  echo "  expected: ${SUBSCRIPTION}" >&2
  echo "  active:   ${active:-<none>}  ($(az account show --query name -o tsv 2>/dev/null))" >&2
  echo "  Fix:      az account set --subscription ${SUBSCRIPTION}" >&2
  return 1
}

# ═══════════════════════════════════════════════════════════════════════════════════════════════
# T007 (010) — **every cloud call pinned to the configured subscription, by identifier** (FR-821).
#
# `require_subscription` above already refuses when the active selection differs, which makes an
# unpinned call correct *in practice*. This makes it correct *by construction*, and the difference
# shows up in the one case the guard cannot see: anything that changes the active subscription
# after the check — a concurrent `az account set` in another shell, an `az login` triggered by a
# token refresh — silently retargets every call that follows.
#
# A name would not do. Subscription names are mutable and are not unique across tenants; the
# identifier is the only stable handle, which is why v3.4.0 (decision 32) records the id and not
# just "LinaSys-DevEnv".
#
# Use `mynet::az` for every new cloud call. Existing call sites are being converted as the
# scripts that own them are exercised — `provision-vm.sh` first, since it runs first.
# ═══════════════════════════════════════════════════════════════════════════════════════════════
mynet::az() {
  # Refuses rather than passing `--subscription ''`, which az accepts as "no preference" and
  # resolves against the active account — the exact inheritance FR-821 forbids, reintroduced by
  # the helper written to prevent it. Every caller reaches here after `require_az`, so this is a
  # guard against a future caller that does not.
  [[ -n "${SUBSCRIPTION:-}" ]] || {
    echo "ERROR: mynet::az called with no SUBSCRIPTION set (FR-821)." >&2
    return 1
  }
  az "$@" --subscription "$SUBSCRIPTION"
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
  ip="$(mynet::az vm show -d -g "$RESOURCE_GROUP" -n "$VM_NAME" --query publicIps -o tsv 2>/dev/null)"
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
