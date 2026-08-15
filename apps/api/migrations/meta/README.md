# Migration metadata — read this before regenerating

Everything in this directory is written by `drizzle-kit generate`, except this file and the four
deliberate deviations it records. The first two exist because **004 claims migration number `0003`,
which 005 skipped and left free** (delivery roadmap; 004 spec, FR-396). The third exists because
**014 claims `0011` while `0010` is reserved by a feature on another branch** — the same shape,
arriving from the other direction. The fourth exists because **014 tranche 2 claims `0012` and
`0010` stays permanently empty** — constitution v5.3.0 (O4) abolished reservations after the
scheme collided a third time, and the section below explains why the literal "next free number"
was the wrong one here.

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

**Confirmed by 006**: it did exactly that. `0005_snapshot.json` re-parents onto `0004_snapshot.json`,
the chain stayed contiguous, and the journal took index 5 with a `when` later than every entry.

## `0010_snapshot.json` belongs to `0011_conference_authoring.sql`, and `0010_*.sql` is not written yet

014 (conference content authoring) reserves migration **`0011`**; **012 reserves `0010`** and is
being built on a parallel branch. Two programmes are in flight, and a parallel branch cannot see the
other's reservation — this is the **third** collision this project has had over one, which is why
`tasks.md` T102 extends the roadmap's reserved-number table rather than correcting it.

`drizzle-kit generate` knows nothing about reservations. It produced
`0010_violet_goblin_queen.sql` at journal index 10, and **only the tag was renamed** — to
`0011_conference_authoring` — leaving `idx: 10` alone. Both halves are deliberate:

- **`idx` is the array position and nothing else.** The migrator reads `${tag}.sql`, never
  `${idx}`; the section above explains that array position is what decides application order on a
  fresh database. Renumbering `idx` to 11 would put a hole at position 10 and make the ordering
  claim above false.
- **The snapshot filename follows `idx`, so it stays `0010_snapshot.json`.** It records the schema
  *after* `0011_conference_authoring.sql`, exactly as `0004_snapshot.json` records the state after
  two migrations. Do not rename it to match the SQL file: `drizzle-kit` picks the last snapshot by
  filename to diff against, and a hand-renamed one either breaks the chain or duplicates a `prevId`.

**Consequence for 012**, which will generate next and expects `0010`: it will take journal index 11
and be offered the tag `0011_…`, which is taken. Rename its tag to `0010_launch_readiness` (or
whatever it names itself), leave its `idx` at 11, and leave `0011_snapshot.json` — the file
`drizzle-kit` will write — where it lands. The journal will then list `0011_conference_authoring`
before `0010_…`, with `0010_…` carrying the later `when`. That is the same shape as `0003`/`0004`
above and it is correct for the same reason: array position orders a fresh database, `when` decides
what an existing one receives, and the two migrations are independent.

## `0010` stays permanently empty, and `0012` is tranche 2's — do not "fix" either

Constitution v5.3.0 (O4, 2026-08-14) replaced reserve-in-advance with **claim at generation**:
reserving only works when branches can see each other's reservations, and three collisions proved
they cannot. That voided both outstanding reservations — 012's `0010` and 015's `0012` — so when
014's tranche 2 generated, `0010` and `0012` were both free. **It took `0012`, and `0010` must
never be filled**, for a reason the `0003`/`0004` section above states as its own safety
condition: an inversion is safe **only when the two migrations are independent**, and this pair is
not. `0012` redefines `admin_audit_entries_action_valid` — the same named CHECK that `0011` drops
and re-adds — to admit the vocabulary actions (FR-1089a). Numbered `0010`, the dependent migration
would precede its dependency in filename order while the journal applied them the other way round;
anything trusting filenames would apply the full action list, then let `0011` re-add the shorter
one, and the failure would surface as a refused vocabulary write with nothing naming its cause.

The generation followed the `0011` procedure above exactly, which produces the **fourth skew**:
the journal entry carries **`idx: 11`**, its tag is **`0012_conference_authoring_tranche_2`**, and
the snapshot `drizzle-kit` wrote stays **`0011_snapshot.json`**. Same rules as before: the
migrator reads `${tag}.sql` and never `idx`; array position orders a fresh database; the snapshot
filename follows `idx` and must not be renamed. **Consequence for the next feature to generate**:
`drizzle-kit` will offer journal index 12 and the tag `0012_…`, which is taken — rename the tag to
the next free *number on disk* (`0013_…` as of this writing), leave `idx` alone, leave the
snapshot where it lands, extend the roadmap's number table in the same change (O4 makes that
mandatory), and add your own section here.

## This file breaks `drizzle-kit generate`, and you have to move it

`drizzle-kit` reads **every** file in this directory as a snapshot and `JSON.parse`s it. This one is
Markdown, so a generate run aborts before it does anything:

```
SyntaxError: Unexpected token '#', "# Migratio"... is not valid JSON
```

It names no file, so it reads like a corrupt snapshot rather than like a README. 006 lost time to it;
here is the answer:

```bash
mv apps/api/migrations/meta/README.md /tmp/meta-README.md
pnpm db:generate --name <your_migration_name>
mv /tmp/meta-README.md apps/api/migrations/meta/README.md
```

**Move it, do not relocate it.** `CLAUDE.md`, the constitution and three feature specifications cite
this path; a file that answers the question from somewhere else is a file the next reader does not
find. The two minutes of moving it are cheaper than the broken references — and cheaper than
rediscovering the error message, which is the actual cost.
