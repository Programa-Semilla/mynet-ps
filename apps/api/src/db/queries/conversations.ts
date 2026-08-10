import { sql } from 'drizzle-orm'

import { assertVerifiedParticipation, type ConversationScope } from '../../plugins/participation.js'
import { getDb, type Database } from '../client.js'
import { isSendableBody, normaliseBody } from './messages.js'

/**
 * The open transaction, as the helpers below see it.
 *
 * Derived from `Database['transaction']` rather than restated, so it cannot drift from what
 * Drizzle actually hands the callback — a hand-written structural type (`{ execute: … }`) looks
 * equivalent and is not: `execute` is generic, and a structural stand-in loses the row type.
 */
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * T038 (007) — opening a conversation, which happens by somebody speaking and by nothing else
 * (FR-502–FR-506, FR-510, research R10).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ONE FILE IN THE FEATURE THAT TAKES A BARE ATTENDEE IDENTIFIER, AND THE REASON
 * IS RECORDED RATHER THAN ASSUMED.**
 *
 * Every other read and write in Messages goes through a branded `ConversationScope`, because
 * every other one names a conversation the caller might not be in. This one cannot: the
 * conversation does not exist yet, so there is no participation to verify and nothing for the
 * guard to construct. What replaces it is the pair of conditions below —
 *
 *   - the **actor** is the session's attendee, passed by the route and never by the client, and
 *   - the **recipient** must share at least one conference with them (FR-504) —
 *
 * and the conversation identifier is then *derived* from the ordered pair rather than accepted
 * from anybody. There is no argument here in which a caller could name a conversation, which is
 * what keeps this route outside the participation guard without being outside its guarantee.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * What opening resolved to.
 *
 * `created` and `appended` differ only in the status the route returns — 201 against 200 — and
 * the contract is explicit that the body is identical. FR-510 requires that a second attempt
 * never creates a second conversation; the caller has no reason to know which happened, and
 * surfacing it would let a client tell whether the pair had spoken before.
 */
export type OpenConversationResult =
  | {
      readonly outcome: 'created' | 'appended'
      readonly conversationId: string
      readonly messageId: string
      readonly sentAt: string
    }
  /**
   * No such attendee, no conference in common, a malformed identifier, or the caller themselves.
   *
   * **One outcome for all four**, because the route answers all four with one 404 (FR-504,
   * FR-506). Splitting them here would be the first half of splitting them there: a handler that
   * *can* tell them apart is a handler somebody later improves the error message of.
   */
  | { readonly outcome: 'unreachable' }
  /** The body was empty, whitespace-only, or over the limit. The route answers 400. */
  | { readonly outcome: 'invalid-body' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether two attendees share at least one conference **right now** (FR-504).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Evaluated exactly once in the whole product, here, and never stored** (FR-505, data-model).
 * A conversation, once created, is permanent: it survives the conference ending, either attendee
 * withdrawing, and both of them never attending the same thing again. Re-checking on read would
 * make a thread vanish and reappear as registrations changed, which is the state M2 rules out.
 *
 * A recipient who does not exist has no registrations, so this is false for them too — which is
 * what makes "no such attendee" and "no conference in common" indistinguishable **by
 * construction** rather than by two careful branches. The route is public-facing with a
 * caller-supplied identifier in its body; a distinguishable answer would turn it into an oracle
 * for "is this uuid a real MyNet attendee".
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const shareAnyConference = async (
  tx: Transaction,
  actorId: string,
  recipientId: string,
): Promise<boolean> => {
  const rows = await tx.execute<{ shared: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM registrations mine
      JOIN registrations theirs ON theirs.event_id = mine.event_id
      WHERE mine.attendee_id = ${actorId}::uuid
        AND theirs.attendee_id = ${recipientId}::uuid
    ) AS shared
  `)
  return rows[0]?.shared === true
}

/**
 * Whether these two already have a conversation.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS EXISTS SO THE ROUTE CAN CHARGE THE RIGHT THROTTLE, AND THAT WAS A REQUIREMENT BREACH.**
 *
 * `POST /conversations` serves two outcomes: opening a conversation with somebody new, and
 * appending to one that already exists (FR-510 — reopening from a profile lands on the same
 * thread). It used to charge `conversation_create` for both, before knowing which it was.
 *
 * `conversation_create` is the **one throttle in this feature permitted to deny** (FR-504a), and
 * it bounds *how many distinct people* one account reaches. An append is not a new person — it is
 * a message send, and FR-511a says a send "may delay a legitimate sender but never denies them
 * outright". Since Discover's Message action always routes through this endpoint, an attendee who
 * had opened five conversations was refused a 429 when writing to somebody they already knew.
 *
 * A pre-check races the write in principle: the pair could appear between this read and the
 * transaction. The consequence is that one send is charged to the wrong counter, which is
 * strictly better than the alternative of denying a legitimate one.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const conversationExistsBetween = async (
  actorId: string,
  otherId: string,
): Promise<boolean> => {
  // Guarded before the cast, like every other `::uuid` in this feature. Without it a malformed
  // identifier reaches PostgreSQL and raises — answering **500** where the route's whole contract
  // is that a malformed id, a nonexistent one, a stranger and yourself are byte-identical 404s.
  // `conversation-co-attendance.test.ts` caught exactly that.
  if (!UUID.test(actorId) || !UUID.test(otherId)) return false

  const [lower, higher] = [actorId, otherId].sort()

  const rows = await getDb().execute<{ found: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1 FROM conversation_pairs
      WHERE lower_attendee_id = ${lower}::uuid AND higher_attendee_id = ${higher}::uuid
    ) AS found
  `)

  return rows[0]?.found === true
}

/**
 * Opens a conversation with a co-attendee by writing its first message, or appends to the one
 * that already exists (FR-503, FR-510).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE UNIQUE CONSTRAINT ARBITRATES. THERE IS NO CHECK-THEN-CREATE.**
 *
 * The lookup below is an optimisation for the ordinary case, not the enforcement: it is followed
 * by an `INSERT … ON CONFLICT DO NOTHING`, and losing that conflict is a supported path rather
 * than an error. The specification names the case this exists for — two attendees composing a
 * first message to each other at the same instant — and a read-then-write leaves a window in
 * which both see nothing and both create, giving the pair two conversations permanently.
 *
 * Under READ COMMITTED, `ON CONFLICT DO NOTHING` waits for the competing transaction to finish
 * and then returns no row; the `SELECT` that follows takes a fresh snapshot and finds the
 * winner's. So the loser appends to the winner's conversation and both messages survive.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A lost race leaves a conversation row that must be removed, and this is the only place that
 * can know it.** The pair row's primary key is the conversation identifier, so a conversation has
 * to exist before the pair can be claimed. A conversation with no pair row is unreachable by
 * every product surface — it has no participants, so nobody can read it — which means it would
 * accumulate silently, one row per contended first message, with nothing to notice. It is
 * deleted inside the same transaction, before anybody else can observe it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const createConversationWithFirstMessage = async (
  actorId: string,
  recipientId: string,
  body: string,
): Promise<OpenConversationResult> => {
  // Matched rather than cast, because a failed `::uuid` cast produces a 500 and a 500 is
  // distinguishable from a 404 — the same reasoning `requireEventAccess` records for matching
  // the event id rather than parsing it.
  if (!UUID.test(recipientId)) return { outcome: 'unreachable' }

  // FR-506. Co-attendance is trivially satisfied by oneself, so this needs saying explicitly —
  // and it must produce the *same* outcome as the other refusals, or the route reports "that is
  // you" to anybody probing identifiers.
  if (recipientId === actorId) return { outcome: 'unreachable' }

  const normalised = normaliseBody(body)
  if (!isSendableBody(normalised)) return { outcome: 'invalid-body' }

  // Ordered here as well as constrained in the database. The CHECK is the last line of defence;
  // this is what makes A→B and B→A land on the same row rather than colliding by accident.
  const [lower, higher] = [actorId, recipientId].sort()

  return getDb().transaction(async (tx) => {
    if (!(await shareAnyConference(tx, actorId, recipientId))) {
      return { outcome: 'unreachable' } as const
    }

    const existing = await tx.execute<{ conversation_id: string }>(sql`
      SELECT conversation_id FROM conversation_pairs
      WHERE lower_attendee_id = ${lower}::uuid AND higher_attendee_id = ${higher}::uuid
    `)

    const known = existing[0]?.conversation_id
    if (known) {
      const stored = await insertMessage(tx, known, actorId, normalised)
      return { outcome: 'appended', conversationId: known, ...stored } as const
    }

    const created = await tx.execute<{ id: string }>(sql`
      INSERT INTO conversations DEFAULT VALUES RETURNING id
    `)
    const conversationId = created[0]?.id
    if (!conversationId) throw new Error('conversation insert returned no row')

    const claimed = await tx.execute<{ conversation_id: string }>(sql`
      INSERT INTO conversation_pairs (conversation_id, lower_attendee_id, higher_attendee_id)
      VALUES (${conversationId}::uuid, ${lower}::uuid, ${higher}::uuid)
      ON CONFLICT (lower_attendee_id, higher_attendee_id) DO NOTHING
      RETURNING conversation_id
    `)

    if (claimed.length === 0) {
      // Somebody else claimed this pair while we were inside this transaction. Undo our own
      // conversation — see the header — and append to theirs.
      await tx.execute(sql`DELETE FROM conversations WHERE id = ${conversationId}::uuid`)

      const winner = await tx.execute<{ conversation_id: string }>(sql`
        SELECT conversation_id FROM conversation_pairs
        WHERE lower_attendee_id = ${lower}::uuid AND higher_attendee_id = ${higher}::uuid
      `)
      const winnerId = winner[0]?.conversation_id
      // Unreachable in practice: `ON CONFLICT DO NOTHING` only declines because a row is there.
      if (!winnerId) throw new Error('pair conflict with no surviving conversation')

      const stored = await insertMessage(tx, winnerId, actorId, normalised)
      return { outcome: 'appended', conversationId: winnerId, ...stored } as const
    }

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Both participant rows, in the same statement.** Participation is the authorization
    // predicate (FR-523), so writing only the sender's row would produce a message the recipient
    // is refused with 404 — indistinguishable, to them, from the conversation not existing. The
    // failure is silent on the sending side and total on the receiving one, which is why T033
    // counts these rows rather than trusting the response.
    //
    // Neither carries a read position: null until somebody actually reads (FR-526, FR-529).
    // ───────────────────────────────────────────────────────────────────────────────────────
    await tx.execute(sql`
      INSERT INTO conversation_participants (conversation_id, attendee_id)
      VALUES (${conversationId}::uuid, ${lower}::uuid), (${conversationId}::uuid, ${higher}::uuid)
    `)

    const stored = await insertMessage(tx, conversationId, actorId, normalised)
    return { outcome: 'created', conversationId, ...stored } as const
  })
}

/**
 * One row of the conversation list, before the avatar bytes are attached.
 *
 * `counterpartId` and `displayName` are **null together** when the other participant has deleted
 * their account (FR-573). There is no name and no identifier to hand back, because nothing was
 * retained — the client renders the closed treatment from `state`, never from a placeholder.
 */
export interface ConversationListRow {
  readonly conversationId: string
  readonly counterpartId: string | null
  readonly displayName: string | null
  readonly avatarObjectKey: string | null
  readonly lastBody: string | null
  readonly lastSentAt: string | null
  readonly lastMine: boolean | null
  readonly unread: boolean
  readonly state: 'open' | 'one_sided' | 'blocked'
}

/**
 * T056 (007) — every conversation this attendee participates in, most recent first (FR-508).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **NOT PAGINATED, AND THAT IS A DECISION** (contract). An attendee holds tens of these, and
 * FR-508's ordering is over the whole set — a page boundary would either reorder as messages
 * arrived or need the same snapshot 006's directory could not have.
 *
 * **Takes the attendee identifier from the session and nothing else.** There is no conversation
 * identifier here for a caller to supply, so there is nothing for `requireParticipation` to
 * verify: the `WHERE` on `conversation_participants` *is* the participation predicate, applied to
 * every row before any field is produced. A conversation the caller is not in cannot appear,
 * because the join that admits rows is the same one that proves membership.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`state` is derived here and stored nowhere** (data-model, State transitions). Two participant
 * rows means open, one means the counterpart has gone, and `blocked` means *this attendee blocks
 * the counterpart* — never the reverse, which FR-537 forbids disclosing to the person it refuses.
 * A stored status could disagree with the rows it summarises, and the day it did, the one that
 * got read would be the one deciding whether a departed attendee's thread still accepts messages.
 *
 * **`unread` excludes the attendee's own messages, and that is FR-529 rather than an
 * optimisation.** Unread is "a message from the other person that I have not read", so sending
 * cannot make a thread unread for the sender. It is computed from the read *position*, not from
 * who spoke last (FR-527) — the prototype's rule, and one that reports a thread as read the
 * moment you reply to its oldest message.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const listConversations = async (attendeeId: string): Promise<ConversationListRow[]> => {
  const rows = await getDb().execute<{
    conversation_id: string
    counterpart_id: string | null
    display_name: string | null
    avatar_object_key: string | null
    last_body: string | null
    last_sent_at: string | null
    last_mine: boolean | null
    unread: boolean
    participants: number
    blocked: boolean
  }>(sql`
    WITH mine AS (
      SELECT conversation_id, last_read_message_id
      FROM conversation_participants
      WHERE attendee_id = ${attendeeId}::uuid
    )
    SELECT
      c.id AS conversation_id,
      other.attendee_id AS counterpart_id,
      a.display_name,
      a.avatar_object_key,
      last.body AS last_body,
      to_char(last.sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_sent_at,
      (last.author_id = ${attendeeId}::uuid) AS last_mine,
      ${unreadPredicate(attendeeId)} AS unread,
      (SELECT count(*) FROM conversation_participants p WHERE p.conversation_id = c.id)
        AS participants,
      EXISTS (
        SELECT 1 FROM attendee_blocks b
        WHERE b.blocker_id = ${attendeeId}::uuid AND b.blocked_id = other.attendee_id
      ) AS blocked
    FROM conversations c
    JOIN mine ON mine.conversation_id = c.id
    LEFT JOIN conversation_participants other
      ON other.conversation_id = c.id AND other.attendee_id <> ${attendeeId}::uuid
    LEFT JOIN attendees a ON a.id = other.attendee_id
    LEFT JOIN LATERAL (
      SELECT m.body, m.sent_at, m.author_id
      FROM messages m
      WHERE m.conversation_id = c.id
      ORDER BY m.sent_at DESC, m.id DESC
      LIMIT 1
    ) last ON true
    -- NULLS LAST covers the instant between the conversation insert and its first message, which
    -- no reader outside that transaction can observe — but a NULL sorting first in Postgres's
    -- DESC default would put a phantom at the top of the list if one ever did.
    ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
  `)

  return rows.map((row) => ({
    conversationId: row.conversation_id,
    counterpartId: row.counterpart_id,
    displayName: row.display_name,
    avatarObjectKey: row.avatar_object_key,
    lastBody: row.last_body,
    lastSentAt: row.last_sent_at,
    lastMine: row.last_mine,
    unread: row.unread,
    state: stateOf(Number(row.participants), row.blocked),
  }))
}

/**
 * T093 (007) — whether anything at all is waiting, as one cheap question (FR-531, research R13).
 *
 * **Its own query rather than a derivation over the list**, and that is standing decision 9
 * rather than a micro-optimisation: Home's card owns its loading and failure states and must not
 * transfer the whole conversation list, with every counterpart's name and face, to render a dot.
 * It also keeps the card independent of Messages — a failing conversation list must leave the
 * indicator working, and the reverse.
 *
 * `EXISTS` stops at the first match, so an attendee with two hundred unread threads costs the
 * same as one with one.
 */
export const hasUnreadConversations = async (attendeeId: string): Promise<boolean> => {
  const rows = await getDb().execute<{ any_unread: boolean }>(sql`
    WITH mine AS (
      SELECT conversation_id, last_read_message_id
      FROM conversation_participants
      WHERE attendee_id = ${attendeeId}::uuid
    )
    SELECT EXISTS (
      SELECT 1
      FROM conversations c
      JOIN mine ON mine.conversation_id = c.id
      WHERE ${unreadPredicate(attendeeId)}
    ) AS any_unread
  `)

  return rows[0]?.any_unread === true
}

/**
 * The unread condition, written once and used by both readers above.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A row pointer, not a timestamp** (research R13). Comparing `(sent_at, id)` against the read
 * message's own `(sent_at, id)` is exact even for two messages sent in the same millisecond,
 * which a `last_read_at` cannot distinguish — the reader who opened a thread between them would
 * have one silently marked read. It is the same total order the keyset page uses, so "after my
 * read position" and "on a later page" mean the same thing.
 *
 * Shared rather than duplicated because the list and Home's indicator disagreeing about what is
 * unread is a bug nobody would report as one: the dot would simply be wrong.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const unreadPredicate = (attendeeId: string): ReturnType<typeof sql> => sql`
  EXISTS (
    SELECT 1 FROM messages m
    WHERE m.conversation_id = c.id
      AND m.author_id <> ${attendeeId}::uuid
      AND (
        mine.last_read_message_id IS NULL
        OR (m.sent_at, m.id) > (
          SELECT r.sent_at, r.id FROM messages r WHERE r.id = mine.last_read_message_id
        )
      )
  )
`

/**
 * T131 (007) — remove conversations nobody is left in (FR-575).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE ONE THING M3'S CASCADES CANNOT DO FOR THEMSELVES.**
 *
 * Deleting an attendee cascades away their messages, their participation and their pair rows.
 * What it cannot reach is `conversations` itself, because that table holds **no attendee foreign
 * key at all** — and that emptiness is deliberate: a row here naming a departed attendee would
 * breach FR-573, which is the entire reason `conversation_pairs` exists as a separate table
 * (research R10).
 *
 * So the last participant leaving is the one case needing a statement. A conversation with no
 * participants is unreachable by every product surface — nobody can read it, nobody can send into
 * it — which is exactly why it needs removing rather than leaving: FR-575 calls it litter rather
 * than a record, and litter nothing can see is litter nothing will ever notice.
 *
 * **Scoped to conversations that are actually empty**, not to the departing attendee's: a
 * conversation whose other participant survives is theirs to keep, one-sided and read-only
 * (FR-572).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const removeEmptyConversations = async (candidateIds: readonly string[]): Promise<void> => {
  if (candidateIds.length === 0) return

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **SCOPED TO THE DEPARTING ATTENDEE'S CONVERSATIONS, NOT TO THE WHOLE TABLE.**
  //
  // This was an unscoped anti-join — `DELETE FROM conversations c WHERE NOT EXISTS (…)` — run on
  // **every** account deletion. Its cost grew with the total number of conversations in the
  // deployment rather than with the departing attendee's, and it ran immediately after the
  // `attendees` delete had already fired large cascades across `messages`,
  // `conversation_participants` and `conversation_pairs`, taking a scan and row locks across a
  // table every other attendee's Messages destination reads from.
  //
  // Cheap at today's scale and quietly expensive as the product succeeds, on a path already
  // holding locks. The candidate list is collected **before** the delete — see `deleteAccount` —
  // because afterwards there is nothing left to join on: the participation rows that name them
  // are exactly what the cascade removed.
  //
  // The predicate is unchanged, and it is the one that matters: a conversation whose other
  // participant survives is theirs to keep, one-sided and read-only (FR-572).
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  await getDb().execute(sql`
    DELETE FROM conversations c
    WHERE c.id IN (
      SELECT value::uuid FROM json_array_elements_text(${JSON.stringify([...candidateIds])}::json)
    )
    AND NOT EXISTS (
      SELECT 1 FROM conversation_participants p WHERE p.conversation_id = c.id
    )
  `)
}

/**
 * T133 (007) — whether this conversation still accepts messages (FR-574).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A count of participant rows, not a status column** (data-model, State transitions). Two rows
 * means open; one means the counterpart has deleted their account and nothing more can be sent.
 *
 * The send path asks this **separately from the block check**, and the two refusals are
 * deliberately different: a block answers a reasonless 409 (FR-537), while a closed conversation
 * answers 403 with an explanation. That is not an inconsistency — a closed conversation is a fact
 * about a thread the caller can already see every message of, so explaining it discloses nothing
 * about another attendee. A block is a fact about somebody else's decision.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const conversationAcceptsMessages = async (
  unverified: ConversationScope,
): Promise<boolean> => {
  const scope = assertVerifiedParticipation(unverified)

  const rows = await getDb().execute<{ participants: number }>(sql`
    SELECT count(*)::int AS participants FROM conversation_participants
    WHERE conversation_id = ${scope.conversationId}::uuid
  `)

  return Number(rows[0]?.participants ?? 0) >= 2
}

/**
 * T094 (007) — advance the caller's **own** read position (FR-528, FR-530).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **IDEMPOTENT AND MONOTONIC, AND THE MONOTONICITY IS THE REQUIREMENT** (contract).
 *
 * A request naming an older message than the current position is accepted and changes nothing.
 * Without that, an out-of-order arrival — two `PUT`s racing as a reader scrolls, or a retry
 * landing after a later one — would silently mark a conversation unread again, and the attendee
 * would watch a dot reappear on a thread they had just read.
 *
 * **It writes the caller's own participant row and no other**, which is FR-530 expressed as an
 * absence: there is no argument here in which another attendee could be named, so there is no
 * expression anybody could write that moves somebody else's read position or discloses it.
 *
 * The scope is what makes the conversation the caller's. The `EXISTS` additionally requires the
 * message to belong to *that* conversation, so a message identifier lifted from another thread
 * advances nothing — silently, because reporting the difference would confirm the message
 * exists.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const markRead = async (
  unverified: ConversationScope,
  throughMessageId: string,
): Promise<void> => {
  const scope = assertVerifiedParticipation(unverified)
  if (!UUID.test(throughMessageId)) return

  await getDb().execute(sql`
    UPDATE conversation_participants p
    SET last_read_message_id = ${throughMessageId}::uuid
    WHERE p.conversation_id = ${scope.conversationId}::uuid
      AND p.attendee_id = ${scope.attendeeId}::uuid
      AND EXISTS (
        SELECT 1 FROM messages m
        WHERE m.id = ${throughMessageId}::uuid
          AND m.conversation_id = ${scope.conversationId}::uuid
      )
      AND (
        p.last_read_message_id IS NULL
        OR EXISTS (
          SELECT 1 FROM messages m, messages r
          WHERE m.id = ${throughMessageId}::uuid
            AND r.id = p.last_read_message_id
            AND (m.sent_at, m.id) > (r.sent_at, r.id)
        )
      )
  `)
}

/** Derived, never stored. See `listConversations`. */
const stateOf = (participants: number, blocked: boolean): 'open' | 'one_sided' | 'blocked' => {
  // One-sided wins over blocked: a conversation whose counterpart has deleted their account
  // cannot be sent into whatever the blocker does, and offering an unblock action for somebody
  // who no longer exists would be an affordance that changes nothing.
  if (participants < 2) return 'one_sided'
  return blocked ? 'blocked' : 'open'
}

/**
 * The message insert and the ordering column, together, inside whatever transaction is open.
 *
 * Deliberately **not** `appendMessage` from `queries/messages.ts`: that function demands a
 * `ConversationScope`, and correctly, because it serves a route that takes a conversation
 * identifier from the client. Here the identifier was derived from the ordered pair a moment ago
 * and there is nothing a caller could have supplied — manufacturing a scope to satisfy a
 * signature would be the exact laundering the brand exists to prevent.
 */
const insertMessage = async (
  tx: Transaction,
  conversationId: string,
  authorId: string,
  body: string,
): Promise<{ messageId: string; sentAt: string }> => {
  const rows = await tx.execute<{ id: string; sent_at: string }>(sql`
    INSERT INTO messages (conversation_id, author_id, body)
    VALUES (${conversationId}::uuid, ${authorId}::uuid, ${body})
    RETURNING id, to_char(sent_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS sent_at
  `)

  const row = rows[0]
  if (!row) throw new Error('message insert returned no row')

  await tx.execute(sql`
    UPDATE conversations
    SET last_message_at = (SELECT sent_at FROM messages WHERE id = ${row.id}::uuid)
    WHERE id = ${conversationId}::uuid
  `)

  return { messageId: row.id, sentAt: row.sent_at }
}
