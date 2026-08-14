import { sql } from 'drizzle-orm'

import { assertVerifiedCard, type CardScope } from '../../plugins/card-access.js'
import { getDb } from '../client.js'

/**
 * T055, T058, T069–T071, T123 (008) — sharing a card, and resolving the ones you hold
 * (FR-602–FR-617, FR-651).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE RESOLUTION RULE IS THIS FEATURE'S CENTRAL PROMISE, AND IT IS THREE ABSENCES.**
 *
 * Reading a held card joins `attendee_profiles` **without** the directory's discoverability
 * condition (FR-612), **without** consulting verification state (FR-613), and **without**
 * requiring a shared current registration (FR-614).
 *
 * All three are absences, which means all three look exactly like somebody forgetting a
 * `WHERE`. `listDirectory` in the neighbouring file has every one of them — `a.discoverable =
 * true AND a.email_verified_at IS NOT NULL`, plus a `JOIN registrations` — so a reader arriving
 * from that file will see this one as incomplete. It is not. See `STANDING CONSENT` below before
 * adding any of them back.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T071 — STANDING CONSENT: DISCOVERABILITY GOVERNS BEING *FOUND*, NOT BEING *REMEMBERED*.**
 *
 * Constitution v3.2.0 (N2): sharing a card places the sharer under a standing consent that
 * **outlives the event and the discoverability toggle**. That is not a loophole in the
 * visibility model, it is the model: a person who hands somebody their card has decided to be
 * contactable by that specific person, and a global "do not list me in the directory" switch is
 * not a retraction of an individual gift.
 *
 * The alternative — contacts blanking when the sharer goes undiscoverable — was considered and is
 * the failure `quickstart.md` scenario 2 exists to catch: *"if B's contact goes blank here, the
 * standing-consent rule has been lost and the feature's whole purpose with it."*
 *
 * **Verification is more emphatic still.** The constitution's own invariant is that verification
 * gates *exactly one thing: discoverability*, and no feature may use it for anything else.
 * Consulting `email_verified_at` here would be a second use — and since any profile that can be
 * read already carries a verified address at the moment it was shared, it would only ever
 * matter if verification could be *lost*, which no action in the product does.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T123 — WHAT *DOES* SEVER A CARD IS A BLOCK, AND IT IS EVALUATED READ-SIDE** (FR-608,
 * FR-637a).
 *
 * Every read below joins `attendee_blocks` and yields nothing while a block exists **in either
 * direction**. Nothing is written and nothing is deleted, which is precisely what makes lifting
 * a block restore the contact automatically — no repair path, no undo table, no second write to
 * get wrong.
 *
 * That is the deliberate opposite of what a block does to an **appointment**, which is cancelled
 * by a write and stays cancelled when the block is lifted (FR-637a, research R6). The asymmetry
 * is the specification's, not an inconsistency: blocking *suspends a relationship* and *ends a
 * commitment*, and those are different things.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * T003 (016) — **who runs the statement: a transaction, or the pool.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SHAPE `admin-audit.ts` ESTABLISHED, FOR THE REASON 013 RECORDED.**
 *
 * A statement handed `getDb()` runs on a pooled connection and **autocommits**. That is the trap
 * 013 met with `removeQuestion`'s `FOR UPDATE` — the lock was released by the `SELECT` that took
 * it — and it is why FR-1022 could not be met by adding a second insert beside the first: the
 * first would already have committed when the second failed.
 *
 * So every step of a share takes its executor rather than reaching for the pool, and `shareCard`
 * passes one transaction to all of them. **The type cannot enforce this** — a transaction and the
 * pool are both assignable here — which is exactly why `cards-atomicity.test.ts` induces a real
 * failure rather than trusting the signature.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
type CardExecutor = Pick<ReturnType<typeof getDb>, 'execute'>

/**
 * One held card, as the database produces it.
 *
 * **`avatarObjectKey`, not bytes.** The query knows where an avatar lives; resolving it into
 * bytes is the route's job, because that is where `StorageService` is reachable — the same split
 * 006's directory records, and for the same reason: it keeps this function to one statement.
 */
export interface HeldCardRow {
  readonly attendeeId: string
  readonly displayName: string
  readonly company: string | null
  readonly role: string | null
  readonly headline: string | null
  readonly interests: readonly string[]
  readonly avatarObjectKey: string | null
  readonly eventId: string
  readonly eventName: string
  readonly sharedAt: string
  readonly atActiveEvent: boolean
}

/**
 * One person who holds the reader's card. Deliberately thinner — see `interfaces/cards.ts`.
 *
 * Named for what it is rather than for how it arose: under mutual exchange (v5.0.0 C1) half of
 * these rows come from the *other* party sharing first, so "a card the reader gave away" would
 * describe only some of them.
 */
export interface SharedCardRow {
  readonly attendeeId: string
  readonly displayName: string
  readonly eventId: string
  readonly eventName: string
  readonly sharedAt: string
}

/** What `shareCard` resolved to, so the route can answer without a second read. */
export type ShareOutcome =
  | { readonly outcome: 'created' | 'existing'; readonly card: SharedCardRow }
  | { readonly outcome: 'self' }
  | { readonly outcome: 'unreachable' }
  | { readonly outcome: 'refused' }

/**
 * ISO-8601 with milliseconds, in UTC, produced by the database rather than by JavaScript.
 *
 * The same formatting `queries/blocks.ts` uses. Selecting a `Date` and converting in Node would
 * give the same answer today and a different one the moment a driver or a pool option changed
 * how timestamps are parsed — and `sharedAt` is compared for equality by FR-604's test.
 */
const isoInstant = (column: string): string =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`

/**
 * Whether a block stands between these two, in **either** direction (FR-608).
 *
 * Bidirectional though the rows are not: a share is refused when either attendee blocks the
 * other. The recipient blocking the sharer is the obvious case; the sharer having blocked the
 * recipient is incoherence, and their own client already knows. Both take the same reasonless
 * 409 at the route, so the server never has to decide which story to tell.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THIS ONE READ IS DELIBERATELY UNLOCKED, AND THAT IS THE OPPOSITE OF `exchangePermitted`
 * BELOW** (review finding S3).
 *
 * Under READ COMMITTED this sees the snapshot taken when the statement ran, so a block committing
 * between here and the inserts is not seen and both rows are written. **It cannot be closed the
 * way the discoverability race is closed**: `exchangePermitted` locks rows that already exist,
 * and the row this asks about is one that does *not* exist yet — there is nothing to take a lock
 * on, and the only constructs that would serialise it (a predicate lock, or SERIALIZABLE) would
 * put a retry loop on every share to close a window measured in milliseconds.
 *
 * **The staleness is accepted because a card written in that window is inert on arrival.** Every
 * read of a held card re-applies the block condition (see `heldCardSelect`), so the row resolves
 * nothing for either party while the block stands, and lifting the block simply restores what the
 * row always said — no repair path, no residue, nothing to undo. That is the same asymmetry
 * FR-637a records for appointments, arriving here as the reason this can be left alone.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const blockStands = async (
  db: CardExecutor,
  sharerId: string,
  recipientId: string,
): Promise<boolean> => {
  const rows = await db.execute<{ blocked: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM attendee_blocks
      WHERE (blocker_id = ${sharerId}::uuid AND blocked_id = ${recipientId}::uuid)
         OR (blocker_id = ${recipientId}::uuid AND blocked_id = ${sharerId}::uuid)
    ) AS blocked
  `)
  return rows[0]?.blocked === true
}

/**
 * T040 (016) — **may this exchange happen at all?** (FR-1053)
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS GUARD IS LOAD-BEARING FOR THE AMENDMENT, NOT CONVENTION INHERITED FROM THE OLD MODEL.**
 *
 * Constitution v5.0.0 (C1) licenses mutual exchange on one ground: **a card resolves only what
 * its owner already published to co-attendees** under decision 16's single visibility decision.
 * So the exchange moves *when* a co-attendee sees those fields, not *whether* — which is what
 * makes taking a card without asking defensible.
 *
 * Against a recipient who is **not discoverable, that ground does not exist.** They published
 * nothing, and handing the sharer their card would disclose something discoverability had not
 * already disclosed. **Relaxing this condition would need another amendment, not a change of
 * mind** — it is the premise C1 was argued from, not a leftover of the one-directional model.
 *
 * The physical-card metaphor is deliberately **not** the argument and must never be cited as
 * one: it was equally available to v3.2.0 (N2), which reached the opposite conclusion, so it
 * cannot be what unmakes N2.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **EVALUATED ONCE, AND GOVERNING BOTH INSERTS.**
 *
 * It used to live inside the insert as `WHERE EXISTS (…)`. Under mutual exchange that shape
 * would evaluate it **twice**, once per row, and two evaluations can disagree — a registration
 * withdrawn between them writes one row and not the other, which is precisely the half-written
 * state FR-1022 forbids. Lifting it out is what makes "both rows or neither" a property of the
 * transaction rather than a coincidence of timing.
 *
 * The conditions are the *directory's*, deliberately — you may only share with somebody you
 * could have **found**. That is the exact opposite of the resolution rule in this file's header,
 * and the two are not in tension: discoverability governs whether a relationship can *start*,
 * and standing consent governs whether it *continues*. FR-1027 keeps resolution unchanged.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **AND EVALUATED UNDER A ROW LOCK, BECAUSE A GUARD THIS LOAD-BEARING MUST NOT BE READING A
 * SNAPSHOT SOMEBODY IS ALREADY REVOKING** (review finding S3).
 *
 * Without `FOR SHARE` this is an ordinary READ COMMITTED read: it sees the instant the statement
 * ran, and a recipient who turns discoverability off — or withdraws from the conference —
 * **after** it and **before** the inserts commit is not seen, so both rows are written against a
 * publication that no longer exists. Small in practice, and irrelevant to FR-1022, which is about
 * the two rows agreeing with **each other**. It matters because this guard is not an ordinary
 * validation: it is the entire ground C1 was argued from, so "the answer was true a moment ago"
 * is a weaker property than the amendment is relying on.
 *
 * `FOR SHARE` closes it in the only direction that can be closed by locking. The three rows exist
 * already, so they can be locked; a concurrent `UPDATE attendees SET discoverable = false` or
 * `DELETE FROM registrations` now **waits** for this transaction, which makes this read decisive
 * rather than advisory. (013 records the same lesson for `removeQuestion`, where the lock has to
 * be given a transaction to hold at all — and it is given one here for the same reason: handed the
 * pool, each statement autocommits and the lock is released by the `SELECT` that took it.)
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **IT INTRODUCES NO SECOND LOCK ORDER TO GET WRONG, AND THAT WAS CHECKED RATHER THAN ASSUMED.**
 *
 * The deadlock this function now precedes was a cycle between two transactions each holding one
 * **exclusive** unique-index key and waiting for the other's — fixed below by sorting the pair.
 * Every lock taken here is **shared**, and shared locks do not conflict with each other: two
 * attendees exchanging with each other at the same instant lock *each other's* rows in opposite
 * orders and neither waits, because neither ever asks for an exclusive lock on an `attendees` or
 * `registrations` row. Nothing in this transaction upgrades them, either — the inserts below take
 * `FOR KEY SHARE` on the same two attendee rows anyway, as the foreign keys' own check, which is a
 * weaker mode of the same shared family.
 *
 * So the only exclusive contention in a share is still the two unique-index keys, and the sort is
 * still the whole of the ordering rule. **A future edit that takes `FOR UPDATE` here instead would
 * break that**, because two shares would then hold one exclusive attendee row each and wait for
 * the other's.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Written as a row-returning `SELECT … FOR SHARE` rather than `SELECT EXISTS (…)`**: a locking
 * clause belongs to the query it locks, and burying it in a sub-select that the planner is free to
 * stop early makes the lock a property of the plan rather than of the statement.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const exchangePermitted = async (
  db: CardExecutor,
  sharerId: string,
  recipientId: string,
  eventId: string,
): Promise<boolean> => {
  const rows = await db.execute<{ permitted: number }>(sql`
    SELECT 1 AS permitted
    FROM attendees target
    JOIN registrations theirs
      ON theirs.attendee_id = target.id AND theirs.event_id = ${eventId}::uuid
    JOIN registrations mine
      ON mine.attendee_id = ${sharerId}::uuid AND mine.event_id = ${eventId}::uuid
    WHERE target.id = ${recipientId}::uuid
      AND target.discoverable = true
      AND target.email_verified_at IS NOT NULL
    FOR SHARE OF target, theirs, mine
  `)
  return rows.length > 0
}

/**
 * One direction of the exchange. Returns whether a row was actually created.
 *
 * **`ON CONFLICT DO NOTHING` is FR-1025's idempotency, and the `shared_at` it does not touch is
 * the requirement.** A repeat share affects zero rows and the existing row survives unchanged,
 * so re-sharing cannot be used to signal somebody repeatedly.
 */
const recordCard = async (
  db: CardExecutor,
  sharerId: string,
  recipientId: string,
  eventId: string,
): Promise<boolean> => {
  const inserted = await db.execute<{ id: string }>(sql`
    INSERT INTO shared_cards (sharer_id, recipient_id, event_id)
    VALUES (${sharerId}::uuid, ${recipientId}::uuid, ${eventId}::uuid)
    ON CONFLICT (sharer_id, recipient_id) DO NOTHING
    RETURNING id
  `)
  return inserted.length > 0
}

/**
 * Exchange cards with another attendee (FR-1021–FR-1030, FR-1053).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **MUTUAL: ONE ACT WRITES TWO ROWS, AND THE RECIPIENT IS NOT ASKED** (FR-1021, FR-1023).
 *
 * **This reverses what this function did until 016, and the reversal is ratified rather than
 * inferred** — constitution **v5.0.0 (C1)**, which retracts v3.2.0 (N2) and the sentence that
 * carried it: *"nothing about a person may become durable without that person's own act."* The
 * client asked for it independently (REQ-046) and the owner ratified it before any code changed.
 *
 * There is **no pending state and no acceptance step**. Both parties hold each other's card the
 * moment this commits, and the recipient learns of it on their next visit to Network — nothing
 * is dispatched (FR-1029) and no Home card exists for contacts (FR-1030). That is an accepted
 * consequence of C1, recorded as an open question in the specification rather than absorbed.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **BOTH ROWS OR NEITHER, WHICH IS WHY THIS OPENS A TRANSACTION** (FR-1022).
 *
 * Contacts are mutual or absent, never one-sided (SC-1007). The previous shape ran its
 * statements against the pool, where each autocommits — see `CardExecutor` above — so this is a
 * restructure rather than a second insert added beside the first.
 *
 * **Both rows carry the same `event_id`, and it is a historical fact rather than a scope**
 * (FR-1024). They arise from one act at one place, so the reciprocal row is *not* re-derived
 * from the recipient's own registrations. Standing decision 7 forbids assuming either scoping
 * rule, and `cards.test.ts` asserts the cross-event half rather than inheriting it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **The unique constraint is directional, and that is why this needs no migration.**
 * `(sharer_id, recipient_id)` in that order means A→B and B→A are two distinct pairs which
 * coexist with no conflict. Its docblock says normalising to an unordered pair *"would be a bug
 * rather than a tidy-up"* — mutual exchange is the case that proves it.
 */
export const shareCard = async (
  sharerId: string,
  recipientId: string,
  eventId: string,
): Promise<ShareOutcome> => {
  if (!UUID.test(recipientId)) return { outcome: 'unreachable' }
  // Refused rather than absorbed: the CHECK constraint would reject it anyway, and somebody who
  // asked to share with themselves has made a mistake worth naming rather than a no-op worth
  // hiding. `queries/blocks.ts` makes the same call for the same reason.
  if (sharerId === recipientId) return { outcome: 'self' }

  return getDb().transaction(async (tx): Promise<ShareOutcome> => {
    // Before anything is written, so a refused attempt writes nothing at all — and because the
    // outcome must be distinguishable from `unreachable` *here*, even though both are opaque to
    // the caller.
    if (await blockStands(tx, sharerId, recipientId)) return { outcome: 'refused' }

    let created = false

    if (await exchangePermitted(tx, sharerId, recipientId, eventId)) {
      // ═══════════════════════════════════════════════════════════════════════════════════
      // **THE TWO ROWS ARE WRITTEN IN A DETERMINISTIC ORDER, AND THAT IS A DEADLOCK FIX.**
      //
      // Writing them in the caller's order — theirs first, then the reciprocal — deadlocks when
      // **both attendees share with each other at the same moment**, which the specification
      // names as an edge case that must produce one relationship in each direction with
      // *neither share failing*.
      //
      // The mechanism: each insert takes a lock on its own key in the `(sharer_id,
      // recipient_id)` unique index. A shares with B and takes `(A,B)` then waits for `(B,A)`;
      // B shares with A and takes `(B,A)` then waits for `(A,B)`. PostgreSQL detects the cycle
      // and aborts one transaction with **40P01**, so one attendee's share 500s. Verified
      // against a real database rather than reasoned about — see `cards-concurrency.test.ts`.
      //
      // Sorting the pair makes both transactions acquire the same two locks in the same order,
      // so the second simply waits and then absorbs its `ON CONFLICT DO NOTHING`. **Sorting by
      // `sharerId` alone is sufficient and total**: the two rows swap those values, and a
      // self-share was refused above, so the two are never equal.
      //
      // **THE FIX TRADES AN ABORT FOR A WAIT, AND THE WAIT IS BOUNDED ELSEWHERE.** A transaction
      // that waits holds one of ten pooled connections while it does, so without a ceiling this
      // would have replaced one attendee's 500 with a way to exhaust the pool every route shares.
      // `db/client.ts` sets `lock_timeout` on the application pool for exactly this, and states
      // the values and how a timeout surfaces — read it before assuming this loop can only ever
      // wait for a moment.
      // ═══════════════════════════════════════════════════════════════════════════════════
      const forward = { sharer: sharerId, recipient: recipientId }
      const reciprocal = { sharer: recipientId, recipient: sharerId }
      const ordered =
        forward.sharer < reciprocal.sharer ? [forward, reciprocal] : [reciprocal, forward]

      for (const row of ordered) {
        const wroteRow = await recordCard(tx, row.sharer, row.recipient, eventId)

        // ─────────────────────────────────────────────────────────────────────────────────
        // **The forward row decides `created`, and the reciprocal one deliberately does not** —
        // which is why the loop tracks direction rather than taking the last result.
        //
        // FR-1025's "no duplicate, no failure" is about the relationship the sharer asked for.
        // It also gives a re-share a useful repair property: a pair holding only the forward
        // row — every card written before 016 — gains its reciprocal on the next share, while
        // the outcome still reads `existing` because nothing new was given away. That is the
        // migration-free path for existing data.
        // ─────────────────────────────────────────────────────────────────────────────────
        if (row === forward) created = wroteRow
      }
    }

    // ─────────────────────────────────────────────────────────────────────────────────────
    // Read back from `shared_cards`, never from `attendees` — the same oracle-closing move
    // `blockAttendee` records. `ON CONFLICT DO NOTHING` erases the distinction between "already
    // shared" and "not reachable" (both affect zero rows), so the outcome has to come from a
    // read; asking whether the *card* exists answers it without asking whether the *attendee*
    // does. A refused guard lands here too, and is reported as `unreachable` alongside a
    // nonexistent attendee — which is FR-1028.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const rows = await tx.execute<{
      attendee_id: string
      display_name: string
      event_id: string
      event_name: string
      shared_at: string
    }>(sql`
      SELECT
        r.id AS attendee_id,
        r.display_name,
        c.event_id,
        e.name AS event_name,
        ${sql.raw(isoInstant('c.shared_at'))} AS shared_at
      FROM shared_cards c
      JOIN attendees r ON r.id = c.recipient_id
      JOIN events e ON e.id = c.event_id
      WHERE c.sharer_id = ${sharerId}::uuid AND c.recipient_id = ${recipientId}::uuid
    `)

    const row = rows[0]
    if (!row) return { outcome: 'unreachable' }

    return {
      outcome: created ? 'created' : 'existing',
      card: {
        attendeeId: row.attendee_id,
        displayName: row.display_name,
        eventId: row.event_id,
        eventName: row.event_name,
        sharedAt: row.shared_at,
      },
    }
  })
}

/**
 * The projection every held-card read shares.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE FRAGMENT, SO THE LIST AND THE SINGLE READ CANNOT DISAGREE ABOUT VISIBILITY.**
 *
 * The three absences described in the file header, plus the block join, are the whole of this
 * feature's read-side authorization. Written twice, they would be two places for a condition to
 * drift — and the drift that matters is silent: a list that excluded blocked pairs beside a
 * single read that did not would leave a blocked person's live profile readable at a guessable
 * address while their name was gone from the list.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * `activeEventId` may be null — an attendee between conferences still has contacts (FR-614) —
 * in which case nobody is at the active event and no scheduling action is offered anywhere.
 */
const heldCardSelect = (readerId: string, activeEventId: string | null) => sql`
  SELECT
    s.id                                        AS attendee_id,
    s.display_name                              AS display_name,
    s.avatar_object_key                         AS avatar_object_key,
    p.company                                   AS company,
    p.role                                      AS role,
    p.headline                                  AS headline,
    coalesce(listed.interests, ARRAY[]::text[]) AS interests,
    c.event_id                                  AS event_id,
    e.name                                      AS event_name,
    ${sql.raw(isoInstant('c.shared_at'))}       AS shared_at,
    ${
      activeEventId === null
        ? sql`false`
        : sql`EXISTS (
            SELECT 1 FROM registrations here
            WHERE here.attendee_id = s.id AND here.event_id = ${activeEventId}::uuid
          )`
    }                                           AS at_active_event
  FROM shared_cards c
  -- The sharer, joined LIVE. There is no stored copy of any of this (FR-611).
  JOIN attendees s ON s.id = c.sharer_id
  JOIN events e ON e.id = c.event_id
  LEFT JOIN attendee_profiles p ON p.attendee_id = s.id
  -- An attendee who has written no interests is a person with an empty list, not a person who
  -- does not exist — so LEFT, exactly as the directory has it.
  LEFT JOIN LATERAL (
    SELECT array_agg(ai.interest ORDER BY ai.interest) AS interests
    FROM attendee_interests ai
    WHERE ai.attendee_id = s.id
  ) listed ON true
  WHERE c.recipient_id = ${readerId}::uuid
    -- ═══════════════════════════════════════════════════════════════════════════════════
    -- **THERE IS NO DISCOVERABILITY CONDITION AND NO VERIFICATION CONDITION HERE, AND THERE
    -- MUST NEVER BE ONE** (FR-612, FR-613). Read the file header before adding either — this
    -- is the standing consent, and losing it loses the feature.
    --
    -- **AND NO REGISTRATION JOIN** (FR-614): a held card resolves after the reader switches to
    -- a conference the sharer has never attended. The at_active_event column above answers the
    -- *display* question without becoming a filter.
    -- ═══════════════════════════════════════════════════════════════════════════════════
    AND NOT EXISTS (
      SELECT 1 FROM attendee_blocks b
      WHERE (b.blocker_id = c.recipient_id AND b.blocked_id = c.sharer_id)
         OR (b.blocker_id = c.sharer_id AND b.blocked_id = c.recipient_id)
    )
`

/**
 * Declared as a type alias rather than an interface on purpose: `db.execute<T>` constrains `T` to
 * `Record<string, unknown>`, and only a type alias carries the implicit index signature that
 * satisfies it. `queries/active-event.ts` records the same trap — changing this to an `interface`
 * breaks the build with an error whose cause is not obvious from the message.
 */
type HeldRow = {
  attendee_id: string
  display_name: string
  avatar_object_key: string | null
  company: string | null
  role: string | null
  headline: string | null
  interests: string[] | null
  event_id: string
  event_name: string
  shared_at: string
  at_active_event: boolean
}

const toHeldCard = (row: HeldRow): HeldCardRow => ({
  attendeeId: row.attendee_id,
  displayName: row.display_name,
  company: row.company,
  role: row.role,
  headline: row.headline,
  interests: row.interests ?? [],
  avatarObjectKey: row.avatar_object_key,
  eventId: row.event_id,
  eventName: row.event_name,
  sharedAt: row.shared_at,
  atActiveEvent: row.at_active_event,
})

/**
 * The contacts list (FR-610, FR-617).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T072's server half: this takes no `eventId` for filtering, and there is nowhere to put
 * one.** `activeEventId` decides only whether each contact is *schedulable*, never whether it is
 * *listed* — see `heldCardSelect`.
 *
 * **No cursor.** The list is bounded by deliberate human acts: somebody has to have handed you a
 * card. The spec's Assumptions state that plainly, and keyset pagination over a set nobody can
 * inflate would be machinery defending against nothing.
 *
 * Newest first, because the person you just met is the one you are looking for.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const listHeldCards = async (
  readerId: string,
  activeEventId: string | null,
): Promise<HeldCardRow[]> => {
  const rows = await getDb().execute<HeldRow>(sql`
    ${heldCardSelect(readerId, activeEventId)}
    ORDER BY c.shared_at DESC, s.id DESC
  `)

  return rows.map(toHeldCard)
}

/**
 * One held card, behind the branded scope (FR-616).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **TAKES A `CardScope`, WHICH ONLY `requireHeldCard` CAN CONSTRUCT.**
 *
 * A handler that skipped the guard has nothing to pass and does not compile. `assertVerifiedCard`
 * then checks membership rather than merely shape, because a value can satisfy the type and never
 * have been through the guard — the five probes `event-access.ts` records apply here unchanged.
 *
 * The scope carries **both** identifiers, so the reader cannot be supplied separately and cannot
 * disagree with the one the guard verified. That is the same removal of a failure mode
 * `listDirectory` records for its own reader parameter.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Re-applies the block condition through `heldCardSelect` rather than trusting the guard's own
 * lookup. The guard asks only "is there a card"; a block that arrived between the two would
 * otherwise leave one read answering after the other had stopped.
 */
export const readHeldCard = async (
  unverified: CardScope,
  activeEventId: string | null,
): Promise<HeldCardRow | null> => {
  const scope = assertVerifiedCard(unverified)

  const rows = await getDb().execute<HeldRow>(sql`
    ${heldCardSelect(scope.attendeeId, activeEventId)}
    AND c.sharer_id = ${scope.sharerId}::uuid
    LIMIT 1
  `)

  const row = rows[0]
  return row ? toHeldCard(row) : null
}

/**
 * T041 (016) — **people who hold your card** (FR-618's read side, redefined by FR-1051).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE QUERY, THE ROWS AND THE GUARD ARE UNCHANGED. WHAT CHANGED IS WHAT THEY MEAN.**
 *
 * This was documented from 008 until 016 as *cards you have given away*, and under mutual
 * exchange (v5.0.0 C1) that sentence describes rows the reader never consciously gave: when
 * somebody else shares first, a row `(sharer = reader, recipient = them)` appears from their
 * act. The column still means "whose card it is", and it is still the reader's — so the rows are
 * right and only the English was wrong.
 *
 * **Nothing would have caught this.** The route has no consumer, so there is no test that fails
 * when its description is false; that is why FR-1051 is a requirement rather than a cleanup.
 *
 * **Withdrawal was considered and rejected.** Removing an unused route would break nothing, but
 * it is the *only* route `CardScope` covers, and this project has twice recorded that the branded
 * guard is what makes adding a card-named route safe by default. Redefining costs a sentence;
 * withdrawing costs the guard its only exercise.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Excludes blocked pairs in both directions, matching the held list. A block is a refusal of
 * contact, and continuing to list somebody you have refused contact from would be neither useful
 * nor honest.
 */
export const listSharedCards = async (sharerId: string): Promise<SharedCardRow[]> => {
  const rows = await getDb().execute<{
    attendee_id: string
    display_name: string
    event_id: string
    event_name: string
    shared_at: string
  }>(sql`
    SELECT
      r.id AS attendee_id,
      r.display_name,
      c.event_id,
      e.name AS event_name,
      ${sql.raw(isoInstant('c.shared_at'))} AS shared_at
    FROM shared_cards c
    JOIN attendees r ON r.id = c.recipient_id
    JOIN events e ON e.id = c.event_id
    WHERE c.sharer_id = ${sharerId}::uuid
      AND NOT EXISTS (
        SELECT 1 FROM attendee_blocks b
        WHERE (b.blocker_id = c.sharer_id AND b.blocked_id = c.recipient_id)
           OR (b.blocker_id = c.recipient_id AND b.blocked_id = c.sharer_id)
      )
    ORDER BY c.shared_at DESC, r.id DESC
  `)

  return rows.map((row) => ({
    attendeeId: row.attendee_id,
    displayName: row.display_name,
    eventId: row.event_id,
    eventName: row.event_name,
    sharedAt: row.shared_at,
  }))
}
