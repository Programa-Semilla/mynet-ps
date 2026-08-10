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

/** One card the reader has given away. Deliberately thinner — see `interfaces/cards.ts`. */
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
 * Give the caller's card to another attendee (FR-601–FR-609).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE-DIRECTIONAL: THIS WRITES EXACTLY ONE ROW, AND IT IS THE RECIPIENT WHO GAINS A CONTACT.**
 *
 * The sharer gains nothing (FR-602). If reciprocity ever seems like an obvious convenience, it
 * is the model constitution v3.2.0 (N2) rejected: you hold somebody's card when *they* decide to
 * give it, and a share that quietly took one in return would make every exchange mutual without
 * either party choosing it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **REACHABILITY IS PART OF THE INSERT, NOT A SEPARATE READ** (FR-607).
 *
 * `WHERE EXISTS (shared registration AND discoverable AND verified)`, so a nonexistent attendee,
 * one sharing no conference, one who is not discoverable, and one who has not verified all
 * affect zero rows and are **indistinguishable** to the caller. That is 006's four-way
 * indistinguishability inherited: distinguishing them would turn this route into an oracle for
 * "is this identifier a real attendee", against a world-readable repository and public self
 * sign-up.
 *
 * Note the conditions here are the *directory's*, deliberately — you may only share with somebody
 * you could have **found**. That is the exact opposite of the resolution rule above, and the two
 * are not in tension: discoverability governs whether a relationship can *start*, and standing
 * consent governs whether it *continues*.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **`ON CONFLICT DO NOTHING` is FR-604's idempotency, and the `shared_at` it does not touch is
 * the requirement.** A repeat share affects zero rows and the existing row is read back
 * unchanged, so re-sharing cannot be used to signal somebody repeatedly.
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

  const db = getDb()

  // ───────────────────────────────────────────────────────────────────────────────────────
  // The block check, **before anything is written** (FR-608).
  //
  // Bidirectional though the rows are not: a share is refused when either attendee blocks the
  // other. The recipient blocking the sharer is the obvious case; the sharer having blocked the
  // recipient is incoherence, and their own client already knows. Both take the same reasonless
  // 409 at the route, so the server never has to decide which story to tell.
  //
  // Ordered before the insert rather than folded into it, because a refused attempt must write
  // nothing at all — and because the outcome has to be distinguishable from `unreachable` here
  // even though both are opaque to the caller.
  // ───────────────────────────────────────────────────────────────────────────────────────
  const blocked = await db.execute<{ blocked: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM attendee_blocks
      WHERE (blocker_id = ${sharerId}::uuid AND blocked_id = ${recipientId}::uuid)
         OR (blocker_id = ${recipientId}::uuid AND blocked_id = ${sharerId}::uuid)
    ) AS blocked
  `)
  if (blocked[0]?.blocked === true) return { outcome: 'refused' }

  const inserted = await db.execute<{ id: string }>(sql`
    INSERT INTO shared_cards (sharer_id, recipient_id, event_id)
    SELECT ${sharerId}::uuid, ${recipientId}::uuid, ${eventId}::uuid
    WHERE EXISTS (
      SELECT 1
      FROM attendees target
      JOIN registrations theirs
        ON theirs.attendee_id = target.id AND theirs.event_id = ${eventId}::uuid
      JOIN registrations mine
        ON mine.attendee_id = ${sharerId}::uuid AND mine.event_id = ${eventId}::uuid
      WHERE target.id = ${recipientId}::uuid
        AND target.discoverable = true
        AND target.email_verified_at IS NOT NULL
    )
    ON CONFLICT (sharer_id, recipient_id) DO NOTHING
    RETURNING id
  `)

  // ───────────────────────────────────────────────────────────────────────────────────────
  // Read back from `shared_cards`, never from `attendees` — the same oracle-closing move
  // `blockAttendee` records. `ON CONFLICT DO NOTHING` erases the distinction between "already
  // shared" and "not reachable" (both affect zero rows), so the outcome has to come from a
  // second read; asking whether the *card* exists answers it without asking whether the
  // *attendee* does.
  // ───────────────────────────────────────────────────────────────────────────────────────
  const rows = await db.execute<{
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
    outcome: inserted.length > 0 ? 'created' : 'existing',
    card: {
      attendeeId: row.attendee_id,
      displayName: row.display_name,
      eventId: row.event_id,
      eventName: row.event_name,
      sharedAt: row.shared_at,
    },
  }
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
 * Cards the reader has given away (FR-618's read side).
 *
 * Excludes blocked pairs in both directions, matching the held list. A block is a refusal of
 * contact, and continuing to list somebody you have refused contact from — under a heading
 * saying you gave them your details — would be neither useful nor honest.
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
