import { sql } from 'drizzle-orm'

import { assertVerifiedScope, type EventScope } from '../../plugins/event-access.js'
import { avatarObjectKey, type StorageService } from '../../storage/service.js'
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

  const [profiles, interests, registrations, active, saved, notes, sessions] = await Promise.all([
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
    db.execute<{ session_id: string; title: string; event_id: string; saved_at: Date }>(sql`
      SELECT ss.session_id, s.title, s.event_id, ss.saved_at
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
  // Unconditional: `delete` is idempotent, so an attendee who never uploaded anything does not
  // need a branch, and a row whose key was somehow lost still has its bytes removed.
  await storage.delete(avatarObjectKey(attendeeId))

  const rows = await getDb().execute<{ id: string }>(sql`
    DELETE FROM attendees WHERE id = ${attendeeId}::uuid RETURNING id
  `)

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

    // Last, and the cascade to `active_event_selections` rides on it.
    await tx.execute(sql`
      DELETE FROM registrations
      WHERE attendee_id = ${scope.attendeeId}::uuid AND event_id = ${scope.eventId}::uuid
    `)
  })
}
