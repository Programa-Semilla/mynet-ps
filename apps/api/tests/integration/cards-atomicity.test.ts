import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { resetDatabase, setupTestApp, teardown } from './helpers.js'
import {
  ADA,
  GRACE,
  listHeld,
  shareCard,
  signIn,
  type Actor,
  type HeldCardBody,
} from './network-fixtures.js'

/**
 * T032 (016) — **both records, or neither** (FR-1022, SC-1007).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A PASSING HAPPY PATH CANNOT DEMONSTRATE THIS, WHICH IS THE ENTIRE REASON THIS FILE EXISTS.**
 *
 * SC-1007 says no partial exchange is observable *"across repeated attempts including induced
 * failures"*. Every other card test drives the route and sees two rows appear — and would see
 * exactly the same thing if the two inserts ran as two autocommitting statements with no
 * transaction at all. The property under test is what happens when the **second** write fails,
 * and nothing produces that state by accident.
 *
 * This is the shape 013 used to prove an administrative act and its audit entry commit together
 * (`admin-audit-atomicity.test.ts`), for the same reason: the guarantee was *stated* in a header
 * for a long time before anything checked it, and three of five review agents found it unmet.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE FAILURE IS INDUCED BY A REAL DATABASE TRIGGER, AND MOCKING WOULD PROVE NOTHING.**
 *
 * The subject of this test *is* the transaction. A double replacing the query layer would
 * demonstrate that `shareCard` calls two functions and that one of them threw — which is true of
 * a correct implementation and of a broken one alike, because the thing that makes it correct is
 * that both statements ran on **one connection inside one `BEGIN`**. A green mocked test here
 * would be worse than no test: it would assert that the property is checked while checking
 * nothing.
 *
 * So the second insert is failed by the database itself, and **the trigger identifies the second
 * insert by the transaction's own prior write** rather than by direction. Failing the *first*
 * insert would leave nothing to roll back, and the test would then pass against code that never
 * opened a transaction at all.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE FIRST VERSION KEYED THE TRIGGER ON THE RECIPIENT, AND WAS VACUOUS ON ~HALF OF RUNS**
 * (review finding T3).
 *
 * It raised on the row whose `recipient_id` was the initiating attendee, calling that "the
 * reciprocal row — the second of the two". **`shareCard` does not write in that order.** It sorts
 * the pair by `sharer_id` before writing, precisely so two simultaneous exchanges cannot deadlock,
 * and `attendees.id` is `defaultRandom()` — re-rolled by every `resetDatabase()`. So on roughly
 * half of all runs the row the trigger failed was the **first** one written, nothing had been
 * written when the exception raised, and this file asserted that a rollback of nothing removes
 * nothing. Green, in the feature whose headline property it is the only guard for.
 *
 * That is verbatim the failure this file's own header warns against — *"it would assert that the
 * property is checked while checking nothing"* — so the repair is not "pick the other identifier",
 * which would be the same coin toss reversed. The predicate is now **order-independent**: the
 * exception fires only when the opposite-direction row for this pair **already exists**, which
 * inside one transaction can only be its own uncommitted first insert.
 *
 * **And the ordering is asserted rather than trusted.** `mynet_test_insert_probe` is a sequence,
 * and a sequence advance is **not rolled back** — that is what lets a test observe how far a
 * transaction got *after* the transaction is gone. Two attempts means the first insert ran, was
 * accepted, and was still there when the second raised. A future reordering that makes the failing
 * write the first one fails loudly on that count instead of quietly going vacuous again.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Fails the **second** insert of an exchange, whichever direction it is written in.
 *
 * No identifier is interpolated and none is needed: "second" is expressed as *the opposite
 * direction for this pair is already present*, which is true of the second insert of a
 * transaction and of nothing else the product does — `shareCard` is the only writer of
 * `shared_cards`, and it writes exactly this pair of rows.
 */
const failSecondInsert = async (): Promise<void> => {
  // The probe counts every insert the trigger sees. `nextval` is non-transactional, so the count
  // survives the rollback that is about to erase everything else — which is the only way to
  // observe, afterwards, that the failure landed on the second write and not the first.
  await getDb().execute(sql`CREATE SEQUENCE IF NOT EXISTS mynet_test_insert_probe`)
  await getDb().execute(sql`ALTER SEQUENCE mynet_test_insert_probe RESTART`)

  await getDb().execute(
    sql.raw(`
    CREATE OR REPLACE FUNCTION mynet_test_fail_second_insert() RETURNS trigger AS $$
    DECLARE
      opposite_exists boolean;
    BEGIN
      PERFORM nextval('mynet_test_insert_probe');

      SELECT EXISTS (
        SELECT 1 FROM shared_cards
        WHERE sharer_id = NEW.recipient_id AND recipient_id = NEW.sharer_id
      ) INTO opposite_exists;

      IF opposite_exists THEN
        RAISE EXCEPTION 'induced failure on the second card row of the exchange';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `),
  )
  await getDb().execute(sql`
    CREATE TRIGGER mynet_test_fail_second_insert
    BEFORE INSERT ON shared_cards
    FOR EACH ROW EXECUTE FUNCTION mynet_test_fail_second_insert();
  `)
}

/** How many inserts the trigger saw. Survives the rollback; see `failSecondInsert`. */
const insertsAttempted = async (): Promise<number> => {
  const rows = await getDb().execute<{ attempts: number }>(sql`
    SELECT (CASE WHEN is_called THEN last_value ELSE 0 END)::int AS attempts
    FROM mynet_test_insert_probe
  `)
  return rows[0]?.attempts ?? 0
}

const removeInducedFailure = async (): Promise<void> => {
  await getDb().execute(sql`DROP TRIGGER IF EXISTS mynet_test_fail_second_insert ON shared_cards`)
  await getDb().execute(sql`DROP FUNCTION IF EXISTS mynet_test_fail_second_insert()`)
}

describe('a card exchange is atomic (FR-1022, SC-1007)', () => {
  let app: FastifyInstance
  let ada: Actor
  let grace: Actor

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    ada = await signIn(app, ADA)
    grace = await signIn(app, GRACE)
  })

  afterEach(async () => {
    await removeInducedFailure()
  })

  afterAll(async () => {
    await removeInducedFailure()
    await getDb().execute(sql`DROP SEQUENCE IF EXISTS mynet_test_insert_probe`)
    await teardown(app)
  })

  const heldBy = async (actor: Actor): Promise<string[]> => {
    const body = (await listHeld(app, actor)).json() as { cards: HeldCardBody[] }
    return body.cards.map((card) => card.attendeeId)
  }

  it('writes NEITHER record when the second insert fails', async () => {
    // Ada initiates. Which of the two rows is written first depends on how the pair sorts, which
    // depends on identifiers this suite re-rolls on every reset — so the trigger names the second
    // write by what the transaction has already done, not by direction.
    await failSecondInsert()

    const response = await shareCard(app, ada, grace.id)

    expect(
      response.statusCode,
      'The exchange did not happen, and the sharer is told so rather than being given a ' +
        'success for a half-written relationship.',
    ).toBeGreaterThanOrEqual(500)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **THE TEST'S OWN PRECONDITION, ASSERTED RATHER THAN ASSUMED** (finding T3).
    //
    // Two attempts means the first insert was accepted and the second raised — so there really
    // was an uncommitted row to lose, and the assertions below are about a rollback rather than
    // about nothing having happened. One attempt would mean the failure landed on the *first*
    // write, and everything after this point would pass against an implementation with no
    // transaction at all.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(
      await insertsAttempted(),
      'The induced failure did not land on the SECOND insert, so this case proves nothing: a ' +
        'rollback that had no committed-in-transaction row to undo is indistinguishable from ' +
        'two autocommitting statements where the first never ran.',
    ).toBe(2)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The forward row is gone, and that is the whole assertion.**
    //
    // It was written successfully — the trigger let it through — and only the reciprocal insert
    // raised. If these statements were autocommitting against the pool, Grace would hold Ada's
    // card right now and Ada would hold nothing: a one-sided contact, created by a failure,
    // which no later action would repair and no reader could distinguish from a deliberate
    // one-directional share.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await removeInducedFailure()

    expect(
      await heldBy(grace),
      'The forward record survived a failed exchange. Contacts must be mutual or absent, never ' +
        'one-sided (SC-1007) — this is the state FR-1022 exists to forbid, and it is what two ' +
        'statements against the connection pool would produce.',
    ).toEqual([])

    expect(await heldBy(ada)).toEqual([])
  })

  it('leaves the pair able to exchange normally once the failure is removed', async () => {
    // Recovery matters: a rolled-back exchange must leave no residue that blocks a later one —
    // no half-row for `ON CONFLICT` to absorb, and nothing to repair by hand.
    const response = await shareCard(app, ada, grace.id)
    expect(response.statusCode).toBe(201)

    expect(await heldBy(grace)).toEqual([ada.id])
    expect(await heldBy(ada)).toEqual([grace.id])
  })

  it('is atomic in the reverse direction too, so the property is not an artefact of ordering', async () => {
    // Reset to a clean pair, then have Grace initiate instead. The trigger's predicate is
    // direction-free, so this genuinely fails Grace's exchange on *its* second write — under the
    // old identifier-keyed trigger, one of these two cases was always the vacuous one.
    await getDb().execute(sql`DELETE FROM shared_cards`)
    await failSecondInsert()

    const response = await shareCard(app, grace, ada.id)
    expect(response.statusCode).toBeGreaterThanOrEqual(500)

    expect(
      await insertsAttempted(),
      'The failure did not land on the second insert in this direction either — see the case ' +
        'above for why that would make both of them vacuous.',
    ).toBe(2)

    await removeInducedFailure()

    expect(await heldBy(ada)).toEqual([])
    expect(await heldBy(grace)).toEqual([])
  })
})
