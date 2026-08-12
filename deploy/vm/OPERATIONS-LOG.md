# Operations log

Append-only. One entry per operational act that the constitution requires **evidence** of rather
than a procedure for — today that means restores (SC-413), and it will mean production incidents
when there is a production.

**Newest last.** Each entry states what was done, by whom, against what, and what was observed —
not what was expected. An entry recording an intention is worth nothing.

---

## 2026-08-07 — restore procedure exercised locally

**Act**: `deploy/vm/verify-backup-local.sh`, run from a developer machine.

**Against**: a throwaway `postgres:17` container. **Not** UAT and **not** production — neither
environment exists yet (no domain, no subscription; tasks T004 and T006 are owner decisions the
specification records as open).

**What was exercised**: the full cycle, using the same `pg_dump` and `pg_restore` invocations
`backup.sh` uses — dump → `pg_restore --list` → restore into a fresh database → compare.

**Observed**:

| Check                                        | Result |
| -------------------------------------------- | ------ |
| The dump is non-empty                        | PASS   |
| `pg_restore --list` parses the archive       | PASS   |
| `pg_restore` completes into a fresh database | PASS   |
| Every row of `people` survived (250)         | PASS   |
| Every row of `interests` survived (250)      | PASS   |
| The `ON DELETE CASCADE` survived             | PASS   |
| The `unaccent` extension survived            | PASS   |
| `unaccent('Muñoz')` still returns `Munoz`    | PASS   |

The last three are the ones worth having. A restore that reproduces rows but loses the cascade
leaves a database that looks correct and **silently stops deleting personal data** on account
deletion — the guarantee 004 shipped. A restore that loses `unaccent` leaves a directory search
that finds nobody at a Spanish-language conference, with no error anywhere.

**What this does NOT discharge.** SC-413 asks for a restore performed _before production holds
real attendee data_, and this is not that run — it is the procedure proved to work as written.
The remaining half is T081: run `./backup.sh install` on each VM, let a scheduled backup fire,
and restore **that artifact**. It cannot be done until the environments exist.

**Recorded by**: the 006 implementation.

---

## 2026-08-11 — restore procedure re-exercised, with the administrative schema's shapes added

**Act**: `deploy/vm/verify-backup-local.sh`, run from a developer machine, after extending it with
three checks for 011 (T156).

**Against**: a throwaway `postgres:17` container. Still **not** UAT and **not** production —
neither environment exists yet, and the two owner decisions blocking them are unchanged.

**Why it was re-run**: 011 adds administrative tables whose guarantees are structural rather than
row-shaped, and the existing script checked one cascade, one extension, and row counts. A restore
that reproduced every administrative row while losing either shape below would look completely
correct.

**Observed**:

| Check                                                           | Result |
| --------------------------------------------------------------- | ------ |
| The dump is non-empty                                           | PASS   |
| `pg_restore --list` parses the archive                          | PASS   |
| `pg_restore` completes into a fresh database                    | PASS   |
| Every row of `people` survived (250)                            | PASS   |
| Every row of `interests` survived (250)                         | PASS   |
| The `ON DELETE CASCADE` survived                                | PASS   |
| The `unaccent` extension survived                               | PASS   |
| `unaccent('Muñoz')` still returns `Munoz`                       | PASS   |
| **The `ON DELETE NO ACTION` survived** (new)                    | PASS   |
| **The partial unique index survived, predicate included** (new) | PASS   |
| **A second live assignment is still refused** (new)             | PASS   |

The three new ones model `organizer_assignments`: a reference that must **not** cascade (FR-937 —
a conference deletion must never silently strip authority) and a partial unique index that must
come back **with its `WHERE` clause** (without it the index is stricter than intended and rejects
the revoked rows kept as history). The third is the behavioural half — an index present but not
enforcing is still an index — and it is the same standard the `unaccent` check has always applied.

**What this does NOT discharge.** Unchanged from the entry above: SC-413 asks for a restore
performed before production holds real attendee data, and this is still the procedure proved to
work as written rather than that run. 011 adds nothing to that half and does not move it.

**Not exercised, and worth stating**: no restore has been performed against a database containing
real administrative rows, because none exists. The shapes are verified; the data path is not.

**Recorded by**: the 011 implementation.

---
