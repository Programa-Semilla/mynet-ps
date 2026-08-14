import { sql } from 'drizzle-orm'

import { assertVerifiedScope, type EventScope } from '../../plugins/event-access.js'
import { revokeAllAssignments, revokeAssignmentForEvent } from './admin-assignments.js'
import { pseudonymiseAuditEntriesFor } from './admin-audit.js'
import { removeEmptyConversations } from './conversations.js'
import { avatarObjectKey, cardKeyFor, type StorageService } from '../../storage/service.js'
import { getDb } from '../client.js'

/**
 * T029 (004) — personal-data export and account deletion (FR-364–FR-379, research D10, D11).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE TWO HALVES OF THE OBLIGATION CONSTITUTION v2.3.0 BINDS, IN ONE FILE ON PURPOSE.**
 *
 * Export and deletion answer the same question from opposite ends — *what does the product hold
 * about this person* — and a field added to one and forgotten in the other is the exact defect
 * FR-370 and FR-377 exist to catch. Keeping them adjacent means the omission is visible while
 * it is being made, not only when a guard fails later.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Everything the product holds about one attendee, in one document (FR-373, FR-374, D11).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Generated synchronously, in one request.** At conference scale an attendee's data is a
 * profile, a handful of registrations, some saved sessions and notes, and one image. Assembling
 * that asynchronously would add a job, a store for the result, a delivery path, and an expiry
 * policy — **a new personal-data surface created to avoid a query that takes milliseconds**
 * (D11).
 *
 * **The avatar is embedded as base64 rather than referenced by URL**, so the document stands
 * alone. A URL would make the export a pointer into a system the attendee may have asked to be
 * deleted from thirty seconds later.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **What is deliberately absent, and why** — each is declared in the allow-list of the export
 * guard (`tests/unit/export-coverage.test.ts`) so the exclusion is reviewed rather than silent:
 *
 *   - `attendee_credentials.password_hash` — credential material (FR-376).
 *   - `attendee_verifications` / `attendee_password_resets` — verification and reset material,
 *     which no route may return under any circumstance (FR-391). They are short-lived, they are
 *     deleted with the account, and a live reset token in an exported file would be the account
 *     itself sitting in the attendee's downloads folder.
 *   - `sign_in_attempts` — holds keyed hashes rather than identities and has no foreign key by
 *     design, so no row in it is *attributable* to the requester; including it would require
 *     re-deriving the hash of their address, which would turn an export into a lookup tool.
 */
export type AccountExport = {
  readonly exportedAt: string
  readonly account: {
    readonly id: string
    readonly email: string
    readonly displayName: string
    readonly emailVerifiedAt: string | null
    readonly discoverable: boolean
    readonly createdAt: string
    readonly updatedAt: string
  }
  readonly profile: {
    readonly company: string | null
    readonly role: string | null
    readonly headline: string | null
    readonly networkingIntent: string | null
    readonly availability: string | null
    readonly updatedAt: string
  } | null
  readonly interests: readonly string[]
  readonly registrations: readonly {
    readonly eventId: string
    readonly eventName: string
    readonly registeredAt: string
  }[]
  readonly activeConference: { readonly eventId: string; readonly updatedAt: string } | null
  readonly savedSessions: readonly {
    readonly sessionId: string
    readonly sessionTitle: string
    readonly eventId: string
    readonly savedAt: string
    /**
     * T003 (014) — when this attendee last looked at the session (FR-1030).
     *
     * Exported because it is attendee data: it records something *they* did, and it is what
     * decides whether their Agenda row carries a change marker. `export-coverage.test.ts`
     * derives from the schema, so the column fails the build by existing until it appears here.
     */
    readonly viewedAt: string
  }[]
  readonly sessionNotes: readonly {
    readonly sessionId: string
    readonly body: string
    readonly updatedAt: string
  }[]
  readonly signInSessions: readonly {
    readonly createdAt: string
    readonly lastUsedAt: string | null
    readonly expiresAt: string
    readonly revokedAt: string | null
  }[]
  readonly avatar: { readonly contentType: string; readonly base64: string } | null

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T136, T137 (007) — **AUTHORED MESSAGES ONLY. RECEIVED MESSAGES ARE DELIBERATELY ABSENT**
   * (FR-578), and this is the feature's one declared divergence from standing decision 12.
   *
   * Decision 12 requires an export "covering every field collected", and a received message is
   * a field collected about this attendee. It is excluded anyway, on the reasoning that a
   * received message is **primarily its author's personal data**: exporting it would hand one
   * attendee a machine-readable copy of another attendee's words, obtained through a
   * self-service route the author never sees and cannot object to.
   *
   * That reasoning is contestable and the specification says so rather than hiding it —
   * comparable products do export received correspondence, and REVIEWERS.md lists this as a
   * point a reviewer should decide they agree with. `exclusions` below carries the note into
   * the document itself, so the attendee reading their own export learns what is missing and
   * why rather than concluding their threads were empty.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  readonly messages: readonly {
    /** Context for grouping, not a record of the other participant — see `conversations`. */
    readonly conversationId: string
    readonly body: string
    readonly sentAt: string
  }[]

  /** Blocks this attendee created. The reverse direction is somebody else's record. */
  readonly blocks: readonly {
    readonly blockedAttendeeId: string
    readonly createdAt: string
  }[]

  /** Reports this attendee filed (FR-548 keeps them unreadable *inside* the product only). */
  readonly reports: readonly {
    readonly reportedAttendeeId: string
    readonly reason: string
    readonly messageIds: readonly string[]
    /** T016 (009) — the reported questions, alongside the reported messages (FR-783). */
    readonly questionIds: readonly string[]
    readonly createdAt: string
  }[]

  /**
   * Device notification registrations — **presence and timestamps, never the keys**
   * (research R14).
   *
   * `p256dh_key` and `auth_key` are credentials rather than content: together they grant the
   * ability to deliver to that device. Reproducing them would put a *capability* in a file the
   * attendee downloads and keeps, which is the same reasoning that keeps the password hash and
   * live reset tokens out. `keysRedacted` states the omission in the document rather than
   * leaving the reader to notice it.
   */
  readonly pushSubscriptions: readonly {
    readonly endpoint: string
    readonly createdAt: string
    readonly lastDeliveredAt: string | null
    readonly keysRedacted: true
  }[]

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T127 (008) — **cards in both directions, because one row is two different facts**
   * (FR-653, SC-610).
   *
   * A `shared_cards` row is *your card, held by them* to its sharer and *their card, held by
   * you* to its recipient. Neither section is derivable from the other, and collapsing them into
   * one list of "cards" would force the reader to work out which side of each row they were on.
   *
   * **Unlike `messages`, nothing is withheld here** (contrast FR-578). A held card is not the
   * sharer's private content — it is a set of fields they had already published to co-attendees
   * under decision 16's single visibility decision, which is the ground constitution **v5.0.0
   * (C1)** licenses mutual exchange on. What the export reproduces is the *exchange* — who,
   * when, and at which conference — never a snapshot of the other person's profile, which
   * resolves live and belongs to them.
   *
   * **T042, FR-1052 (016) — this justification used to cite the standing consent of v3.2.0 (N2), and C1
   * reverses N2.** The disclosure was and remains right; the stated reason had stopped being
   * true, which is the defect class 013's review named its most transferable finding. Nothing
   * about the export's behaviour changes: under mutual exchange both sections simply carry more
   * rows, and both foreign keys already cascade, so deletion and export coverage are satisfied
   * by the existing declarations rather than by new ones.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  readonly cardsShared: readonly {
    readonly recipientAttendeeId: string
    readonly eventId: string
    readonly eventName: string
    readonly sharedAt: string
  }[]

  readonly cardsHeld: readonly {
    readonly sharerAttendeeId: string
    readonly eventId: string
    readonly eventName: string
    readonly sharedAt: string
  }[]

  /**
   * T127 (008) — appointments **in both roles** (FR-653).
   *
   * One list rather than two, unlike cards, because an appointment is a single shared fact
   * rather than two directional ones: both parties are party to the same meeting. `role` says
   * which side the reader was on, which is what a proposal and an invitation differ by.
   *
   * `status` is the **stored** status. `lapsed` is derived from the slot instant at read time
   * and stored nowhere (FR-634), so it is deliberately absent here: an export is a record of
   * what the product holds, and the product holds no such value.
   */
  readonly appointments: readonly {
    readonly role: 'proposer' | 'invitee'
    readonly counterpartAttendeeId: string
    readonly eventId: string
    readonly eventName: string
    readonly slotId: string
    readonly slotStartsAt: string
    readonly slotEndsAt: string
    readonly topic: string
    readonly status: string
    readonly createdAt: string
    readonly answeredAt: string | null
  }[]

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T015 (009) — **audience questions asked, and votes cast, each naming its session**
   * (FR-764).
   *
   * Two sections rather than one, because they are two different acts: writing a question is
   * authoring content, and upvoting is an opinion about somebody else's. Collapsing them would
   * force the reader to work out which rows were theirs to begin with.
   *
   * **Nothing is withheld from either** (contrast `messages` above, FR-578). A question is
   * published to the whole conference under the attendee's own name — that is the exception
   * constitution v3.3.0 records — so an attendee's own questions carry no second person's
   * privacy interest the way a received message does.
   *
   * `sessionTitle` is what makes the document readable a year later, when the identifiers name
   * nothing the attendee recognises. It is seeded conference content, not personal data, and is
   * reproduced here for the same reason `savedSessions` reproduces it.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  readonly questionsAsked: readonly {
    readonly questionId: string
    readonly sessionId: string
    readonly sessionTitle: string
    readonly eventId: string
    readonly body: string
    readonly askedAt: string
  }[]

  /**
   * Votes this attendee cast, on their own questions and on other people's.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **The question's TEXT is deliberately absent here, and its author is never named**
   * (FR-721, FR-769).
   *
   * A vote is a fact about the reader; the question it backs is somebody else's words, and no
   * surface in this product names a voter to anybody but themselves. Reproducing the body would
   * put another attendee's content into a file obtained through a self-service route they cannot
   * see or object to — the same reasoning FR-578 gives for received messages, reached here by a
   * different road. The identifier and the session are what make the record meaningful without
   * that.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  readonly questionVotes: readonly {
    readonly questionId: string
    readonly sessionId: string
    readonly sessionTitle: string
    readonly votedAt: string
  }[]

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T026 (013) — **conferences this attendee has been given authority over** (FR-981).
   *
   * The only thing 011 adds to this document, out of five new tables. An assignment is a fact
   * about the attendee who holds it — that somebody granted them authority over a named
   * conference on a date, and possibly ended it — and that belongs here exactly as their
   * registrations do.
   *
   * **Revoked assignments are included, and that is deliberate.** A revoked row is history:
   * omitting it would make the document say the attendee never held the authority, which is
   * false, and would make an export taken after a demotion differ from one taken before it in a
   * way that hides something about them rather than about anybody else.
   *
   * `assignedBy` is the granting operator's **display name**, never their identifier. The
   * attendee is entitled to know who granted their authority; an operator UUID is an identifier
   * for a principal they have no other way to resolve, and would be the only place in this
   * document where a non-attendee principal's key appears.
   *
   * The other four tables 011 adds are declared not-attendee-data in
   * `tests/unit/export-coverage.test.ts`, each with its reasoning — including
   * `admin_audit_entries`, which names an attendee and is still an *operator's* record.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  readonly organizerAssignments: readonly {
    readonly assignmentId: string
    readonly eventId: string
    readonly eventName: string
    readonly assignedBy: string
    readonly assignedAt: string
    readonly revokedAt: string | null
  }[]

  /**
   * T137 (007) — what this document deliberately leaves out, in the document (FR-578).
   *
   * An export that silently omits something is indistinguishable from an export of an attendee
   * who had nothing. Stating the exclusion is what keeps decision 12's divergence honest to the
   * person the decision is about.
   */
  readonly exclusions: readonly string[]
}

/** ISO-8601 over the wire, as everywhere else in this product (FR-124). */
const iso = (value: Date | string | null): string | null =>
  value === null
    ? null
    : value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString()

/**
 * Assembles the export for the **authenticated** attendee (FR-374, FR-375, FR-378).
 *
 * `attendeeId` comes from the sign-in session and from nowhere else — there is no parameter in
 * which a caller could name somebody else, which is what makes FR-375's "no data belonging to
 * any other attendee" structural rather than a filter to remember. Every query below is keyed
 * on that one value.
 */
export const assembleExport = async (
  attendeeId: string,
  storage: StorageService,
): Promise<AccountExport | null> => {
  const db = getDb()

  const accounts = await db.execute<{
    id: string
    email: string
    display_name: string
    email_verified_at: Date | null
    discoverable: boolean
    avatar_object_key: string | null
    created_at: Date
    updated_at: Date
  }>(sql`
    SELECT id, email, display_name, email_verified_at, discoverable, avatar_object_key,
           created_at, updated_at
    FROM attendees WHERE id = ${attendeeId}::uuid
  `)

  const account = accounts[0]
  if (!account) return null

  const [
    profiles,
    interests,
    registrations,
    active,
    saved,
    notes,
    sessions,
    authored,
    blocks,
    reports,
    subscriptions,
    cardsShared,
    cardsHeld,
    meetings,
    questionsAsked,
    questionVotes,
    organizerAssignments,
  ] = await Promise.all([
    db.execute<{
      company: string | null
      role: string | null
      headline: string | null
      networking_intent: string | null
      availability: string | null
      updated_at: Date
    }>(sql`
      SELECT company, role, headline, networking_intent, availability, updated_at
      FROM attendee_profiles WHERE attendee_id = ${attendeeId}::uuid
    `),
    db.execute<{ interest: string }>(sql`
      SELECT interest FROM attendee_interests WHERE attendee_id = ${attendeeId}::uuid
      ORDER BY interest
    `),
    db.execute<{ event_id: string; event_name: string; created_at: Date }>(sql`
      SELECT r.event_id, e.name AS event_name, r.created_at
      FROM registrations r JOIN events e ON e.id = r.event_id
      WHERE r.attendee_id = ${attendeeId}::uuid
      ORDER BY r.created_at
    `),
    db.execute<{ event_id: string; updated_at: Date }>(sql`
      SELECT event_id, updated_at FROM active_event_selections
      WHERE attendee_id = ${attendeeId}::uuid
    `),
    db.execute<{
      session_id: string
      title: string
      event_id: string
      saved_at: Date
      viewed_at: Date
    }>(sql`
      SELECT ss.session_id, s.title, s.event_id, ss.saved_at, ss.viewed_at
      FROM saved_sessions ss JOIN sessions s ON s.id = ss.session_id
      WHERE ss.attendee_id = ${attendeeId}::uuid
      ORDER BY ss.session_id
    `),
    db.execute<{ session_id: string; body: string; updated_at: Date }>(sql`
      SELECT session_id, body, updated_at FROM session_notes
      WHERE attendee_id = ${attendeeId}::uuid
      ORDER BY session_id
    `),
    // ─────────────────────────────────────────────────────────────────────────────────────
    // **`token_hash` is not selected, and its absence is the requirement** (FR-376, FR-391).
    // The timestamps are personal data — they record when this attendee was using MyNet — so
    // they belong in the export. The hash is a credential and never leaves the database.
    // ─────────────────────────────────────────────────────────────────────────────────────
    db.execute<{
      created_at: Date
      last_used_at: Date | null
      expires_at: Date
      revoked_at: Date | null
    }>(sql`
      SELECT created_at, last_used_at, expires_at, revoked_at
      FROM auth_sessions WHERE attendee_id = ${attendeeId}::uuid
      ORDER BY created_at
    `),
    // ─────────────────────────────────────────────────────────────────────────────────────
    // T136 (007) — **`author_id = the requester` is the whole of FR-578's exclusion**, and it
    // is expressed as a WHERE clause rather than as a filter applied afterwards. There is no
    // shape of this query that could return somebody else's message, so the exclusion cannot
    // be undone by a later edit that forgets a `.filter()`.
    //
    // `conversation_id` is included as grouping context. It is not a record of the other
    // participant: `conversations` holds no identifier at all, by design (research R10).
    // ─────────────────────────────────────────────────────────────────────────────────────
    db.execute<{ conversation_id: string; body: string; sent_at: Date }>(sql`
      SELECT conversation_id, body, sent_at
      FROM messages WHERE author_id = ${attendeeId}::uuid
      ORDER BY sent_at, id
    `),
    db.execute<{ blocked_id: string; created_at: Date }>(sql`
      SELECT blocked_id, created_at FROM attendee_blocks
      WHERE blocker_id = ${attendeeId}::uuid
      ORDER BY created_at
    `),
    db.execute<{
      reported_id: string
      reason: string
      message_ids: string[]
      question_ids: string[]
      created_at: Date
    }>(sql`
      SELECT reported_id, reason, message_ids, question_ids, created_at
      FROM abuse_reports WHERE reporter_id = ${attendeeId}::uuid
      ORDER BY created_at
    `),
    // ─────────────────────────────────────────────────────────────────────────────────────
    // **`p256dh_key` and `auth_key` are not selected, and their absence is the requirement**
    // (research R14) — the same construction, and the same reasoning, as `token_hash` above.
    // The endpoint and timestamps are personal data: they record that this attendee registered
    // a device and when it last heard from us. The two keys are a delivery *capability*.
    // ─────────────────────────────────────────────────────────────────────────────────────
    db.execute<{ endpoint: string; created_at: Date; last_delivered_at: Date | null }>(sql`
      SELECT endpoint, created_at, last_delivered_at
      FROM push_subscriptions WHERE attendee_id = ${attendeeId}::uuid
      ORDER BY created_at
    `),
    // ─────────────────────────────────────────────────────────────────────────────────────
    // T127 (008) — **the same table read twice, from the two sides of a directional fact**
    // (FR-653).
    //
    // `sharer_id = the requester` is *cards you gave*; `recipient_id = the requester` is *cards
    // you hold*. Two statements rather than one with a `CASE`, for the reason the message export
    // gives for its own `WHERE`: the filter is what makes each section's meaning structural, and
    // a single query returning both sides would need application code to sort them back out.
    //
    // **No discoverability or verification condition on either**, matching `queries/cards.ts`.
    // An export is the attendee's own record of an exchange that happened; a contact who has
    // since turned discoverability off has not un-given their card (FR-612, FR-613).
    // ─────────────────────────────────────────────────────────────────────────────────────
    db.execute<{ recipient_id: string; event_id: string; event_name: string; shared_at: Date }>(sql`
      SELECT c.recipient_id, c.event_id, e.name AS event_name, c.shared_at
      FROM shared_cards c JOIN events e ON e.id = c.event_id
      WHERE c.sharer_id = ${attendeeId}::uuid
      ORDER BY c.shared_at, c.id
    `),
    db.execute<{ sharer_id: string; event_id: string; event_name: string; shared_at: Date }>(sql`
      SELECT c.sharer_id, c.event_id, e.name AS event_name, c.shared_at
      FROM shared_cards c JOIN events e ON e.id = c.event_id
      WHERE c.recipient_id = ${attendeeId}::uuid
      ORDER BY c.shared_at, c.id
    `),
    // ─────────────────────────────────────────────────────────────────────────────────────
    // T127 (008) — appointments in **both** roles, in one statement (FR-653).
    //
    // One query rather than two, unlike cards above, because an appointment is one shared fact
    // rather than two directional ones — both parties are party to the same meeting, and the
    // `role` column is what tells the reader which side they were on.
    //
    // `status` is the stored value. `lapsed` is derived at read time (FR-634) and is deliberately
    // not reconstructed here: an export records what the product holds.
    // ─────────────────────────────────────────────────────────────────────────────────────
    db.execute<{
      role: 'proposer' | 'invitee'
      counterpart_id: string
      event_id: string
      event_name: string
      slot_id: string
      slot_starts_at: Date
      slot_ends_at: Date
      topic: string
      status: string
      created_at: Date
      answered_at: Date | null
    }>(sql`
      SELECT
        CASE WHEN a.proposer_id = ${attendeeId}::uuid THEN 'proposer' ELSE 'invitee' END AS role,
        CASE WHEN a.proposer_id = ${attendeeId}::uuid THEN a.invitee_id ELSE a.proposer_id END
          AS counterpart_id,
        a.event_id, e.name AS event_name,
        a.slot_id, s.starts_at AS slot_starts_at, s.ends_at AS slot_ends_at,
        a.topic, a.status, a.created_at, a.answered_at
      FROM appointments a
      JOIN events e ON e.id = a.event_id
      JOIN meeting_slots s ON s.id = a.slot_id
      WHERE a.proposer_id = ${attendeeId}::uuid OR a.invitee_id = ${attendeeId}::uuid
      ORDER BY s.starts_at, a.id
    `),
    // ─────────────────────────────────────────────────────────────────────────────────────
    // T015 (009) — questions asked, each naming its session by title (FR-764).
    //
    // `attendee_id = the requester` is the whole filter, expressed as a WHERE clause for the
    // reason the message export gives for its own: there is no shape of this query that could
    // return somebody else's question, so the scoping cannot be undone by a later edit that
    // forgets a `.filter()`.
    //
    // The join to `sessions` is what supplies the title and the event. It is an inner join
    // safely: a question cannot exist without its session, because the foreign key cascades.
    // ─────────────────────────────────────────────────────────────────────────────────────
    db.execute<{
      id: string
      session_id: string
      title: string
      event_id: string
      body: string
      asked_at: Date
    }>(sql`
      SELECT q.id, q.session_id, s.title, s.event_id, q.body, q.asked_at
      FROM session_questions q JOIN sessions s ON s.id = q.session_id
      WHERE q.attendee_id = ${attendeeId}::uuid
      ORDER BY q.asked_at, q.id
    `),
    // ─────────────────────────────────────────────────────────────────────────────────────
    // T015 (009) — votes cast, likewise naming the session (FR-764).
    //
    // **`q.body` is deliberately not selected**, and neither is `q.attendee_id`. A vote is the
    // reader's own act; the question it backs is another attendee's words and another
    // attendee's name. See the `questionVotes` docblock for why that is an exclusion rather
    // than an omission — and note it is *not* listed in `exclusions` below, because what is
    // withheld is somebody else's content rather than a category of the reader's own.
    // ─────────────────────────────────────────────────────────────────────────────────────
    db.execute<{ question_id: string; session_id: string; title: string; voted_at: Date }>(sql`
      SELECT v.question_id, q.session_id, s.title, v.voted_at
      FROM question_votes v
      JOIN session_questions q ON q.id = v.question_id
      JOIN sessions s ON s.id = q.session_id
      WHERE v.attendee_id = ${attendeeId}::uuid
      ORDER BY v.voted_at, v.question_id
    `),
    // ─────────────────────────────────────────────────────────────────────────────────────
    // T026 (013) — conferences this attendee has been given authority over (FR-981).
    //
    // **Revoked rows are included** — a revoked assignment is history, and omitting it would
    // make the document say the attendee never held the authority. `ORDER BY assigned_at`
    // rather than by liveness, so the section reads as a chronology.
    //
    // `o.display_name` rather than `a.assigned_by`: the attendee is entitled to know who
    // granted their authority, and an operator UUID is an identifier for a principal they have
    // no other way to resolve. It is the only place a non-attendee principal appears in this
    // document, and it appears as a name.
    // ─────────────────────────────────────────────────────────────────────────────────────
    db.execute<{
      id: string
      event_id: string
      event_name: string
      assigned_by: string
      assigned_at: Date
      revoked_at: Date | null
    }>(sql`
      SELECT a.id, a.event_id, e.name AS event_name, o.display_name AS assigned_by,
             a.assigned_at, a.revoked_at
      FROM organizer_assignments a
      JOIN events e ON e.id = a.event_id
      JOIN operators o ON o.id = a.assigned_by
      WHERE a.attendee_id = ${attendeeId}::uuid
      ORDER BY a.assigned_at, a.id
    `),
  ])

  const profile = profiles[0]
  const activeRow = active[0]

  // Read through the port, never from `stored_objects` directly — the production adapter is a
  // bucket and a SELECT here would stop working the day it is (FR-352).
  const avatar = account.avatar_object_key ? await storage.get(account.avatar_object_key) : null

  return {
    exportedAt: new Date().toISOString(),
    account: {
      id: account.id,
      email: account.email,
      displayName: account.display_name,
      emailVerifiedAt: iso(account.email_verified_at),
      discoverable: account.discoverable,
      createdAt: iso(account.created_at) as string,
      updatedAt: iso(account.updated_at) as string,
    },
    profile: profile
      ? {
          company: profile.company,
          role: profile.role,
          headline: profile.headline,
          networkingIntent: profile.networking_intent,
          availability: profile.availability,
          updatedAt: iso(profile.updated_at) as string,
        }
      : null,
    interests: interests.map((row) => row.interest),
    registrations: registrations.map((row) => ({
      eventId: row.event_id,
      eventName: row.event_name,
      registeredAt: iso(row.created_at) as string,
    })),
    activeConference: activeRow
      ? { eventId: activeRow.event_id, updatedAt: iso(activeRow.updated_at) as string }
      : null,
    savedSessions: saved.map((row) => ({
      sessionId: row.session_id,
      sessionTitle: row.title,
      eventId: row.event_id,
      savedAt: iso(row.saved_at) as string,
      viewedAt: iso(row.viewed_at) as string,
    })),
    sessionNotes: notes.map((row) => ({
      sessionId: row.session_id,
      body: row.body,
      updatedAt: iso(row.updated_at) as string,
    })),
    signInSessions: sessions.map((row) => ({
      createdAt: iso(row.created_at) as string,
      lastUsedAt: iso(row.last_used_at),
      expiresAt: iso(row.expires_at) as string,
      revokedAt: iso(row.revoked_at),
    })),
    avatar: avatar
      ? { contentType: avatar.contentType, base64: avatar.bytes.toString('base64') }
      : null,
    messages: authored.map((row) => ({
      conversationId: row.conversation_id,
      body: row.body,
      sentAt: iso(row.sent_at) as string,
    })),
    blocks: blocks.map((row) => ({
      blockedAttendeeId: row.blocked_id,
      createdAt: iso(row.created_at) as string,
    })),
    reports: reports.map((row) => ({
      reportedAttendeeId: row.reported_id,
      reason: row.reason,
      messageIds: row.message_ids,
      // T016 (009) — the reported questions, alongside the reported messages (FR-783).
      questionIds: row.question_ids,
      createdAt: iso(row.created_at) as string,
    })),
    pushSubscriptions: subscriptions.map((row) => ({
      endpoint: row.endpoint,
      createdAt: iso(row.created_at) as string,
      lastDeliveredAt: iso(row.last_delivered_at),
      // A literal rather than a computed value: the point is that the reader is told, not that
      // some code decided. If the keys were ever exported this line would have to be deleted,
      // which is a visible act.
      keysRedacted: true as const,
    })),
    // T127 (008) — FR-653's two card sections and the appointments list. See the queries above.
    cardsShared: cardsShared.map((row) => ({
      recipientAttendeeId: row.recipient_id,
      eventId: row.event_id,
      eventName: row.event_name,
      sharedAt: iso(row.shared_at) as string,
    })),
    cardsHeld: cardsHeld.map((row) => ({
      sharerAttendeeId: row.sharer_id,
      eventId: row.event_id,
      eventName: row.event_name,
      sharedAt: iso(row.shared_at) as string,
    })),
    appointments: meetings.map((row) => ({
      role: row.role,
      counterpartAttendeeId: row.counterpart_id,
      eventId: row.event_id,
      eventName: row.event_name,
      slotId: row.slot_id,
      slotStartsAt: iso(row.slot_starts_at) as string,
      slotEndsAt: iso(row.slot_ends_at) as string,
      topic: row.topic,
      status: row.status,
      createdAt: iso(row.created_at) as string,
      answeredAt: iso(row.answered_at),
    })),
    // T015 (009) — FR-764's two sections. See the queries above for what each deliberately
    // does not select.
    questionsAsked: questionsAsked.map((row) => ({
      questionId: row.id,
      sessionId: row.session_id,
      sessionTitle: row.title,
      eventId: row.event_id,
      body: row.body,
      askedAt: iso(row.asked_at) as string,
    })),
    questionVotes: questionVotes.map((row) => ({
      questionId: row.question_id,
      sessionId: row.session_id,
      sessionTitle: row.title,
      votedAt: iso(row.voted_at) as string,
    })),
    // T026 (013) — FR-981. Includes revoked assignments; see the interface for why.
    organizerAssignments: organizerAssignments.map((row) => ({
      assignmentId: row.id,
      eventId: row.event_id,
      eventName: row.event_name,
      assignedBy: row.assigned_by,
      assignedAt: iso(row.assigned_at) as string,
      revokedAt: iso(row.revoked_at),
    })),
    /**
     * T137 (007) — the stated omissions (FR-578).
     *
     * Present unconditionally, including when the sections above are empty. An attendee with no
     * messages and an attendee whose received messages were withheld must be able to tell the
     * difference, and a note that appears only when there is something to hide tells them
     * nothing.
     */
    exclusions: [
      'Messages you received are not included. This export covers messages you wrote. A ' +
        "message someone sent you is primarily that person's personal data, and this export is " +
        'a self-service route they cannot see or object to.',
      'Notification device keys are not included. The endpoint and dates for each registered ' +
        'device are listed, but the encryption keys are omitted: together they grant the ' +
        'ability to send notifications to that device, so they are a capability rather than a ' +
        'record of you.',
      'Your password, sign-in tokens, and any active verification or password-reset links are ' +
        'not included. Each of them would let somebody use your account.',
      "Reports made about you by other people are not included. They are those people's " +
        'records, and nothing in MyNet can read them.',
      // T026 (013) — FR-982. Stated for the same reason every line above is: an attendee who
      // has never been an organizer and an attendee whose administrative record was withheld
      // must be able to tell the difference.
      'Administrative records about you are not included. If you have been given authority ' +
        'over a conference, that is listed above; what an administrator did, decided, or ' +
        'recorded is their record of their own actions rather than data about you, and it is ' +
        'readable from nowhere in MyNet.',
    ],
  }
}

/**
 * Deletes the account and everything attributable to it (FR-364–FR-366, FR-369, research D10).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE STORAGE OBJECT GOES FIRST, AND THE ORDER IS THE WHOLE OF THE DESIGN.**
 *
 * Storage bytes live outside the database and no foreign key reaches them, so exactly one of
 * two failure modes is available if this operation is interrupted:
 *
 *   - **row first**: bytes no row references — unreachable, invisible to any audit, and there
 *     forever;
 *   - **object first**: a row pointing at a missing object — the profile renders its fallback,
 *     the next avatar write replaces the key, and the inconsistency is both harmless and
 *     findable.
 *
 * The second is strictly recoverable and the first is not, so the object is removed first. This
 * single case is why FR-370's structural guard is a requirement rather than a note.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Everything else is one `DELETE`, and the cascade does the rest.** `attendee_credentials`,
 * `auth_sessions`, `active_event_selections`, `registrations`, `saved_sessions`,
 * `session_notes`, `attendee_profiles`, `attendee_interests`, `attendee_verifications` and
 * `attendee_password_resets` all declare `ON DELETE CASCADE` from `attendees` — the mechanism
 * 005 shipped and could never trigger until this route existed.
 *
 * **Hard, with no tombstone** (FR-365). There is no `deleted_at`, no anonymised shell, and no
 * retained address. Deleting frees the address for re-registration, which is a consequence
 * rather than a feature: retaining it to prevent reuse would be a tombstone by another name.
 *
 * **`sign_in_attempts` is deliberately NOT deleted** (D10). It has no foreign key by design,
 * and removing a departing attendee's rows would hand an attacker a way to clear their own
 * trail by registering an account and deleting it. It expires on the two-hour sweep instead.
 */
export const deleteAccount = async (
  attendeeId: string,
  storage: StorageService,
): Promise<boolean> => {
  // ───────────────────────────────────────────────────────────────────────────────────────
  // T025 (006) — **every rendition, not only the profile one** (FR-460, SC-408).
  //
  // 006 adds a second stored rendition of the same image. A deletion path that removed only the
  // 512px object would leave the attendee's face in the directory's card payload after their
  // account was gone — **a silent regression of a guarantee 004 shipped**, and one nothing would
  // report: the profile would 404 correctly while the face went on being served.
  //
  // The card key is **derived** (research D3) rather than read from a column, so this reaches it
  // from the attendee identifier alone. That is the point of the derivation: deletion cannot
  // depend on a column being correct, because a drifted key would leave bytes behind with no row
  // left to find them from.
  //
  // Unconditional, and `delete` is idempotent: an attendee who never uploaded anything needs no
  // branch, and a row whose key was somehow lost still has its bytes removed.
  // ───────────────────────────────────────────────────────────────────────────────────────
  const avatarKey = avatarObjectKey(attendeeId)
  await storage.delete(avatarKey)
  await storage.delete(cardKeyFor(avatarKey))

  // Collected **before** the delete: afterwards the participation rows naming this attendee are
  // exactly what the cascade removed, so there would be nothing left to identify their
  // conversations by. See `removeEmptyConversations` for why the sweep is scoped at all.
  const theirConversations = await getDb().execute<{ conversation_id: string }>(sql`
    SELECT conversation_id FROM conversation_participants WHERE attendee_id = ${attendeeId}::uuid
  `)

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // **T137, T138 (013) — THE DELETE IS NOW A TRANSACTION, BECAUSE TWO ADMINISTRATIVE
  // OBLIGATIONS MUST NOT BE ABLE TO COMMIT APART FROM IT.**
  //
  // This was three independent statements, which was correct while every one of them was either
  // idempotent or reached by a cascade. FR-997a is neither: pseudonymising the audit trail is a
  // one-way write against rows **no cascade can reach**, and either ordering fails differently if
  // it can commit alone.
  //
  //   * Pseudonymise, then the delete fails → an attendee who still exists has had the
  //     administrative record about them stripped. Accountability lost, for nobody's benefit.
  //   * Delete, then the pseudonymisation fails → an attendee is erased while
  //     `admin_audit_entries` still names them. **That is a retained identifier for somebody who
  //     exercised erasure**, which is the Principle VIII breach FR-997a exists to prevent, and
  //     nothing would ever report it.
  //
  // One transaction removes the choice. Decision 39 is explicit that **deletion is never
  // conditional** — no administrative role may make an attendee's erasure right depend on
  // another person existing — so nothing here can refuse, warn, or block. It can only make sure
  // that what accompanies the erasure happens with it.
  // ═════════════════════════════════════════════════════════════════════════════════════════
  const rows = await getDb().transaction(async (tx) => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // **T137 — revoking the assignments is belt and braces, and it is here anyway** (FR-960).
    //
    // `organizer_assignments.attendee_id` is `ON DELETE CASCADE`, so the rows go regardless. It
    // runs first for the reason `revokeAllSessions` gives on this same path: a revocation that
    // turns out to be redundant costs nothing, while a missing one would leave authority behind.
    //
    // More importantly it makes the *intent* visible in the deletion transaction. Decision 39
    // says authority must not outlive the access it depends on; a reader of `deleteAccount`
    // should be able to see that being done rather than infer it from a foreign key three files
    // away — which is exactly how the withdrawal path's equivalent went unnoticed until 008.
    //
    // **Called rather than inlined, and `tx` is what makes that safe.** The helper exists to take
    // the caller's transaction; writing the same UPDATE here instead put a second copy of the rule
    // in a file that does not own it, and the two could later disagree about what "live" means.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await revokeAllAssignments(attendeeId, tx)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **T138 — pseudonymisation, and it is NOT a deletion** (FR-997a, FR-997b).
    //
    // The operator's act survives — who did it, what they did, when. What goes is *whom it was
    // done to*. There is **no row meaning "deleted attendee"**, no flag, no sentinel, and
    // nothing reconstructible: a cleared nullable column is neither a soft delete nor a
    // tombstone, which is precisely what FR-997b requires.
    //
    // **Hashing was rejected** and the reason generalises: a hash of a UUID drawn from a known
    // set is reversible by enumeration in one pass, which makes it a tombstone in disguise.
    //
    // **`pseudonymiseAuditEntriesFor` is called, not reimplemented here.** It takes the caller's
    // transaction precisely so this can commit with the deletion or not at all, so inlining the
    // UPDATE bought nothing and cost a second copy of the rule. It also matters that the audit
    // module keeps owning its own retention operation: `audit-append-only.test.ts` permits
    // exactly two mutations there **by exact name**, and a pseudonymisation living only as
    // anonymous SQL in this file would be invisible to that guard. The rule itself is documented
    // in `schema/admin-audit.ts`, which owns it.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await pseudonymiseAuditEntriesFor(attendeeId, tx)

    return tx.execute<{ id: string }>(sql`
      DELETE FROM attendees WHERE id = ${attendeeId}::uuid RETURNING id
    `)
  })

  // ───────────────────────────────────────────────────────────────────────────────────────
  // T131 (007) — **the one piece M3's cascades cannot do for themselves** (FR-575).
  //
  // Deleting the attendee has already taken their messages, their participation and their pair
  // rows with it. `conversations` is not reachable by any of that, because it holds no attendee
  // foreign key at all — deliberately, since a row naming a departed attendee would breach
  // FR-573 (research R10).
  //
  // So a conversation whose *last* participant has now left survives as litter: unreachable by
  // every product surface, and therefore something nothing would ever notice. This removes it.
  // A conversation whose other participant is still here is untouched — theirs to keep,
  // one-sided and read-only (FR-572).
  //
  // Ordered after the delete rather than before it, necessarily: the participation rows have to
  // be gone before "no participants left" can be true.
  // ───────────────────────────────────────────────────────────────────────────────────────
  if (rows.length > 0) {
    await removeEmptyConversations(theirConversations.map((row) => row.conversation_id))
  }

  return rows.length > 0
}

/**
 * Withdraws the attendee from one conference, without touching their account (FR-317c, D7).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE PER-CONFERENCE STATE DOES NOT CASCADE FROM `registrations`, AND THAT GAP IS INVISIBLE
 * IN THE SCHEMA.**
 *
 * `saved_sessions` and `session_notes` reference `sessions`, not `registrations`, so removing a
 * registration leaves both behind — saves and private notes for a conference the attendee has
 * left. They are deleted explicitly below, scoped to that conference through the session join.
 *
 * `active_event_selections` is the opposite case and needs no statement: its composite foreign
 * key references `registrations (attendee_id, event_id)` with `ON DELETE CASCADE`, so deleting
 * the registration removes the selection in the same statement and the attendee falls back to
 * derivation. 002 built that deliberately, and this is the first path to exercise it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **The profile is untouched.** It is cross-event — it describes the person, not their presence
 * at one conference — and withdrawing from a conference is not leaving the product (FR-317c).
 *
 * Takes an `EventScope`, so the conference has already been verified as one the attendee is
 * registered for: you can only leave what you joined.
 */
export const withdrawFromConference = async (unverified: EventScope): Promise<void> => {
  const scope = assertVerifiedScope(unverified)

  await getDb().transaction(async (tx) => {
    // ═════════════════════════════════════════════════════════════════════════════════════════
    // **008 — LEAVING A CONFERENCE CANCELS THE MEETINGS YOU HAD AT IT** (FR-637a's reasoning,
    // data-model.md's carried-over open item).
    //
    // `data-model.md` left this to be confirmed during implementation, and the confirmation is
    // that doing nothing was **not** safe. The record is per-event and the account still exists,
    // so nothing cascades — but every read of it goes through `requireEventAccess`, which the
    // departing attendee now fails. So without this:
    //
    //   * the person who left can no longer see the meeting at all, and cannot cancel it; and
    //   * the **other** party still sees it as pending or confirmed, can still accept it, and
    //     would turn up to meet somebody who is no longer at the conference.
    //
    // That is the exact failure FR-637a names for blocking — *a meeting you would otherwise turn
    // up to must be ended rather than hidden* — arriving through a second door. Cancelling is
    // also the honest state: it happened, and it is over, which is what the surface shows.
    //
    // **Pending and future confirmed only**, matching `cancelAppointmentsBetween`: a meeting that
    // has already taken place is a fact about the past, and rewriting it would be the same
    // mistake blocking avoids by deleting no message (FR-538).
    //
    // Written inline rather than by calling 008's own function, because this runs **inside a
    // transaction** with the deletes below and must not commit separately — a cancellation that
    // survived a rolled-back withdrawal would be worse than either outcome alone.
    // ═════════════════════════════════════════════════════════════════════════════════════════
    await tx.execute(sql`
      UPDATE appointments a
      SET status = 'cancelled', answered_at = now()
      FROM meeting_slots s
      WHERE a.slot_id = s.id
        AND a.event_id = ${scope.eventId}::uuid
        AND a.status IN ('pending', 'confirmed')
        AND (a.status = 'pending' OR s.starts_at > now())
        AND (a.proposer_id = ${scope.attendeeId}::uuid OR a.invitee_id = ${scope.attendeeId}::uuid)
    `)

    await tx.execute(sql`
      DELETE FROM saved_sessions ss
      USING sessions s
      WHERE ss.session_id = s.id
        AND ss.attendee_id = ${scope.attendeeId}::uuid
        AND s.event_id = ${scope.eventId}::uuid
    `)

    await tx.execute(sql`
      DELETE FROM session_notes sn
      USING sessions s
      WHERE sn.session_id = s.id
        AND sn.attendee_id = ${scope.attendeeId}::uuid
        AND s.event_id = ${scope.eventId}::uuid
    `)

    // ═════════════════════════════════════════════════════════════════════════════════════════
    // **T139 (013) — LEAVING A CONFERENCE TAKES THE AUTHORITY OVER IT** (FR-961, decision 39).
    //
    // The same trap 008 recorded immediately above, arriving through a third door — and the
    // reasoning is close enough that it is worth being explicit about the difference.
    //
    // 008's problem was a **commitment** the departing attendee could no longer see or cancel
    // while the other party could still act on it. This is an **authority** the departing
    // attendee could still exercise: nothing about an `organizer_assignments` row depends on a
    // registration, so an organizer who withdrew from a conference would keep administrative
    // control over it indefinitely — able to promote, demote and act on content at an event they
    // have left.
    //
    // Decision 39 states it in one sentence: **authority must not outlive the access it depends
    // on.** 008's cancellation is cited there as the precedent, which is why this sits beside it.
    //
    // **Scoped to this conference only.** Somebody withdrawing from one event keeps their
    // authority over the others — FR-932's independent revocability seen from the lifecycle side.
    // Contrast `deleteAccount` below, which revokes every assignment.
    //
    // **`revokeAssignmentForEvent` is called and handed `tx`.** This must commit **with** the
    // withdrawal or not at all — an authority revoked by a rolled-back withdrawal is an organizer
    // who lost their conference for no reason — and passing the transaction is exactly how the
    // helper delivers that. Inlining the UPDATE here did not make it more atomic; it only made
    // `organizer_assignments` a table two files write with two copies of the same predicate.
    // ═════════════════════════════════════════════════════════════════════════════════════════
    await revokeAssignmentForEvent(scope.attendeeId, scope.eventId, tx)

    // Last, and the cascade to `active_event_selections` rides on it.
    await tx.execute(sql`
      DELETE FROM registrations
      WHERE attendee_id = ${scope.attendeeId}::uuid AND event_id = ${scope.eventId}::uuid
    `)
  })
}
