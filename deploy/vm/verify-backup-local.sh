#!/usr/bin/env bash
# EXERCISE A RESTORE, locally, with no VM and no production (T081, SC-413, FR-487).
#
# ═══════════════════════════════════════════════════════════════════════════════════════════════
# **WHY THIS EXISTS, STATED PLAINLY: A DOCUMENTED RESTORE NEVER RUN IS A HOPE, NOT A PROCEDURE.**
#
# The constitution's deployment obligation has three parts — daily automated backups, a written
# retention period, and *a restore that has actually been performed before production holds real
# attendee data*. The first two are visible when they are missing. The third is not: a backup
# script can run perfectly every night for a year and produce artifacts nobody can restore, and
# the day that is discovered is the day it matters.
#
# The failure modes this catches are all silent:
#   * a dump that exits 0 and writes an unusable archive (full disk, truncated write);
#   * a dump taken with flags that omit something the schema needs;
#   * a restore procedure in the runbook that does not actually work as written.
#
# So this runs **the same `pg_dump` and `pg_restore` invocations the real scripts use**, against a
# throwaway PostgreSQL container, on a database with real schema and real rows — and then asserts
# the restored copy contains what the original did.
# ═══════════════════════════════════════════════════════════════════════════════════════════════
#
# Usage:  ./verify-backup-local.sh
#
# Needs: docker. Nothing else — no Azure, no VM, no production credential.
#
# WHAT IT DOES NOT PROVE, and still needs a real environment (README section 5):
#   * that the VM's cron entry actually fires (needs an elapsed day);
#   * that the VM's disk floor and lock behave under real contention;
#   * that a restore into the LIVE stack works, which is destructive and is a runbook step rather
#     than a test.
set -euo pipefail

FAILURES=0
IMAGE="postgres:17"
CONTAINER="mynet-restore-verify-$$"
WORK="$(mktemp -d)"
PGPASSWORD_VALUE="verify-only-not-a-secret"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() { printf '  \033[31mFAIL\033[0m  %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
check() { if [[ "$3" == "$2" ]]; then pass "$1"; else fail "$1 (expected '$2', got '$3')"; fi; }

command -v docker >/dev/null || { echo "ERROR: docker is required." >&2; exit 1; }

echo "== Starting a throwaway PostgreSQL =="
docker run -d --name "$CONTAINER" \
  -e POSTGRES_USER=mynet \
  -e POSTGRES_PASSWORD="$PGPASSWORD_VALUE" \
  -e POSTGRES_DB=verify_source \
  "$IMAGE" >/dev/null

psql() { docker exec -i -e PGPASSWORD="$PGPASSWORD_VALUE" "$CONTAINER" psql -U mynet -v ON_ERROR_STOP=1 "$@"; }

for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U mynet >/dev/null 2>&1 && break
  sleep 2
done
docker exec "$CONTAINER" pg_isready -U mynet >/dev/null 2>&1 || {
  echo "ERROR: PostgreSQL did not become ready." >&2; exit 1
}

echo "== Seeding a source database =="
# Deliberately more than one table with a foreign key and a non-trivial type: a restore that
# reproduces one flat table proves far less than one that reproduces a cascade and an extension.
psql -d verify_source <<'SQL' >/dev/null
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE interests (
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  interest text NOT NULL,
  PRIMARY KEY (person_id, interest)
);
-- 011 (T156) — the two structures the administrative schema depends on that a row count cannot
-- see. Synthetic, like everything above: what is under test is whether pg_dump/pg_restore
-- preserve these SHAPES, not whether these particular tables exist.
CREATE TABLE conferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);
CREATE TABLE assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  -- **NO ACTION, deliberately** — mirrors organizer_assignments.event_id (FR-937). It is the one
  -- reference in the real schema that must NOT cascade: a conference deletion silently stripping
  -- an organizer's authority would leave no audit entry to explain it.
  conference_id uuid NOT NULL REFERENCES conferences(id) ON DELETE NO ACTION,
  revoked_at timestamptz
);
-- Partial unique index: one LIVE assignment per person and conference, revoked rows unconstrained
-- so they can accumulate as history.
CREATE UNIQUE INDEX assignments_live_idx
  ON assignments (person_id, conference_id) WHERE revoked_at IS NULL;

INSERT INTO people (display_name)
SELECT 'Attendee ' || n FROM generate_series(1, 250) AS n;
INSERT INTO interests (person_id, interest)
SELECT id, 'Design systems' FROM people;
INSERT INTO conferences (name) VALUES ('A conference');
INSERT INTO assignments (person_id, conference_id)
SELECT id, (SELECT id FROM conferences LIMIT 1) FROM people LIMIT 1;
SQL

SOURCE_PEOPLE="$(psql -d verify_source -tAc 'SELECT count(*) FROM people' | tr -d '[:space:]')"
SOURCE_INTERESTS="$(psql -d verify_source -tAc 'SELECT count(*) FROM interests' | tr -d '[:space:]')"
echo "   source: ${SOURCE_PEOPLE} people, ${SOURCE_INTERESTS} interests"

echo
echo "== 1. Dump, with the SAME flags backup.sh uses =="
# If these flags drift from backup.sh, this script stops verifying backup.sh and starts verifying
# itself. They are duplicated deliberately and must be kept in step.
docker exec -e PGPASSWORD="$PGPASSWORD_VALUE" "$CONTAINER" pg_dump \
  --username mynet --dbname verify_source \
  --format=custom --no-owner --no-privileges > "${WORK}/verify.dump"

if [[ -s "${WORK}/verify.dump" ]]; then pass "the dump is non-empty"; else fail "the dump is empty"; fi

echo
echo "== 2. The archive is READABLE — the gate backup.sh prunes behind =="
docker cp "${WORK}/verify.dump" "${CONTAINER}:/tmp/verify.dump" >/dev/null
if docker exec "$CONTAINER" pg_restore --list /tmp/verify.dump >/dev/null 2>&1; then
  pass "pg_restore --list parses the archive"
else
  fail "pg_restore --list cannot parse the archive"
fi

echo
echo "== 3. RESTORE INTO A FRESH DATABASE — the part a documented procedure never proves =="
psql -d postgres -c 'DROP DATABASE IF EXISTS verify_restored' >/dev/null
psql -d postgres -c 'CREATE DATABASE verify_restored' >/dev/null
if docker exec -e PGPASSWORD="$PGPASSWORD_VALUE" "$CONTAINER" \
     pg_restore --username mynet --dbname verify_restored --no-owner --no-privileges \
     /tmp/verify.dump >/dev/null 2>&1; then
  pass "pg_restore completed"
else
  fail "pg_restore failed"
fi

echo
echo "== 4. The restored copy contains what the original did =="
RESTORED_PEOPLE="$(psql -d verify_restored -tAc 'SELECT count(*) FROM people' | tr -d '[:space:]')"
RESTORED_INTERESTS="$(psql -d verify_restored -tAc 'SELECT count(*) FROM interests' | tr -d '[:space:]')"
check "every row of people survived" "$SOURCE_PEOPLE" "$RESTORED_PEOPLE"
check "every row of interests survived" "$SOURCE_INTERESTS" "$RESTORED_INTERESTS"

# The cascade is what account deletion depends on (FR-460, 004's deletion guarantee). A restore
# that reproduced the rows but not the constraint would leave a database that looks correct and
# silently stops deleting personal data on cascade.
CASCADE="$(psql -d verify_restored -tAc "
  SELECT confdeltype FROM pg_constraint
  WHERE conname LIKE 'interests_person_id%' AND contype = 'f'" | tr -d '[:space:]')"
check "the ON DELETE CASCADE survived (deletion depends on it)" "c" "$CASCADE"

# The extension is what accent-insensitive search depends on (FR-407, research D5). Extensions are
# a classic thing to lose in a restore, and the symptom is a directory search that finds nobody.
EXT="$(psql -d verify_restored -tAc "SELECT count(*) FROM pg_extension WHERE extname = 'unaccent'" | tr -d '[:space:]')"
check "the unaccent extension survived (search depends on it)" "1" "$EXT"

# The behaviour, not merely the presence: an extension row with a broken function is still a row.
UNACCENTED="$(psql -d verify_restored -tAc "SELECT unaccent('Muñoz')" | tr -d '[:space:]')"
check "unaccent still works in the restored database" "Munoz" "$UNACCENTED"

# ─────────────────────────────────────────────────────────────────────────────────────────────
# 011 (T156) — the administrative schema's two silent-loss shapes.
#
# Both fail the same way the cascade above does: the rows come back, the database looks correct,
# and a guarantee is gone. They are the INVERSE of each other, which is why both are here — one
# checks a reference that must NOT cascade, the other an index that must still constrain.
# ─────────────────────────────────────────────────────────────────────────────────────────────

# 'a' is NO ACTION. If this came back 'c' (cascade), deleting a conference would strip its
# organizers' authority with nothing recording that it happened (FR-937, FR-939).
NO_ACTION="$(psql -d verify_restored -tAc "
  SELECT confdeltype FROM pg_constraint
  WHERE conname LIKE 'assignments_conference_id%' AND contype = 'f'" | tr -d '[:space:]')"
check "the ON DELETE NO ACTION survived (authority depends on it NOT cascading)" "a" "$NO_ACTION"

# The partial index, WHERE clause included. A unique index restored without its predicate would
# be *stricter* than intended and reject the revoked rows that are kept as history; restored
# without the index at all, one person could hold two live assignments for one conference.
PARTIAL="$(psql -d verify_restored -tAc "
  SELECT count(*) FROM pg_indexes
  WHERE indexname = 'assignments_live_idx'
    AND indexdef ILIKE '%WHERE (revoked_at IS NULL)%'" | tr -d '[:space:]')"
check "the partial unique index survived, predicate included" "1" "$PARTIAL"

# The behaviour, not merely the definition — the same standard the unaccent check applies. A
# second live assignment must be refused; a second REVOKED one must not be.
psql -d verify_restored -c "
  INSERT INTO assignments (person_id, conference_id)
  SELECT person_id, conference_id FROM assignments LIMIT 1" >/dev/null 2>&1 \
  && fail "the partial unique index does not constrain: a second LIVE assignment was accepted" \
  || pass "a second live assignment is still refused in the restored database"

echo
if (( FAILURES > 0 )); then
  echo "FAILED: ${FAILURES} check(s). The restore procedure does not work as written."
  exit 1
fi

cat <<EOF
PASSED: dump -> verify -> restore -> compare, all of it.

**Record this run in deploy/vm/OPERATIONS-LOG.md** (SC-413). The requirement is not that a
procedure exists; it is that one has been performed, and the log is the evidence.
EOF
