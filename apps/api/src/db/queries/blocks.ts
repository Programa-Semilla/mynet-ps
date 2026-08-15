import { sql } from 'drizzle-orm'

import { getDb } from '../client.js'
// 008 — the single cross-feature call this module makes. See `blockAttendee` for why blocking
// must WRITE into appointments where it only READS against cards (FR-637a, research R6).
import { cancelAppointmentsBetween } from './appointments.js'

/**
 * T075 (007) — refusing contact (FR-535–FR-541a, data-model.md).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **DIRECTIONAL, AND NOTHING HERE MAY EVER ORDER THE PAIR.**
 *
 * `conversation_pairs` orders its two identifiers so that A–B and B–A are the same row. Doing
 * that here would be a bug, and a serious one: A blocking B and B blocking A are two independent
 * facts (FR-540), so collapsing them would mean **unblocking one releases both** — an attendee
 * who relented would silently restore the other person's block against them, re-opening a
 * channel that person had deliberately closed.
 *
 * The two tables sit next to each other with opposite treatments of the same shape, which is
 * exactly why each says which it is and why.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The blocker is always the session's attendee.** Every function takes it as `blockerId` from
 * the route, never from a request body, so there is no expression here that creates or releases
 * somebody else's block (FR-525).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface BlockedAttendeeRow {
  readonly attendeeId: string
  readonly displayName: string
  readonly avatarObjectKey: string | null
  readonly blockedAt: string
}

/** What `block` resolved to, so the route can answer without a second read. */
export type BlockOutcome = 'blocked' | 'self' | 'unreachable'

/**
 * Block an attendee. **Idempotent** (FR-535), and **deletes nothing** (FR-538).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * `ON CONFLICT DO NOTHING` against the composite primary key, so a double-tap on a confirmation
 * is the same request twice rather than a state the unblock path has to unwind.
 *
 * **The insert is guarded by `WHERE EXISTS`, and the outcome comes from a second read.** An
 * earlier version of this comment claimed the existence check was "folded into the insert" and
 * that no separate read happened — it was describing a design this function does not have.
 * `ON CONFLICT DO NOTHING` erases the distinction the caller needs (already-blocked and
 * no-such-attendee both affect zero rows), so the outcome has to be read separately.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **REACHABILITY IS REQUIRED, AND ITS ABSENCE WAS A DISCLOSURE.**
 *
 * This used to accept any attendee UUID that merely *existed* — no shared conference, no
 * conversation, nothing. `GET /blocks` then joins `attendees` **live** and returns the target's
 * current display name and card avatar. So a UUID harvested from Discover during a conference
 * could be blocked and thereafter read indefinitely: after the target turned discoverability off,
 * after they left the event, after the reader left. That is a server-side surface with exactly
 * the property 006 refuses to cache the directory for — *other people's personal data outliving
 * the moment they chose to be invisible* (FR-363).
 *
 * A block is a refusal of contact, so it is only meaningful against somebody who could contact
 * you. `POST /conversations` already uses that predicate; this now uses the same one.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Blocking removes no message and rewrites no history. The blocker keeps everything either of
 * them wrote, and unblocking restores sending with nothing lost — which is what makes a block a
 * *refusal of future contact* rather than a deletion an attendee cannot undo.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const blockAttendee = async (
  blockerId: string,
  blockedId: string,
  /**
   * 008 — where to record a failed appointment cancellation. Passed from the route rather than
   * reached for, which is the shape 007's `dispatchToDevices` established for the same reason:
   * a query module has no request and no logger of its own, and inventing one here would be a
   * second place logging is configured.
   *
   * Optional so no existing caller changes; a caller that omits it loses only the diagnosis.
   */
  log?: { error: (details: Record<string, unknown>, message: string) => void },
): Promise<BlockOutcome> => {
  if (!UUID.test(blockedId)) return 'unreachable'
  // Refused rather than absorbed: the CHECK constraint would reject it anyway, and a caller who
  // asked to block themselves has made a mistake worth naming rather than a no-op worth hiding.
  if (blockerId === blockedId) return 'self'

  // Reachable = shares a current conference, **or** already has a conversation with the caller.
  // The second half matters because conversations outlive events (FR-507): somebody you spoke to
  // last year must remain blockable after you stop co-attending.
  await getDb().execute(sql`
    INSERT INTO attendee_blocks (blocker_id, blocked_id)
    SELECT ${blockerId}::uuid, ${blockedId}::uuid
    WHERE EXISTS (
      SELECT 1
      FROM registrations mine
      JOIN registrations theirs ON theirs.event_id = mine.event_id
      WHERE mine.attendee_id = ${blockerId}::uuid AND theirs.attendee_id = ${blockedId}::uuid
    )
    OR EXISTS (
      SELECT 1 FROM conversation_pairs
      WHERE (lower_attendee_id, higher_attendee_id) IN (
        (LEAST(${blockerId}::uuid, ${blockedId}::uuid),
         GREATEST(${blockerId}::uuid, ${blockedId}::uuid))
      )
    )
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING
  `)

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **THE OUTCOME IS READ FROM THE BLOCK TABLE, NOT FROM `attendees` — AND THAT CLOSES AN ORACLE.**
  //
  // This used to answer `no-such-attendee` (→ 404) when the target did not exist and 204 when it
  // did, which made the route a plain attendee-existence oracle: hand it a UUID, read the status.
  // `POST /conversations` goes to considerable length not to be one ("distinguishing them would
  // turn this route into an oracle for 'is this identifier a real attendee'"), and the same
  // product answered the question freely one route over.
  //
  // Now the answer is "is there a block", which is true only for a target the caller could
  // legitimately reach. Everything else — nonexistent, unreachable, never co-attended — is the
  // same 204, because a block is idempotent and writing nothing is indistinguishable from having
  // written nothing.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const rows = await getDb().execute<{ blocked: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM attendee_blocks
      WHERE blocker_id = ${blockerId}::uuid AND blocked_id = ${blockedId}::uuid
    ) AS blocked
  `)

  const outcome = rows[0]?.blocked === true ? 'blocked' : 'unreachable'

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // T125, T126 (008) — **the one call 008 adds to a file 007 owns** (FR-637a, research R6).
  //
  // A block ends any live meeting between the pair: pending proposals and **future** confirmed
  // appointments are cancelled and their slots freed. `cancelAppointmentsBetween` is 008's
  // function; this is its only call site, and it is here because **the only moment we know a
  // block happened is when it is created.**
  //
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **T126 — READ-TIME FILTERING WAS CONSIDERED AND REJECTED, AND THE REASON IS FR-637a
  // ITSELF.**
  //
  // Treating appointments between blocked parties as cancelled *when displayed* would need no
  // write at all, and it is what this feature does for **cards** one file over. It is wrong here
  // for two reasons:
  //
  //   1. it leaves stored state disagreeing with displayed state — the meeting is `confirmed` in
  //      the database and "cancelled" on screen, and the one that gets read decides whether the
  //      slot is free; and
  //   2. **lifting the block would resurrect the meeting**, which FR-637a forbids outright.
  //
  // That second point is the whole asymmetry the specification declares: blocking **suspends a
  // relationship** (a card resolves again when the block is lifted — read-side, reversible, no
  // write) and **ends a commitment** (a cancelled meeting stays cancelled). Those are different
  // things, and this line is where the difference is implemented.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  //
  // Ordered **after** the block is established, so a failure here cannot leave somebody
  // unblocked; and only when a block was actually created, so an unreachable target writes
  // nothing at all.
  if (outcome === 'blocked') {
    // ─────────────────────────────────────────────────────────────────────────────────────
    // **A FAILURE HERE MUST NOT BE SILENT, BECAUSE NOTHING ELSE WOULD EVER NOTICE IT.**
    //
    // The block is already committed by this point, deliberately — a failure must not leave
    // somebody unblocked. The other ordering has a cost the original comment did not weigh: if
    // this statement fails, the block stands and the meetings between the pair survive, and no
    // read path filters them (appointments are severed by a WRITE, not read-side — that is the
    // whole cards/appointments asymmetry). So the inconsistency is permanent and invisible.
    //
    // Rethrowing would be worse: it would answer 500 to a caller whose block *did* land, and
    // the retry would find the block already present and skip this branch entirely. So the
    // failure is caught, recorded, and the block reported as the success it was —
    // `notifyRecipient` in 007's send path makes the same trade for the same reason.
    //
    // `cancelAppointmentsBetween` is idempotent, so an operator repairing this by hand simply
    // re-runs the block.
    // ─────────────────────────────────────────────────────────────────────────────────────
    try {
      await cancelAppointmentsBetween(blockerId, blockedId)
    } catch (error) {
      log?.error(
        { err: error, blockerId, blockedId },
        'appointment cancellation after a block failed — the block stands, the meetings do not',
      )
    }
  }

  return outcome
}

/**
 * Unblock. **Directional** (FR-540) — releases only the caller's block.
 *
 * If the other attendee also blocks the caller, that row is untouched and nothing here reveals
 * that it exists. Idempotent: unblocking somebody who is not blocked succeeds and changes
 * nothing, so a stale management list cannot produce an error the attendee has to interpret.
 */
export const unblockAttendee = async (blockerId: string, blockedId: string): Promise<void> => {
  if (!UUID.test(blockedId)) return

  await getDb().execute(sql`
    DELETE FROM attendee_blocks
    WHERE blocker_id = ${blockerId}::uuid AND blocked_id = ${blockedId}::uuid
  `)
}

/**
 * Everyone this attendee has blocked (FR-541).
 *
 * **Served to the block's owner only**, and it is the one place this feature discloses a profile
 * detail outside a conversation. The disclosure is bounded rather than incidental: the caller
 * already knows exactly who these people are, having blocked them by hand, and a list of opaque
 * identifiers would be unusable for the single action it exists to support.
 *
 * Newest first, because the block somebody wants to reverse is usually the one they just made.
 */
export const listBlocks = async (blockerId: string): Promise<BlockedAttendeeRow[]> => {
  const rows = await getDb().execute<{
    attendee_id: string
    display_name: string
    avatar_object_key: string | null
    blocked_at: string
  }>(sql`
    SELECT
      a.id AS attendee_id,
      a.display_name,
      a.avatar_object_key,
      to_char(b.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS blocked_at
    FROM attendee_blocks b
    JOIN attendees a ON a.id = b.blocked_id
    WHERE b.blocker_id = ${blockerId}::uuid
    ORDER BY b.created_at DESC, a.id DESC
  `)

  return rows.map((row) => ({
    attendeeId: row.attendee_id,
    displayName: row.display_name,
    avatarObjectKey: row.avatar_object_key,
    blockedAt: row.blocked_at,
  }))
}

/**
 * T076 (007) — **the question the send path asks, on every single message** (FR-536).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **BIDIRECTIONAL, WHICH IS NOT THE SAME AS THE TABLE BEING BIDIRECTIONAL.**
 *
 * The rows are directional and must stay so. This *question* is not: a send is refused when
 * either attendee blocks the other, and the two cases are refused for different reasons that
 * happen to share an answer.
 *
 *   - **The recipient blocks the sender** — FR-536. The sender is refused with a reasonless 409
 *     and never learns why (FR-537).
 *   - **The sender blocks the recipient** — FR-539. The blocker's own composer is unavailable
 *     with an explanation and an unblock action, because sending to somebody you have refused
 *     contact from is incoherent. Their client already knows: `state: 'blocked'` arrives on the
 *     conversation, which is *their* record of *their* choice.
 *
 * Both produce the same server-side refusal, so the server never has to decide which story to
 * tell — and the one party entitled to an explanation already has it.
 *
 * Takes effect immediately (SC-506): this is read on the send path itself, not cached anywhere,
 * so the next send by a blocked attendee is refused whether or not they have the thread open.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const blockExistsBetween = async (one: string, other: string): Promise<boolean> => {
  // ───────────────────────────────────────────────────────────────────────────────────────
  // **Matched before it is cast**, because this runs on the send path *before* the recipient
  // identifier has been validated anywhere else. Without it a malformed identifier reaches
  // `::uuid` and produces a 500 — which is distinguishable from the 404 that a nonexistent
  // attendee gets, and therefore an oracle for "is this even a well-formed identifier".
  //
  // An integration test caught exactly that: `POST /conversations` with `attendeeId:
  // 'not-a-uuid'` answered 500 the moment the block check moved ahead of the creation query.
  // ───────────────────────────────────────────────────────────────────────────────────────
  if (!UUID.test(one) || !UUID.test(other)) return false

  const rows = await getDb().execute<{ blocked: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM attendee_blocks
      WHERE (blocker_id = ${one}::uuid AND blocked_id = ${other}::uuid)
         OR (blocker_id = ${other}::uuid AND blocked_id = ${one}::uuid)
    ) AS blocked
  `)

  return rows[0]?.blocked === true
}

/**
 * Whether a block stands between the caller and **whoever else is in this conversation**.
 *
 * The send path into an existing conversation has a conversation identifier rather than a
 * counterpart's, so the counterpart is resolved from the participant rows here rather than being
 * passed in — which also means a one-sided conversation, whose counterpart has deleted their
 * account, correctly reports no block. That case is refused by FR-574's closed check instead,
 * and the two refusals are deliberately different (contract).
 */
export const blockExistsInConversation = async (
  attendeeId: string,
  conversationId: string,
): Promise<boolean> => {
  const rows = await getDb().execute<{ blocked: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM conversation_participants other
      JOIN attendee_blocks b
        ON (b.blocker_id = ${attendeeId}::uuid AND b.blocked_id = other.attendee_id)
        OR (b.blocker_id = other.attendee_id AND b.blocked_id = ${attendeeId}::uuid)
      WHERE other.conversation_id = ${conversationId}::uuid
        AND other.attendee_id <> ${attendeeId}::uuid
    ) AS blocked
  `)

  return rows[0]?.blocked === true
}
