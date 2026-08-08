#!/usr/bin/env bash
# Provision the fixed-cost VM for a MyNet environment. Run from your DEV MACHINE (needs az).
#
# Usage:  ./provision-vm.sh <uat|prod>
#
# Cost target (~fixed per month, per environment): Standard_B2s ~$30-38 + 64GB StandardSSD ~$5 +
# static IP ~$4. Fixed cost with no per-request metering is why the owner chose this pattern over
# a managed database (research D9) — the trade is recorded in plan.md's Complexity Tracking.
set -euo pipefail

source "$(cd "$(dirname "$0")" && pwd)/_common.sh"
mynet::load_env "${1:-}"
mynet::require_az

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

az group create -n "$RESOURCE_GROUP" -l "$LOCATION" -o none

az vm create \
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
# **THE WEB RULE IS AN OPEN QUESTION, NOT A DECISION** (register entries 14 and 19, tasks T005).
# UAT will carry realistically-shaped attendee data on a permanent public address, and FR-485
# bounds the harm without addressing the exposure. If the owner settles on restricted access, the
# change is this rule's `--source-address-prefixes` and nothing else.
#
# **The database is NOT in this list and must never be.** PostgreSQL binds to 127.0.0.1 in
# docker-compose.yml (FR-486), so there is nothing here to open — which is the point: the
# protection is the bind address, not a firewall rule somebody could widen.
# ═════════════════════════════════════════════════════════════════════════════════════════════
az network nsg rule create -g "$RESOURCE_GROUP" --nsg-name "${VM_NAME}NSG" -n allow-web \
  --priority 1000 --direction Inbound --access Allow --protocol Tcp \
  --destination-port-ranges 80 443 >/dev/null
az network nsg rule create -g "$RESOURCE_GROUP" --nsg-name "${VM_NAME}NSG" -n allow-ssh \
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
