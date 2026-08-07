import { sql } from 'drizzle-orm'
import {
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { events } from './events.js'

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
 * **This content is seeded, and there is no write path to it at any privilege** (FR-132,
 * FR-134). Creating, editing or importing a programme would be organizer administration, which
 * Principle III puts out of scope; the route audit asserts that no such route exists (T072).
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
 * **Absent by design**: no saved state, no notes, no questions, no capacity, no attendance.
 * 005 and 009 own the first three; the last two are not named by any requirement.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),

    // NOT NULL because FR-135 makes both required attributes of a session. Speakers are the
    // only optional part of a session's identity.
    trackId: uuid('track_id')
      .notNull()
      .references(() => tracks.id),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id),

    title: text('title').notNull(),
    summary: text('summary'),

    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    // A session that ends before it begins cannot exist, regardless of which code path inserts
    // it. Same reasoning as the shipped `events_ends_on_after_starts_on`.
    check('sessions_ends_at_after_starts_at', sql`${table.endsAt} > ${table.startsAt}`),
    // Every read is "this event's programme, in time order".
    index('sessions_event_starts_at_idx').on(table.eventId, table.startsAt),
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
