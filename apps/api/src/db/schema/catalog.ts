import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { events } from './events.js'

/**
 * T111 (014 tranche 2) — the two kinds of session (FR-1060). The route schema's `enum` spreads
 * this constant, and the client's union derives from the generated contract that enum
 * generates — so those two cannot disagree with it by construction. The `sessions_kind_fields`
 * CHECK below spells both values literally instead of deriving them: its two branches carry
 * different bodies per kind (a membership map cannot express it), and 009's two-layer rule
 * wants the last line of defence asserted independently of the code it defends against anyway.
 */
export const SESSION_KINDS = ['mandatory', 'optional'] as const
export type SessionKind = (typeof SESSION_KINDS)[number]

/**
 * T033 (002) — the session catalog: the conference programme (FR-130–FR-140).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SCOPING: PER-EVENT, FOR EVERY TABLE IN THIS FILE.**
 *
 * The constitution enumerates sessions, tracks, speakers and rooms as conference content, which
 * is per-event and swaps when the attendee switches. Neither rule is a default that may be
 * assumed, so each table states its own below.
 *
 * The predicate is enforced server-side, before any read, through `requireEventAccess` and the
 * branded `EventScope` that every query in `queries/catalog.ts` demands. There is no path to
 * anything in this file that does not pass through it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T002 (014) — "THERE IS NO WRITE PATH TO IT AT ANY PRIVILEGE" WAS TRUE UNTIL v5.2.0 AND IS
 * NOW FALSE. WHAT REPLACES IT IS NARROWER THAN "ANYBODY MAY WRITE".**
 *
 * The original sentence read: *this content is seeded, and there is no write path to it at any
 * privilege (FR-132, FR-134)*. Constitution v4.0.0 admitted a second actor and v5.2.0 gave that
 * actor a write path into exactly these five tables. The correction is recorded here rather
 * than deleted, because a reader arriving from `queries/catalog.ts` or from
 * `catalog-read-only.test.ts` needs to know which half survived:
 *
 *   - **The attendee read path is unchanged.** `queries/catalog.ts` still takes an `EventScope`
 *     minted from an attendee's registration, still exports reads only, and `CatalogRepository`
 *     still declares no write method. FR-191 survives **literally** (research R1).
 *   - **The write path is a different file with a different scope type**:
 *     `queries/admin-catalog.ts`, whose every function demands a `ConferenceAuthorityScope`
 *     that only `requireConferenceAuthority` can mint. An attendee cannot obtain one.
 *
 * So the rule is not "seeded, and unwritable" — it is **"writable only by a principal holding
 * authority over this conference, and never by an attendee"** (FR-1001, FR-1002, FR-1035).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * A session category, visually coded and always also named in text.
 *
 * **Scoping: per-event.** Two conferences naming a track "Design" are naming two different
 * things — they categorise two different programmes — so the name is unique per event rather
 * than globally.
 */
export const tracks = pgTable(
  'tracks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    name: text('name').notNull(),

    /**
     * A theme token **name**, e.g. `track-design` — **never a colour value** (FR-136, research
     * D7).
     *
     * The constitution prohibits hardcoded hex literals and requires the palette to live in one
     * place. A colour here would put it in two, and would let a seed change alter the design
     * system without touching the design system. An unrecognised token renders as a defined
     * neutral, so a seed typo degrades rather than breaks.
     */
    colorToken: text('color_token').notNull(),
  },
  (table) => [
    unique('tracks_event_name_unique').on(table.eventId, table.name),
    index('tracks_event_id_idx').on(table.eventId),
  ],
)

/**
 * A room at the venue.
 *
 * **Scoping: per-event.** A room is a place at a venue, and the venue belongs to the
 * conference.
 *
 * A table rather than free text on a session, so a later feature can present a room without
 * re-modelling it, and so a typo cannot create a phantom room that looks like a real one.
 */
export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    name: text('name').notNull(),
  },
  (table) => [
    unique('rooms_event_name_unique').on(table.eventId, table.name),
    index('rooms_event_id_idx').on(table.eventId),
  ],
)

/**
 * Someone speaking at a session.
 *
 * **Scoping: per-event.** The constitution enumerates speakers as conference content.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The consequence, stated deliberately**: the same human speaking at two conferences is
 * **two rows with no link between them**. That is what per-event scoping means here and it is
 * accepted — but it is a real modelling consequence, and feature 004 must not assume a speaker
 * is an attendee profile or that speakers are unique across events.
 *
 * A speaker is seeded content and carries no credentials. **Absent by design**: no email, no
 * avatar, no attendee reference — none is named by a requirement, and each would open a
 * personal-data surface this feature has declared it does not open (Principle VIII).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const speakers = pgTable(
  'speakers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    name: text('name').notNull(),
    /** Role or headline, as the prototype shows. Nullable — not every speaker has one. */
    title: text('title'),
    company: text('company'),
  },
  (table) => [index('speakers_event_id_idx').on(table.eventId)],
)

/**
 * A scheduled item on the programme.
 *
 * **Scoping: per-event.** The clearest case in the constitution's enumeration.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`timestamptz`, not a local time plus the event's zone** (FR-124, research D6). The
 * programme is read by attendees in other timezones and relative wording is computed at display
 * time, so storing an absolute instant makes "starts in 15 minutes" a subtraction rather than a
 * reconstruction. Grouping into venue-local days uses the event's timezone at read time.
 *
 * A session crossing venue-local midnight belongs to the date it starts — a consequence of
 * grouping by the venue-local date of `starts_at`, not a separate rule.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Absent by design**: no saved state, no notes, no questions, no attendance. 005 and 009 own
 * the first three; attendance stays unnamed by any requirement and FR-1084 now forbids it by
 * name — holding a place is a claim on capacity, not a statement that somebody turned up.
 *
 * **T116 (014 tranche 2)** — this list used to include "no capacity", on the ground that no
 * requirement named it. FR-1061 and FR-1063 now do: an optional session carries a maximum
 * number of places and offers enrolment in place of saving. The sentence is rewritten rather
 * than deleted, because the comment is the record and a reader arriving from the shipped
 * absence tests needs to know which half survived.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),

    // NOT NULL because FR-135 makes the track a required attribute of a session.
    //
    // T117 (014 tranche 2) — this comment used to read "Speakers are the only optional part of
    // a session's identity", and FR-1049 makes that false: the room is now optional too, so a
    // virtual session has a representation rather than a room nobody goes to. What replaces the
    // mandatory room is FR-1050's rule — a session carries a room, an access link, or both,
    // and never neither — enforced by `sessions_room_or_link` below and by the write path,
    // with modality deciding which of the two (FR-1050a, write-path only: a CHECK cannot
    // reference `events.modality`).
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id),
    roomId: uuid('room_id').references(() => rooms.id),

    title: text('title').notNull(),
    summary: text('summary'),

    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),

    /**
     * T002 (014) — **cancellation: conference content, and STORED rather than derived**
     * (FR-1020, v5.2.0 N5).
     *
     * ═════════════════════════════════════════════════════════════════════════════════════
     * Null means the session is happening. A value means an organizer cancelled it, and when.
     *
     * **The stored-versus-derived choice is the opposite of 008's, and the difference is what
     * makes both right.** 008 derived `lapsed` from the slot instant precisely so its feature
     * would need no background job: a slot in the past is lapsed by arithmetic, and a stored
     * fifth status would have needed a sweep to maintain. Cancellation has nothing to derive
     * it *from*. It is an organizer's **act**, not a function of the clock, so anything that
     * computed it would have to consult a record of the act — which is this column.
     *
     * **Reversible** (FR-1024): setting it back to null reinstates the session, and
     * reinstatement dispatches nothing. The notification rule names cancellation and not its
     * reversal, and an attendee whose session comes back has lost nothing by not being told.
     *
     * **Deliberately absent: no `cancelled_by`.** The audit entry records who acted, and
     * duplicating it here would be a second source of truth for a fact the trail already
     * answers — 009's reasoning for refusing a denormalised vote counter, and 013's for
     * deriving the operator tier from which column is populated.
     * ═════════════════════════════════════════════════════════════════════════════════════
     */
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),

    /**
     * T002 (014) — **when this session last changed MATERIALLY** (FR-1026, FR-1030, R7).
     *
     * ─────────────────────────────────────────────────────────────────────────────────────
     * Set when — and only when — one of v5.2.0 N1's three changes lands: the session is
     * cancelled, its start time changes, or its room changes. A title, summary, track or
     * speaker edit leaves it alone (FR-1027), because content does not strand anybody in the
     * wrong corridor.
     *
     * **Half of the marker predicate**, the other half being `saved_sessions.viewed_at`. The
     * marker is `logistics_changed_at > viewed_at` — two timestamps and a comparison, with
     * nothing stored per change.
     *
     * **It carries no history, and that absence is the feature.** This is the instant of the
     * most recent material change, not a log of them. There is nothing here to list, which is
     * what keeps FR-1031's prohibition on a change list *structural* rather than a matter of
     * restraint: producing "3 changes" would require a table nobody has built.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    logisticsChangedAt: timestamp('logistics_changed_at', { withTimezone: true }),

    /**
     * T002 (014) — **the audit entry of the act that last materially changed this session**;
     * the coalescing key (FR-1034, R4).
     *
     * ─────────────────────────────────────────────────────────────────────────────────────
     * One organizer act may change a dozen sessions. FR-1034 requires each affected attendee
     * to be interrupted **once**, however many of their saved sessions it touched, so the
     * fan-out needs a name for "this act" — and the audit entry id already is one: unique per
     * act, generated inside the act's transaction (FR-1037), and meaningless outside it. The
     * alternatives all invent an identifier (a batch id, a time bucket, a request id) that the
     * accountability record is already providing.
     *
     * **No foreign key**, following 013's precedent for `abuse_reports.message_ids` exactly.
     * The audit trail is swept on retention, so the entry can legitimately disappear while the
     * session remains: a dangling value is a **normal state**, not an error. A real reference
     * would either block the sweep or cascade a null in a way that reads like data loss.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    lastChangeActId: uuid('last_change_act_id'),

    /**
     * T111 (014 tranche 2) — **whether this session is mandatory or optional** (FR-1060).
     *
     * ═════════════════════════════════════════════════════════════════════════════════════
     * **CONFERENCE CONTENT, per-event** — an attribute of the session, and a session belongs
     * to exactly one conference (standing decision 7). Not attendee data: no cascade from an
     * attendee, no export coverage, declared with that reason.
     *
     * Chosen by the organizer who authors the session; absent a stated kind, mandatory — as
     * is every session that existed before this column. **The kind decides the identity of
     * the one commitment control an attendee sees** (FR-1063): optional offers enrolment in
     * place of saving. It is not changeable while any attendee holds a save or a place
     * (FR-1065), checked under the session-row lock, because forty saves becoming twenty
     * places has no honest answer.
     * ═════════════════════════════════════════════════════════════════════════════════════
     */
    kind: text('kind').$type<SessionKind>().notNull(),

    /**
     * T111 (014 tranche 2) — **the maximum number of places in an optional session**
     * (FR-1061). Conference content, per-event, same declaration as `kind`.
     *
     * Present exactly when the session is optional (`sessions_kind_fields` below): capacity
     * is what makes a session optional in this product's sense, and a capacity on a
     * mandatory session is a field somebody will fill in (FR-1062a). Bounded below by the
     * places already held at edit time (FR-1061a) — a cross-table rule the write path
     * enforces under the session-row lock, which no CHECK can express.
     *
     * **Remaining places is derived at read time and stored nowhere**: a stored counter is a
     * second source of truth for a number the rows already answer, and the one that drifted
     * would be the one displayed — 009's rule for the vote count, 008's for `lapsed`.
     */
    capacity: integer('capacity'),

    /**
     * T111 (014 tranche 2) — **how many hours before its start this session stops accepting
     * new places** (FR-1062). Conference content, per-event.
     *
     * **An offset, never an instant** (FR-1071): a session that moves carries its deadline
     * with it and needs no repair step — which matters precisely because a change of start
     * time is something attendees are notified about. The closing instant and whether
     * enrolment is open are **derived in SQL against the database clock at the moment of the
     * request** (FR-1071a, FR-1072) — a stored open flag is how a lifecycle arrives wearing
     * a different name, which the no-draft-state rule forbids on conference content. Zero is
     * permitted: enrolment open until the session starts.
     */
    enrolmentClosingOffsetHours: integer('enrolment_closing_offset_hours'),

    /**
     * T111 (014 tranche 2) — **where a virtual or hybrid session is attended** (FR-1052).
     * Conference content, per-event: it addresses one session of one conference and means
     * nothing outside it. It identifies nobody.
     *
     * ─────────────────────────────────────────────────────────────────────────────────────
     * **A dedicated, validated field — never the summary.** The summary is long free text
     * nothing parses, it is enumerated as content that does not notify (FR-1027), and
     * rendering organizer-authored free text as clickable markup would be a new injection
     * surface authored by a promoted attendee. `https:` is the only permitted scheme
     * (FR-1053), enforced at the write path and by `sessions_access_link_https` below as the
     * last line of defence. **The product never fetches the link to check it** — that is a
     * server-side request to a URL a promoted attendee typed.
     *
     * Published the moment it is written (FR-1055): content is live-edited, so there is no
     * moment between writing and publishing, no timed release and no reveal condition
     * (FR-1056). Nothing records whether an attendee used it (FR-1057).
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    accessLink: text('access_link'),
  },
  (table) => [
    // A session that ends before it begins cannot exist, regardless of which code path inserts
    // it. Same reasoning as the shipped `events_ends_on_after_starts_on`.
    //
    // T031 (014) — this is also the whole of FR-1013 at the last line of defence. The write
    // path validates end-after-start too, and the two agreeing is the point: 009 found
    // PostgreSQL's `trim()` accepting what the route refused, so the layers are asserted
    // separately rather than assumed to match.
    check('sessions_ends_at_after_starts_at', sql`${table.endsAt} > ${table.startsAt}`),
    // Every read is "this event's programme, in time order".
    index('sessions_event_starts_at_idx').on(table.eventId, table.startsAt),
    /**
     * T-review (014) — **`(event_id, room_id, starts_at)`, replacing an index no query used.**
     *
     * ─────────────────────────────────────────────────────────────────────────────────────
     * This was `sessions_event_cancelled_idx` on `(event_id, cancelled_at)`, justified as "the
     * programme read now filters or flags on cancellation for every attendee surface". No read
     * filters on it: `queries/catalog.ts` **selects** `cancelled_at` and never constrains it (an
     * index cannot serve a projection), and "Up next"'s exclusion is applied in client code. So it
     * was write cost on the product's hottest edit-time table, for a query that does not exist.
     *
     * The predicate that *does* exist is `overlappingInRoom`, which runs on every session create
     * and update: `event_id`, `room_id`, a half-open time range, and `cancelled_at is null`. This
     * covers the first three. `cancelled_at` is deliberately not a fourth column — it is very low
     * selectivity, so it would widen the index without narrowing the scan.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    index('sessions_event_room_starts_at_idx').on(table.eventId, table.roomId, table.startsAt),
    // FR-1050 at the last line of defence: a session with neither a room nor a link is a
    // session nobody can attend — the failure the mandatory room was accidentally preventing
    // before FR-1049 relaxed it. The modality half of the rule (FR-1050a) needs
    // `events.modality`, which a CHECK cannot reference, so that half is write-path only and
    // is tested as such.
    check(
      'sessions_room_or_link',
      sql`${table.roomId} IS NOT NULL OR ${table.accessLink} IS NOT NULL`,
    ),
    // FR-1060/FR-1062a in one constraint: a mandatory session carries neither a capacity nor
    // a closing offset; an optional one carries both, capacity at least one (FR-1061) and the
    // offset non-negative (zero = open until start). Kind itself is bounded to the two values.
    //
    // The optional branch names presence EXPLICITLY (`IS NOT NULL` beside each bound), because
    // `"capacity" >= 1` against NULL is NULL, `false OR NULL` is NULL, and a CHECK **passes**
    // on NULL — so without them an optional session carrying neither field satisfied the
    // constraint, and only `validateKindFields` refused it. Two layers that disagree with the
    // weaker one as the last defence is 009's `trim()`/`btrim` finding, and the row this hole
    // admitted would misbehave twice over: a NULL capacity reads as unlimited enrolment, and a
    // NULL offset makes `enrolmentOpen` yield SQL NULL, which `!open` reads as permanently
    // closed.
    check(
      'sessions_kind_fields',
      sql.raw(
        `(("kind" = 'mandatory' AND "capacity" IS NULL AND "enrolment_closing_offset_hours" IS NULL)` +
          ` OR ("kind" = 'optional' AND "capacity" IS NOT NULL AND "capacity" >= 1` +
          ` AND "enrolment_closing_offset_hours" IS NOT NULL AND "enrolment_closing_offset_hours" >= 0))`,
      ),
    ),
    // FR-1053's scheme rule at the last line of defence, independent of the write path — 009
    // found PostgreSQL and the route disagreeing, so the two layers are asserted separately.
    check(
      'sessions_access_link_https',
      sql.raw(`("access_link" IS NULL OR "access_link" LIKE 'https://%')`),
    ),
  ],
)

/**
 * Which speakers appear at which session.
 *
 * **Scoping: per-event, transitively** — both sides are per-event, and a row may only join a
 * session and a speaker belonging to the same event. That is not expressible as a simple foreign
 * key, so it is **asserted by an integration test over the seeded data** rather than claimed.
 *
 * Many-to-many because FR-135 says a session *may* carry speakers and the prototype shows panels
 * with more than one. A nullable `speaker_id` on `sessions` would have made FR-138's no-speaker
 * case indistinguishable from a missing join.
 */
export const sessionSpeakers = pgTable(
  'session_speakers',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    speakerId: uuid('speaker_id')
      .notNull()
      .references(() => speakers.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.speakerId] }),
    index('session_speakers_speaker_id_idx').on(table.speakerId),
  ],
)

export type Track = typeof tracks.$inferSelect
export type Room = typeof rooms.$inferSelect
export type Speaker = typeof speakers.$inferSelect
export type Session = typeof sessions.$inferSelect
