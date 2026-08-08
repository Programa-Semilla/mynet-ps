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
