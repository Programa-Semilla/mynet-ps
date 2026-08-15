import { sql, type SQL } from 'drizzle-orm'

import { assertVerifiedScope, type EventScope } from '../../plugins/event-access.js'
import { getDb } from '../client.js'
import type { Availability, NetworkingIntent } from '../schema/profiles.js'

/**
 * T045 (006) — the directory listing (FR-401–FR-413, research D12).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ONE QUERY: THREE VISIBILITY CONDITIONS, THE SEARCH, BOTH FILTERS, THE OVERLAP COUNT, THE
 * ORDERING AND THE KEYSET BOUND.**
 *
 * They are not separable, and separating them is the mistake worth naming. Ranking, filtering
 * and pagination are the *same operation over the same rows*: the page is chosen **by** rank, so
 * ranking a page that filtering already chose ranks the wrong set, and fetching everything in
 * order to rank it is what FR-409 forbids and what D4's pagination exists to avoid.
 *
 * The visibility conditions are in that same `WHERE` for the reason 004 recorded when it wrote
 * `readCoAttendeeProfile`: a predicate cannot be forgotten on one branch when there are no
 * branches. An attendee excluded by any of the three produces **no row** — they are absent from
 * the result, not marked in it (FR-402).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **FR-413 HOLDS STRUCTURALLY, AND THIS PARAGRAPH IS WHAT MAKES THAT CHECKABLE.**
 *
 * The only input this query takes from outside the conference is **the reader's own interest
 * set**, which is the reader's own data. There is no join to `saved_sessions`, `session_notes`,
 * or anything a later feature adds for messages or appointments — so a ranking derived from
 * private data could not be written here without adding a join that review would see.
 * `tests/unit/directory-response-shape.test.ts` asserts exactly that over this file's source.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * One row of the listing, as the database produces it.
 *
 * **`avatarObjectKey`, not bytes.** The query knows where an avatar lives; resolving it into
 * bytes is the route's job, because that is where `StorageService` is reachable and where the
 * read-path repair belongs (research D2). Keeping the two apart also means this function has no
 * I/O beyond one statement, which is what makes the performance criteria measurable.
 */
export interface DirectoryRow {
  readonly attendeeId: string
  readonly displayName: string
  readonly company: string | null
  readonly role: string | null
  readonly headline: string | null
  /**
   * T180 (014 tranche 2) — the productive-activity description (FR-1099d, REQ-030): what this
   * person actually makes or does, shown on the card and searched by the free-text predicate.
   * Sector and subsector are deliberately NOT here — their route into Discover is the filter
   * question FR-1099 leaves open (T214), and neither the card nor the search may answer it by
   * accident.
   */
  readonly productiveActivity: string | null
  readonly networkingIntent: NetworkingIntent | null
  readonly availability: Availability | null
  readonly interests: readonly string[]
  readonly sharedInterestCount: number
  readonly avatarObjectKey: string | null
}

export interface DirectoryRows {
  readonly attendees: readonly DirectoryRow[]
  readonly nextCursor: string | null
}

export interface DirectoryQuery {
  readonly q?: string | undefined
  readonly role?: string | undefined
  readonly interest?: string | undefined
  readonly cursor?: string | undefined
  readonly limit?: number | undefined
}

/**
 * Escapes the wildcards `LIKE` would otherwise read out of the reader's own typing.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Not a security fix — the term is already a bound parameter — but a correctness one.** In
 * `LIKE`, `%` matches anything and `_` matches any single character, so a reader searching for
 * `%` gets the entire directory, and one searching `A_B` matches `AxB`. Neither is what they
 * typed and neither is anything they can diagnose.
 *
 * `\\` is escaped first, or escaping the other two would double-escape it. The `ESCAPE` clause
 * at the call site is what makes the backslash mean this rather than being a literal.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const escapeLike = (term: string): string =>
  term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')

/** Thrown for a cursor that was not produced by `encodeCursor`. The route maps it to a refusal. */
export class InvalidCursorError extends Error {
  constructor() {
    super('The pagination cursor is not one this server issued.')
    this.name = 'InvalidCursorError'
  }
}

/**
 * Page size, and its ceiling.
 *
 * 24 is the page the success criteria are written about — SC-407 measures "24 faces in one
 * request". The ceiling exists because an unbounded `limit` is both a denial-of-service
 * parameter and an invitation to pull an entire conference's directory in one response, and a
 * bound the caller can move is not a bound.
 */
export const DIRECTORY_PAGE_SIZE = 24
export const DIRECTORY_MAX_PAGE_SIZE = 100

/**
 * The keyset position: the last row's `(sharedInterestCount, attendeeId)`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Opaque on purpose, and it encodes a position rather than a scope.** The conference comes
 * from the path and its guard, so even a perfectly-formed cursor from another conference
 * narrows nothing and widens nothing — there is no value a caller could put here that reaches
 * outside the `EventScope` the route already proved.
 *
 * Base64url of two plain fields rather than a signed token: nothing here is secret, nothing is
 * an authorization decision, and a signature would imply otherwise.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const encodeCursor = (sharedInterestCount: number, attendeeId: string): string =>
  Buffer.from(`${sharedInterestCount}:${attendeeId}`, 'utf8').toString('base64url')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const decodeCursor = (cursor: string): { count: number; attendeeId: string } => {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  const separator = decoded.indexOf(':')
  if (separator === -1) throw new InvalidCursorError()

  const count = Number(decoded.slice(0, separator))
  const attendeeId = decoded.slice(separator + 1)

  // Refused rather than ignored. Silently restarting at page one would make a truncated URL
  // look like a working directory, and would reintroduce the duplicates keyset exists to avoid.
  if (!Number.isInteger(count) || count < 0 || !UUID.test(attendeeId)) {
    throw new InvalidCursorError()
  }

  return { count, attendeeId }
}

/**
 * One page of the conference directory.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE READER COMES FROM THE SCOPE, NOT FROM AN ARGUMENT** — a deliberate departure from
 * tasks.md's declared `(scope, readerId, query)` signature, recorded here rather than taken
 * silently.
 *
 * `requireEventAccess` builds the scope from `request.attendee.id`, so `scope.attendeeId` *is*
 * the reader and a second parameter could only ever agree with it or disagree with it. The
 * disagreeing case is the one that matters: it would rank the directory against one person's
 * interests while bounding it by another's registration, and nothing would fail. Removing the
 * parameter removes the failure mode.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const listDirectory = async (
  unverified: EventScope,
  query: DirectoryQuery,
): Promise<DirectoryRows> => {
  // Membership, not merely shape — the same check `readCoAttendeeProfile` makes, at the same
  // boundary, for the same reason: a value can satisfy `EventScope` and never have been through
  // the guard.
  const scope = assertVerifiedScope(unverified)

  const limit = Math.min(
    Math.max(Math.trunc(query.limit ?? DIRECTORY_PAGE_SIZE), 1),
    DIRECTORY_MAX_PAGE_SIZE,
  )

  const conditions: SQL[] = []

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **`unaccent(lower(...))` on both sides, so "Munoz" finds "Muñoz" and "Muñoz" finds
   * "Munoz"** (research D5). The product's conferences are Spanish-language; a `lower()`-only
   * search is not slightly worse for these attendees, it is unable to find a large fraction of
   * them from a keyboard without a ñ.
   *
   * **Email is not in this list, and its absence is FR-407.** A search box that answers "yes,
   * that person is here" to a typed address is an enumeration oracle rather than a search.
   *
   * Deliberately unindexed (D5): 1,000 rows already narrowed by the registration join is a
   * trivial scan, and a GIN trigram index would be a second extension plus write amplification
   * on every profile edit to optimise something that is not slow. Revisit at five figures.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  const search = query.q?.trim()
  if (search) {
    conditions.push(sql`
      unaccent(lower(
        a.display_name || ' ' ||
        coalesce(p.company, '') || ' ' ||
        coalesce(p.role, '') || ' ' ||
        coalesce(p.headline, '') || ' ' ||
        coalesce(p.productive_activity, '')
      )) LIKE '%' || unaccent(lower(${escapeLike(search)})) || '%' ESCAPE '\\'
    `)
  }

  // Exact, not fuzzy: the filter chip names a value the reader chose from the data, and a
  // fuzzy match would make it mean something they did not choose.
  const role = query.role?.trim()
  if (role) conditions.push(sql`p.role = ${role}`)

  const interest = query.interest?.trim()
  if (interest) {
    conditions.push(sql`
      EXISTS (
        SELECT 1 FROM attendee_interests filtered
        WHERE filtered.attendee_id = a.id AND filtered.interest = ${interest}
      )
    `)
  }

  /**
   * The keyset bound, written out rather than as a row comparison.
   *
   * `(count, id) < (c, i)` would be wrong: the two columns sort in **opposite directions** —
   * count descending, identifier ascending — and PostgreSQL's row comparison applies one
   * direction to both. Spelling it out is the only correct form here.
   */
  if (query.cursor) {
    const { count, attendeeId } = decodeCursor(query.cursor)
    conditions.push(sql`
      (shared.shared_count < ${count}
        OR (shared.shared_count = ${count} AND a.id > ${attendeeId}::uuid))
    `)
  }

  const narrowing = conditions.length === 0 ? sql`` : sql` AND ${sql.join(conditions, sql` AND `)}`

  /**
   * One extra row, to answer "is there a next page" without a second query or a count.
   *
   * A `count(*)` over the whole filtered set would be a second scan on every page **and** would
   * be the total FR-404 forbids reporting. Reading `limit + 1` answers the only question the
   * response is allowed to answer.
   */
  const rows = await getDb().execute<{
    attendee_id: string
    display_name: string
    company: string | null
    role: string | null
    headline: string | null
    productive_activity: string | null
    networking_intent: NetworkingIntent | null
    availability: Availability | null
    interests: string[] | null
    shared_interest_count: number
    avatar_object_key: string | null
  }>(sql`
    SELECT
      a.id                                  AS attendee_id,
      a.display_name                        AS display_name,
      a.avatar_object_key                   AS avatar_object_key,
      p.company                             AS company,
      p.role                                AS role,
      p.headline                            AS headline,
      p.productive_activity                 AS productive_activity,
      p.networking_intent                   AS networking_intent,
      p.availability                        AS availability,
      coalesce(listed.interests, ARRAY[]::text[]) AS interests,
      shared.shared_count::int              AS shared_interest_count
    FROM attendees a
    -- Condition 2 of three: the TARGET is registered for this conference. Condition 1 — that
    -- the READER is — is already proven by the scope above, which only the guard can build.
    JOIN registrations r
      ON r.attendee_id = a.id AND r.event_id = ${scope.eventId}::uuid
    LEFT JOIN attendee_profiles p ON p.attendee_id = a.id
    -- Displayed interests. LEFT, because an attendee who has written none is a person with an
    -- empty list, not a person who does not exist.
    LEFT JOIN LATERAL (
      SELECT array_agg(ai.interest ORDER BY ai.interest) AS interests
      FROM attendee_interests ai
      WHERE ai.attendee_id = a.id
    ) listed ON true
    -- The ranking signal. LEFT JOIN LATERAL over an aggregate always yields a row, so a
    -- zero-overlap attendee scores 0 and ranks last rather than vanishing (FR-411).
    LEFT JOIN LATERAL (
      SELECT count(*) AS shared_count
      FROM attendee_interests candidate
      WHERE candidate.attendee_id = a.id
        AND candidate.interest IN (
          SELECT reader.interest
          FROM attendee_interests reader
          WHERE reader.attendee_id = ${scope.attendeeId}::uuid
        )
    ) shared ON true
    WHERE
      -- Condition 3 of three: discoverable AND verified. The second half is the one carrying a
      -- threat model: it stops a person signing up under an address they do not own and
      -- appearing in a professional directory as its owner (FR-325a, SC-304a).
      a.discoverable = true
      AND a.email_verified_at IS NOT NULL
      -- The reader is not in their own directory. Discovering oneself has no purpose, and a
      -- self-card whose overlap equals one's own interest count would sit permanently first.
      AND a.id <> ${scope.attendeeId}::uuid
      ${narrowing}
    ORDER BY shared.shared_count DESC, a.id ASC
    LIMIT ${limit + 1}
  `)

  const page = rows.slice(0, limit)
  const hasMore = rows.length > limit
  const last = page.at(-1)

  return {
    attendees: page.map((row) => ({
      attendeeId: row.attendee_id,
      displayName: row.display_name,
      company: row.company,
      role: row.role,
      headline: row.headline,
      productiveActivity: row.productive_activity,
      networkingIntent: row.networking_intent,
      availability: row.availability,
      interests: row.interests ?? [],
      sharedInterestCount: Number(row.shared_interest_count),
      avatarObjectKey: row.avatar_object_key,
    })),
    nextCursor:
      hasMore && last ? encodeCursor(Number(last.shared_interest_count), last.attendee_id) : null,
  }
}
