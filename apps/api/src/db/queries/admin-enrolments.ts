import { sql } from 'drizzle-orm'

import {
  assertVerifiedConferenceAuthority,
  type ConferenceAuthorityScope,
} from '../../admin/require-conference-authority.js'
import { getDb } from '../client.js'
import { sessionEnrolments } from '../schema/agenda.js'
import { attendees } from '../schema/attendees.js'
import { sessions } from '../schema/catalog.js'

/**
 * T144 (014 tranche 2) — the enrolment roster (FR-1073, FR-1073a, constitution v5.3.0 O1).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE FOURTH RECORDED PRINCIPLE VIII EXCEPTION, AND THE FIRST ADMINISTRATIVE READ OF
 * ATTENDEE STATE THIS PROJECT HAS EVER PERMITTED.** An organizer told to close enrolment early
 * because materials must be prepared cannot prepare them for people they cannot name (REQ-086).
 * O1's four bounds are each visible in the one query below, which is what makes them structural
 * rather than asserted:
 *
 *   - **Only enrolment.** The query reads `session_enrolments` and nothing else. Who saved,
 *     noted, questioned or voted stays counts-only with nobody identified — FR-1042 survives
 *     unnarrowed for all four, and `no-attendee-state-disclosure.test.ts` refuses any route
 *     that would offer them.
 *   - **Only an assigned organizer** (a platform operator by the product-wide authority they
 *     already hold): the scope demanded below is mintable only by `requireConferenceAuthority`.
 *   - **Only that conference's sessions**: the join re-anchors on `scope.eventId` rather than
 *     trusting the session id, so an assigned organizer cannot read any session's roster in
 *     the product by guessing a UUID (research R16).
 *   - **Names only.** The projection is `display_name` and nothing — no identifier, no email,
 *     no avatar, no route into a profile. This file is the disclosure guard's third audited
 *     file list, asserted to project exactly that one identity column.
 *
 * **The attendee was told first** (FR-1074): the client presents the roster-visibility notice
 * before a place is taken, which is what makes this the only privacy exception its subject can
 * decline by not acting.
 *
 * **In its own module, not `admin-catalog.ts`**, twice over (R16): that file's invariant is
 * "count(*) is the whole interface" and its projections are scanned for identity columns —
 * a legitimate name here would force an exemption broad enough to cover what the scan exists
 * to catch. And no history: who withdrew is not part of the roster (O1 licenses the roster,
 * not its past).
 */

export interface RosterEntry {
  readonly displayName: string
}

export const listEnrolmentRoster = async (
  unverified: ConferenceAuthorityScope,
  sessionId: string,
): Promise<readonly RosterEntry[] | null> => {
  const scope = assertVerifiedConferenceAuthority(unverified)

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) {
    return null
  }

  // The session must exist IN THIS CONFERENCE, or the caller gets the same null every other
  // unreachable thing produces — an empty roster is a 200 ("nobody yet"), a foreign session is
  // the indistinguishable 404.
  const known = await getDb().execute<{ id: string }>(sql`
    SELECT id FROM ${sessions}
    WHERE id = ${sessionId}::uuid AND event_id = ${scope.eventId}::uuid AND kind = 'optional'
    LIMIT 1
  `)
  if (known.length === 0) return null

  const rows = await getDb().execute<{ display_name: string }>(sql`
    SELECT a.display_name
    FROM ${sessionEnrolments} e
    JOIN ${sessions} s ON s.id = e.session_id
    JOIN ${attendees} a ON a.id = e.attendee_id
    WHERE e.session_id = ${sessionId}::uuid
      AND s.event_id = ${scope.eventId}::uuid
    ORDER BY a.display_name, e.taken_at
  `)

  return rows.map((row) => ({ displayName: row.display_name }))
}
