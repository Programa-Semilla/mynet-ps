# Phase 1 Data Model: UAT Deployment and Pre-Public Hardening

**Feature**: 010 | **Date**: 2026-08-10

## No entities, no migration, and both are verified rather than asserted

FR-890 forbids a migration, a table or a column. This document exists to show the claim was
checked, because two changes in this feature *look* like schema changes and are not.

### The two that look like schema changes

**1. The throttle gains two actions (R7: `directory_read`, `thread_read`).**

Not a migration. `apps/api/src/db/schema/sign-in-attempts.ts:173` declares the column as
`text('action').$type<ThrottleAction>().notNull()` — a **text column carrying a TypeScript union**,
not a Postgres enum. Widening the union is a type-level change with no DDL. 007 added two actions
this way and 009 added three; the pattern is established and the column comment explains why the
column is text.

The rows themselves are already covered: `sign_in_attempts` is **deliberately not deleted with an
account** (it has no foreign key by design, so an attacker cannot clear their trail by registering
and deleting), and it expires on the two-hour sweep that FR-382 forbids lengthening. Two more
actions write more rows to a table whose retention rule already exists and does not change.

*Worth carrying into implementation*: an idea-inbox entry already records that upvoting made this
table the product's highest-volume write path. Two read actions will make it higher still. Nothing
breaks at UAT scale, the table stays bounded, and the entry stays open against 011 — but the plan
should not pretend this is free.

**2. The verification mail gains copy (FR-809, FR-810).**

Not a schema change and not a port change. `MailService.sendVerification(to, link)` keeps its exact
signature; the body is rendered by the adapter. Both adapters — the sink and the new SMTP one —
render it, so the contest-path wording must be added in both or the two disagree about what the
product says.

### What this feature stores that is new

**One thing, and it is not in the database**: backup artifacts in an Azure Storage container (R4).
It is a copy of everything in the database, so it is treated as such — access on the same terms as
the database itself (FR-873), and write-only credentials for the job that produces it. UAT holds
seeded data only (FR-880), so **no real attendee data ever reaches it**, which is the property that
keeps this out of Principle VIII's deletion and export obligations rather than an exemption.

### Coverage checks that must still pass

Two tests fail a *future* feature's build when it stores attendee data without covering it:
`tests/unit/deletion-coverage.test.ts` and `tests/unit/export-coverage.test.ts`. Both derive their
expectations from the Drizzle schema, so **a new table or column fails by existing**.

This feature adds neither, so both pass unchanged — and that is the check. If either one starts
failing during implementation, a schema change has been introduced and FR-890 has been broken.

## Configuration as this feature's real "data model"

What this feature actually introduces is not records but **configuration and secrets**, and FR-837
requires the whole inventory including the values that predate it. That inventory is a contract
rather than a data model and lives in
[`contracts/configuration.md`](./contracts/configuration.md).
