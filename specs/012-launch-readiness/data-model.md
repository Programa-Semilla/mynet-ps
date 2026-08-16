# Data Model — 012 Launch Readiness

**None. No table, no column, no migration.**

Stated structurally rather than as an omission, because both coverage tests derive their
expectations from the Drizzle schema — `deletion-coverage.test.ts` fails when a table storing
attendee data has neither a cascade nor a declared retention rule, and `export-coverage.test.ts`
fails when a collected column has no export coverage. **A new table or column fails by existing.**
With no schema change there is nothing for either to fail on, and that is why this file is short
rather than empty.

Consistent with the roadmap's own note that 012 adds no schema, and with migration `0010` remaining
permanently unclaimed.

## What touches data without changing its shape

- **FR-1100** re-seeds UAT, destroying 4 disposable attendee accounts. This **exercises** the
  deletion cascade rather than extending it.
- **FR-1102** adds a command that inserts committed operator identities if absent. Same rows the
  seed already writes, from the same committed `SEED_OPERATORS` source, with `password_hash` null —
  no new shape, and FR-901's "committed, reviewed data" stays literally true because the addresses
  come from the repository rather than the environment.
- **FR-1140** changes what is stored **on the device**, not on the server: `getCurrent` stops being
  a cached read. No cache key shape changes.
- **FR-1148** makes backups run. The subject is the database's contents leaving the host, not its
  schema.
