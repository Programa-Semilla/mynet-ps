import { sql } from 'drizzle-orm'

import { assertVerifiedOperator, type PlatformScope } from '../../admin/scope.js'
import { getDb } from '../client.js'

/**
 * T105 (011) — **removing a reported question** (FR-950–FR-953, research R7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE ONLY ENFORCEMENT ACTION IN THIS FEATURE, AND THE ONLY ONE ANY ADMINISTRATIVE TIER HAS.**
 *
 * An operator may act on **content** — this one question, reached from a report — and on
 * **authority** (promotion, demotion). Acting on a *person* is a different power with its own
 * governance, and this feature does not have it: FR-955 forbids suspension, removal and
 * restriction, and `admin-forbidden-surfaces.test.ts` fails the build if one appears.
 *
 * FR-953 bounds it further: **a message report offers no removal at all.** 007's block at report
 * time is the protective act there, and a message removal route would be a second, unreviewed
 * decision about somebody else's correspondence. This module has no message path, which is what
 * makes that absence structural rather than a rule the route is trusted to follow.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

export type RemovalOutcome = 'removed' | 'not-found'

/**
 * Removes one question and **every vote on it** (FR-950, FR-951).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **`SELECT … FOR UPDATE` FIRST, MIRRORING 009'S WITHDRAWAL LOCK — AND THE LOCK IS THE WHOLE
 * REASON THIS IS A TRANSACTION RATHER THAN A `DELETE`.**
 *
 * Inserting a vote takes a `FOR KEY SHARE` lock on the referenced question row, and `FOR UPDATE`
 * conflicts with it. So a vote arriving while an operator is removing the question **blocks until
 * this transaction ends**, and is then refused by the foreign key against a row that is already
 * gone. Without the lock, the vote and the delete can interleave — and the failure mode is not a
 * lost vote but a *foreign-key violation surfacing as a 500 on an attendee's upvote*, caused by
 * an administrative action they cannot see.
 *
 * 009 wrote this reasoning for withdrawal, where the actor is the question's own author. It
 * transfers unchanged here with the actor swapped, which is why this is a mirror rather than a
 * new design. `admin-concurrency.test.ts` drives it, because it is the one property no
 * layer but a real database can test.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **The votes go with it, and that is a cascade rather than a statement here** —
 * `question_votes.question_id` is `ON DELETE CASCADE` (009). Constitution v3.3.0's decision 28
 * settled the equivalent question for a departing attendee: *"a departing attendee's questions
 * go, and everybody's votes on them go with them. Nothing survives de-attributed."* The same
 * answer applies to a removal, and for the same reason: a vote is an opinion **about a specific
 * question**, and a vote whose question is gone is not a fact about anything.
 *
 * **No other question's count moves** (FR-951). That is true by construction — the cascade is
 * keyed on this question id — and is asserted anyway, because a count is `count(*)` at read time
 * and somebody introducing a denormalised counter would break it invisibly.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The author is not told who removed it, or why** (FR-952). Nothing here writes anything
 * attendee-facing, and no notification is dispatched — the trigger set stays at a received
 * message (FR-935). The question is simply gone at the next read, which is the same thing every
 * other reader sees.
 */
export const removeQuestion = async (
  unverified: PlatformScope,
  questionId: string,
  tx?: Pick<ReturnType<typeof getDb>, 'execute'>,
): Promise<RemovalOutcome> => {
  assertVerifiedOperator(unverified)

  if (!UUID.test(questionId)) return 'not-found'

  // Joins the caller's transaction when there is one, and opens its own when there is not. The
  // route passes `tx` so the removal and its audit entry commit together (FR-994).
  //
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **WHAT IS PASSED HERE MUST BE A TRANSACTION, NOT THE POOL, AND THE TYPE CANNOT SAY SO.**
  //
  // `FOR UPDATE` holds its lock until the enclosing transaction ends. Handed the pool, each
  // statement is its own autocommit transaction, so the lock is taken and released by the
  // `SELECT` itself and the vote this exists to serialise slips in before the `DELETE`. The
  // failure is invisible — the question is still removed, the tests still pass, and what breaks
  // is an attendee's upvote 500ing from a foreign-key violation they cannot see the cause of.
  // Drizzle types a transaction and the pool identically for `execute`, so this is a comment
  // where a type would be better.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  if (tx) return removeWithin(tx, questionId)

  return getDb().transaction(async (own) => removeWithin(own, questionId))
}

/** The two statements, given something that is guaranteed to be inside a transaction. */
const removeWithin = async (
  tx: Pick<ReturnType<typeof getDb>, 'execute'>,
  questionId: string,
): Promise<RemovalOutcome> => {
  // `FOR UPDATE` on the question alone. There is no join to lock alongside it — unlike 009's
  // withdrawal, this needs no authorship or conference condition, because the authority is the
  // operator's tier rather than a relationship to the row.
  const locked = await tx.execute<{ id: string }>(sql`
    SELECT id FROM session_questions WHERE id = ${questionId}::uuid FOR UPDATE
  `)

  if (!locked[0]) return 'not-found'

  // The votes are removed by the cascade on `question_votes.question_id`. Deleting them
  // explicitly first would work and would be worse: it would put a second statement of the
  // rule in a file that does not own it, and the two could later disagree.
  await tx.execute(sql`DELETE FROM session_questions WHERE id = ${questionId}::uuid`)

  return 'removed'
}

/**
 * Matched rather than parsed, so a malformed identifier is refused exactly like a well-formed one
 * that names nothing (FR-953's 404) — `plugins/participation.ts`'s reasoning. Letting Fastify's
 * `format: uuid` produce a 400 would separate "not a uuid" from "already gone".
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
