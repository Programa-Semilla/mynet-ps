# Phase 1 Data Model: Session Q&A

**Feature**: 009 — Session Q&A · **Migration**: `0008` · **Date**: 2026-08-10

Two new tables and one new column on a neighbour's table. Every declaration below states its event
scoping and its deletion coverage in place, because the constitution makes neither a default and the
two coverage tests fail this feature's build until both are answerable from the schema.

---

## `session_questions`

One attendee's question against one session.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, `defaultRandom()` | Needed as a real key because votes reference it — unlike `session_notes`, which is identified by its composite pair alone. |
| `session_id` | `uuid` NOT NULL → `sessions.id` **ON DELETE CASCADE** | The scoping path *and* the re-seed path (R11). |
| `attendee_id` | `uuid` NOT NULL → `attendees.id` **ON DELETE CASCADE** | The author. This cascade **is** owner decision 1. |
| `body` | `text` NOT NULL | Bounded by the check below. |
| `asked_at` | `timestamptz` NOT NULL `defaultNow()` | The ordering tiebreak (FR-726). |

**Constraints**

- `CHECK (length(trim(body)) > 0 AND length(body) <= 500)` — both halves of FR-703 at the last line
  of defence, independent of the route schema and of the editor. The `trim` is what makes a
  whitespace-only question unrepresentable rather than merely rejected.
- `INDEX (session_id)` — every read is "this session's questions", and Postgres creates no index for
  a foreign key.
- `INDEX (attendee_id)` — for the deletion cascade and the export, both of which scan by author.
  **004's review left exactly this missing on two token tables and it is a recorded unclaimed
  defect**; not repeating it here costs one line.

**Scoping: per-event.** A question is asked against a session, and a session exists only within one
conference — the same reasoning `saved_sessions` and `session_notes` record. **The event is reached
through `sessions` and is deliberately NOT denormalised**: a stored `event_id` would be a second
source of truth that could disagree with `sessions.event_id`, and the one that disagreed would be
the one authorization read.

**Deletion**: cascade from `attendees`. **Export**: questions asked, each naming its session by
title. **Retention rule**: none needed, and that is true by cascade rather than by assertion.

---

## `question_votes`

The fact that one attendee upvoted one question.

| Column | Type | Notes |
|---|---|---|
| `question_id` | `uuid` NOT NULL → `session_questions.id` **ON DELETE CASCADE** | |
| `attendee_id` | `uuid` NOT NULL → `attendees.id` **ON DELETE CASCADE** | |
| `voted_at` | `timestamptz` NOT NULL `defaultNow()` | Exported; not displayed. |

**Constraints**

- `PRIMARY KEY (question_id, attendee_id)` — **this composite key IS FR-718.** One vote per attendee
  per question is enforced by the schema rather than by handler logic, so a double-tap on a slow
  connection is the same request twice and no code path exists that could produce a duplicate by
  forgetting to check. `saved_sessions` establishes the pattern.
- `INDEX (attendee_id)` — the deletion and export path. The primary key already serves the
  count-by-question read, so no second index on `question_id` is added.

**Scoping: per-event**, inherited through the question to its session. No `event_id` here either,
for the same reason.

**The two cascades do different work and both are load-bearing.** From `attendees` it removes the
voter's own votes wherever cast. From `session_questions` it removes **everybody's** votes when the
question goes — which is the mechanism behind owner decision 1's stated cost, and it is why deleting
an author takes other people's votes with it.

**Vote count is not a column.** It is `count(*)` over these rows at read time. A denormalised counter
is a second source of truth for a number the rows already answer, and the one that drifted would be
the one displayed.

---

## `abuse_reports.question_ids` — one column on 007's table

| Column | Type | Notes |
|---|---|---|
| `question_ids` | `uuid[]` NOT NULL | Mirrors `message_ids` exactly, **including having no foreign key.** |

The absence of a foreign key is inherited reasoning, not an oversight: a reported question will
frequently be gone before anyone looks at the report, `RESTRICT` would block a deletion the erasure
right requires, and `CASCADE` would silently empty the report while leaving the row — which reads as
"they reported nothing". An array degrades honestly into a list of things that no longer exist.

**No new retention rule.** `abuse_reports` is already swept at 90 days and cascades from both
attendees; the column inherits all of it.

---

## Relationships

```
attendees ──cascade──> session_questions ──cascade──> question_votes
    │                        │                              ▲
    │                        └── session_id ──> sessions     │
    └────────────────────── cascade ────────────────────────┘

sessions ──cascade──> session_questions        (re-seed path, R11)
sessions ──cascade──> question_votes (transitively, via session_questions)

abuse_reports.question_ids ──── no FK, deliberately ────> session_questions
```

**Deleting one attendee removes**: every question they asked, every vote cast on those questions by
anybody, and every vote they cast on anybody's question. Nothing survives de-attributed.

---

## Read shapes

**The list, one query per session** (R6, R7):

```
SELECT q.id, q.body, q.asked_at,
       a.display_name, a.id AS author_id,
       count(v.attendee_id)                    AS votes,
       EXISTS(… v WHERE v.attendee_id = reader) AS voted_by_me
  FROM session_questions q
  JOIN attendees a ON a.id = q.attendee_id
  LEFT JOIN question_votes v ON v.question_id = q.id
 WHERE q.session_id = :sessionId
   AND NOT EXISTS (            -- R7, bidirectional, pair never ordered
        SELECT 1 FROM attendee_blocks b
         WHERE (b.blocker_id = reader AND b.blocked_id = q.attendee_id)
            OR (b.blocker_id = q.attendee_id AND b.blocked_id = reader))
 GROUP BY q.id, a.id
 ORDER BY votes DESC, q.asked_at ASC
```

The session is reached only after `requireEventAccess` has produced the `EventScope`, and the
session's membership of that event is part of the predicate — so a session id from another
conference yields nothing, indistinguishably from one that does not exist.

**The author join reads `display_name` and nothing else** (FR-737), and deliberately applies
**none** of the directory's three conditions — not discoverability (FR-734), not verification
(FR-735), not a registration join. Each looks like a forgotten `WHERE`; each is the feature.

**Withdrawal** re-checks `NOT EXISTS (votes for this question)` **inside the same transaction** as
the delete (FR-714). Checking before the transaction is the race the requirement exists to close.

---

## Repository interface

`QuestionsRepository`, in `packages/data/src/interfaces/questions.ts`, added as one line to the
`Repositories` aggregate in `packages/data/src/interfaces/index.ts`.

```
list(eventId, sessionId)              → QuestionListItem[]
ask(eventId, sessionId, body)         → QuestionListItem[]   (R5 — the write returns the new list)
withdraw(eventId, questionId)         → QuestionListItem[]
vote(eventId, questionId)             → QuestionListItem[]
unvote(eventId, questionId)           → QuestionListItem[]
```

**Every method takes `eventId` first**, mirroring the addresses (R12) and every other per-event
repository. **Nothing is added to `CatalogRepository`**, which is read-only in perpetuity and
asserted by name-shape over its exports — questions and votes are attendee state *about* conference
content, which is 005's distinction unchanged.

**Not decorated with `cached`** (R1). Because the repository is never wrapped, there is no `reads`
map to omit a read from and no write branch to fall into — 008's defect is unreachable here rather
than merely avoided.
