# Migration metadata — read this before regenerating

Everything in this directory is written by `drizzle-kit generate`, except this file and the two
deliberate deviations it records. Both exist because **004 claims migration number `0003`, which
005 skipped and left free** (delivery roadmap; 004 spec, FR-396).

## The journal is not in `when` order, and that is on purpose

`_journal.json` lists `0003_attendee_identity_and_profile` **before** `0004_saved_sessions_and_notes`
while carrying a **later** `when` value. Both halves are load-bearing, because the migrator gates on
one and orders on the other:

- **Array position** decides application order on a **fresh** database, where nothing has been
  applied yet. 0003 must run before 0004 there, so it sits at index 3.
- **`when`** decides what an **existing** database receives: `drizzle-orm`'s migrator reads the most
  recent applied migration **once**, then applies every entry whose `when` exceeds it. Any developer
  clone created before 004 already has 0004 applied at `1786107373908`. A 0003 stamped earlier than
  that would be **silently skipped on every such database** — no error, no output, just a schema
  missing six tables. Stamping it later is what stops that.

The two migrations are independent — nothing in 0003 references saved sessions or notes, and nothing
in 0004 references profiles — so either order produces the same schema.

## There is no `0003_snapshot.json`, and `0004_snapshot.json` is the state after both

A snapshot records the schema *after* its migration. `0004_snapshot.json` therefore describes the
schema after everything, which is correct: with 0003 applying first, the state following journal
index 4 includes 004's tables. It is re-parented onto `0002_snapshot.json` so the chain stays
contiguous.

An accurate `0003_snapshot.json` would have to describe 004's tables **without** 005's — a state that
exists in no database, since a fresh migrate applies both in one run. Writing a fabricated one would
also give two snapshots the same `prevId`, which `drizzle-kit` rejects as a collision.

**Consequence for the next feature**: `drizzle-kit generate` picks the last snapshot by filename, so
006 diffs against `0004_snapshot.json` — the full current schema — and takes index 5, which is the
number the roadmap reserves for it. Nothing needs adjusting; just do not hand-write a
`0003_snapshot.json` to "fix" the gap.
