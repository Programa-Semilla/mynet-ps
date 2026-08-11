#!/usr/bin/env bash
# Provision the fixed-cost VM for a MyNet environment. Run from your DEV MACHINE (needs az).
#
# Usage:  ./provision-vm.sh <uat|prod>
#
# Cost target (~fixed per month, per environment): Standard_B2als_v2 ~$30-38 + 64GB StandardSSD
# ~$5 + static IP ~$4. Fixed cost with no per-request metering is why the owner chose this pattern
# over a managed database (research D9) — the trade is recorded in plan.md's Complexity Tracking.
#
# The size is read from envs/<env>.env and preflighted below (FR-822) rather than assumed here.
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"
mynet::load_env "${1:-}"
mynet::require_az

# ═══════════════════════════════════════════════════════════════════════════════════════════════
# T008 (010) — **the machine-size preflight** (FR-822).
#
# Without it, an unavailable or restricted size fails inside `az vm create`, several steps and one
# resource group later, as `SkuNotAvailable` — an error that names neither the region nor a
# remedy, at a point where a resource group has already been created. This asks the question
# first, and answers it in a sentence somebody can act on.
#
# ───────────────────────────────────────────────────────────────────────────────────────────────
# **`az rest` rather than `az vm list-skus`, and the reason is 18x.** The CLI command pages the
# whole SKU catalogue and filters client-side, taking ~70 seconds even with `--size`; the
# underlying REST endpoint accepts a server-side `$filter` on location and answers in under four.
# A preflight nobody is willing to wait for is a preflight somebody comments out.
#
# **`restrictions` is the field that matters, not presence.** A size under a capacity-growth
# restriction is *listed* — it simply cannot be created — so checking that the name appears would
# report success on exactly the case this exists to catch. That is why the query asks for both.
# ───────────────────────────────────────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════════════════════
mynet::require_vm_size() {
  local api="2021-07-01" sku
  echo "== Preflight: is ${VM_SIZE} available in ${LOCATION}? =="

  sku="$(az rest --method get \
    --url "https://management.azure.com/subscriptions/${SUBSCRIPTION}/providers/Microsoft.Compute/skus?api-version=${api}&\$filter=location%20eq%20'${LOCATION}'" \
    --query "value[?name=='${VM_SIZE}' && resourceType=='virtualMachines'] | [0]" -o json 2>/dev/null)"

  if [[ -z "$sku" || "$sku" == "null" ]]; then
    cat >&2 <<EOF

ERROR: machine size ${VM_SIZE} does not exist in ${LOCATION}.

  size:   ${VM_SIZE}     (deploy/vm/envs/${MYNET_ENV}.env, VM_SIZE)
  region: ${LOCATION}    (deploy/vm/envs/${MYNET_ENV}.env, LOCATION)

Nothing has been created. FR-822 requires this to fail here rather than inside \`az vm create\`
as a SkuNotAvailable naming neither the region nor a fix.

See what this subscription can actually create in that region:
  az vm list-skus --subscription ${SUBSCRIPTION} -l ${LOCATION} --size Standard_B --all -o table
EOF
    return 1
  fi

  # An empty array is the pass. Anything in it is a reason the size cannot be created here, and
  # the reason is worth printing verbatim — "NotAvailableForSubscription" and a zone restriction
  # have completely different fixes.
  local restrictions
  restrictions="$(printf '%s' "$sku" | python3 -c 'import json,sys; print(json.dumps(json.load(sys.stdin).get("restrictions", [])))')"

  if [[ "$restrictions" != "[]" ]]; then
    cat >&2 <<EOF

ERROR: machine size ${VM_SIZE} is RESTRICTED in ${LOCATION} for this subscription.

  size:         ${VM_SIZE}
  region:       ${LOCATION}
  subscription: ${SUBSCRIPTION}
  restrictions: ${restrictions}

Nothing has been created. A restricted size is listed by Azure but cannot be created, so this
would otherwise have failed several steps later with a resource group already in place.

Fixes, in the order worth trying:
  1. Choose another size in deploy/vm/envs/${MYNET_ENV}.env (VM_SIZE). Two vCPU and 4 GiB is the
     operating envelope this stack was sized for.
  2. Choose another region (LOCATION) — but note both environments are meant to sit in one
     region, and moving one is a decision rather than a workaround.
  3. Request a quota increase, if the restriction names a quota rather than capacity.
EOF
    return 1
  fi

  echo "   ${VM_SIZE} is available in ${LOCATION} with no restrictions."
}

mynet::require_vm_size

DISK_GB="${OS_DISK_GB:-64}"

# ─────────────────────────────────────────────────────────────────────────────────────────────
# The public IP to lock the SSH rule to. Override with MYIP=... ; otherwise ask several services,
# because any one of them can be down and a provisioning script that fails on somebody else's
# outage is a bad script.
# ─────────────────────────────────────────────────────────────────────────────────────────────
MYIP="${MYIP:-}"
for _svc in https://api.ipify.org https://checkip.amazonaws.com https://ifconfig.me; do
  [[ -n "$MYIP" ]] && break
  # `|| true` INSIDE the substitution. `pipefail` IS inherited by command-substitution
  # subshells, so a failing `curl -f` made this ASSIGNMENT fail and `set -e` killed the script
  # on the FIRST service — the second and third were never tried and the friendly
  # "Re-run with MYIP=…" message below was unreachable. That is the opposite of what the
  # comment above promises, and it exits with curl's bare status 7.
  MYIP="$(curl -fsS --max-time 8 "$_svc" 2>/dev/null | tr -d '[:space:]' || true)"
done
[[ -n "$MYIP" ]] || { echo "Could not determine public IP. Re-run with MYIP=<your.ip>" >&2; exit 1; }

echo "== Provisioning $VM_NAME ($VM_SIZE) in $RESOURCE_GROUP / $LOCATION [$MYNET_ENV] =="
echo "   SSH will be locked to your current IP: $MYIP"

# The az CLI encodes --custom-data as latin-1, so a stray non-ASCII character anywhere in
# cloud-init.yaml (a comment counts) aborts `az vm create` with an opaque codec error naming no
# file. Fail here instead, pointing at the exact offending byte.
CLOUD_INIT="$(cd "$(dirname "$0")" && pwd)/cloud-init.yaml"
command -v python3 >/dev/null || { echo "python3 is required." >&2; exit 1; }
python3 - "$CLOUD_INIT" <<'PY' || exit 1
import sys
path = sys.argv[1]
text = open(path, encoding="utf-8").read()
bad = [(i, c) for i, c in enumerate(text) if ord(c) > 127]
if bad:
    i, c = bad[0]
    print(f"ERROR: {path} must be ASCII only (az encodes --custom-data as latin-1).", file=sys.stderr)
    print(f"  first offending char: U+{ord(c):04X} {c!r} at position {i}", file=sys.stderr)
    print(f"  context: ...{text[max(0, i - 40):i + 20]}...", file=sys.stderr)
    sys.exit(1)
PY

mynet::az group create -n "$RESOURCE_GROUP" -l "$LOCATION" -o none

mynet::az vm create \
  -g "$RESOURCE_GROUP" -n "$VM_NAME" -l "$LOCATION" \
  --image Ubuntu2404 \
  --size "$VM_SIZE" \
  --admin-username "$ADMIN_USER" \
  --generate-ssh-keys \
  --public-ip-sku Standard \
  --os-disk-size-gb "$DISK_GB" \
  --storage-sku StandardSSD_LRS \
  --custom-data "$CLOUD_INIT" \
  --nsg-rule NONE

# ═════════════════════════════════════════════════════════════════════════════════════════════
# `az vm create` makes an NSG named "${VM_NAME}NSG". Web is opened to the world; SSH only to the
# operator's current address.
#
# ─────────────────────────────────────────────────────────────────────────────────────────────
# **THE WEB RULE IS NOW A DECISION, AND IT IS "OPEN TO THE WORLD"** (010, FR-829).
#
# This comment used to say the opposite — that restricting it was an open question (register
# entry 14), and that the change would be this rule's `--source-address-prefixes`. **Register
# entry 14 was closed by constitution v3.4.0 (standing decision 30), in the direction of leaving
# it open**, and FR-829 now forbids putting any credential, allowlist or other access restriction
# in front of UAT.
#
# The reasoning is worth carrying, because "lock it down" will keep sounding like the careful
# option: an allowlist and basic auth were both considered and **rejected as safer-looking but
# worse.** Each disables the validation this environment exists for — service-worker
# registration, Web Push, a physical-device test on cellular — to buy secrecy over data that does
# not need it. **001's FR-067 is satisfied by the DATA rather than by the door**: UAT carries
# seeded content and accounts created against UAT, and nothing that must be kept from a stranger
# is ever present.
#
# `apps/api/tests/unit/deployment-config.test.ts` asserts the absence, so adding a restriction
# "temporarily" fails the build rather than quietly breaching a requirement.
# ─────────────────────────────────────────────────────────────────────────────────────────────
#
# **The database is NOT in this list and must never be.** PostgreSQL binds to 127.0.0.1 in
# docker-compose.yml (FR-486), so there is nothing here to open — which is the point: the
# protection is the bind address, not a firewall rule somebody could widen.
# ═════════════════════════════════════════════════════════════════════════════════════════════
mynet::az network nsg rule create -g "$RESOURCE_GROUP" --nsg-name "${VM_NAME}NSG" -n allow-web \
  --priority 1000 --direction Inbound --access Allow --protocol Tcp \
  --destination-port-ranges 80 443 >/dev/null
mynet::az network nsg rule create -g "$RESOURCE_GROUP" --nsg-name "${VM_NAME}NSG" -n allow-ssh \
  --priority 1100 --direction Inbound --access Allow --protocol Tcp \
  --source-address-prefixes "${MYIP}/32" --destination-port-ranges 22 >/dev/null

# Printed rather than hardcoded anywhere: the address belongs to Azure, and writing it into a
# committed file makes it a thing that can be stale and wrong.
IP="$(mynet::resolve_ip)"
cat <<EOF

== Done [$MYNET_ENV] ==
VM public IP: $IP

Next:
  1. DNS: point an A record  ${APP_DOMAIN:-<APP_DOMAIN is unset - see envs/${MYNET_ENV}.env>}  ->  $IP
     Caddy needs it BEFORE it can issue a certificate (FR-479).
  2. SSH in and fill the secrets:
        ssh ${ADMIN_USER}@${IP}
        cd ~/app/deploy/vm && cp .env.example .env && nano .env
     (The directory appears after the first deploy syncs it, or scp deploy/vm across.)
  3. From your dev machine:
        ./deploy.sh ${MYNET_ENV} --migrate
  4. Install the nightly backup, ON the VM (FR-487):
        ssh ${ADMIN_USER}@${IP} 'cd ~/app/deploy/vm && ./backup.sh install'
  5. **Exercise a restore before this environment holds anything real** (SC-413), and record it
     in deploy/vm/OPERATIONS-LOG.md. A documented restore never run is a hope, not a procedure.
EOF
