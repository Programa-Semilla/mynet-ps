import type { AccountExport } from '../../src/db/queries/account.js'

/**
 * The export coverage map, shared by the two tests that check its two halves.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A plain module rather than an export from a `.test.ts` file, deliberately.**
 *
 * `tests/unit/export-coverage.test.ts` proves every schema column is declared here;
 * `tests/integration/export.test.ts` proves every declaration is actually produced. Both need
 * this mapping, and importing one test file from another would register the unit guard's
 * `describe` block inside the integration project — running those six tests twice, under a
 * project whose name misdescribes them, for no benefit.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * What the export actually produces, expressed as the set of source columns it reproduces.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Declared here rather than inferred from a sample document, deliberately.** Inferring from
 * a real export would make the test agree with whatever the export happened to do — including
 * omitting a field, since an absent value and an absent field are indistinguishable in JSON.
 *
 * This mapping is the claim; the schema below is the check. Adding a column without adding it
 * here fails.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **EACH ENTRY NAMES THE FIELD IN THE DOCUMENT, NOT ONLY THE SECTION — and that is the half
 * that makes the claim checkable.**
 *
 * An earlier revision mapped each column to a `keyof AccountExport` alone. That made this guard
 * satisfiable by writing one line: a future author adding `attendee_profiles.linkedin_url` could
 * map it to `'profile'` and go green **without the export ever producing it**, which is exactly
 * the "add it to the allow-list without thought" outcome the guard exists to prevent. The
 * docblock claimed `tests/integration/export.test.ts` would catch that; it would not — that file
 * spot-checks a handful of values with `toMatchObject` and asserts nothing about the rest.
 *
 * Naming the field makes the mapping executable. `export.test.ts` walks these entries against a
 * fully-populated export and requires every named field to be present, so a column declared here
 * but absent from `assembleExport` fails there — which is what the paragraph above always
 * claimed and now describes.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export interface ExportTarget {
  /** The top-level section of the document. */
  readonly section: keyof AccountExport
  /** The field within that section — within each element, where the section is a list. */
  readonly field: string
}

export const EXPORTED_COLUMNS: Record<string, ExportTarget> = {
  'attendees.id': { section: 'account', field: 'id' },
  'attendees.email': { section: 'account', field: 'email' },
  'attendees.display_name': { section: 'account', field: 'displayName' },
  'attendees.email_verified_at': { section: 'account', field: 'emailVerifiedAt' },
  'attendees.discoverable': { section: 'account', field: 'discoverable' },
  'attendees.created_at': { section: 'account', field: 'createdAt' },
  'attendees.updated_at': { section: 'account', field: 'updatedAt' },

  'attendee_profiles.company': { section: 'profile', field: 'company' },
  'attendee_profiles.role': { section: 'profile', field: 'role' },
  'attendee_profiles.headline': { section: 'profile', field: 'headline' },
  'attendee_profiles.networking_intent': { section: 'profile', field: 'networkingIntent' },
  'attendee_profiles.availability': { section: 'profile', field: 'availability' },
  'attendee_profiles.updated_at': { section: 'profile', field: 'updatedAt' },

  // The section is a list of bare strings rather than of objects, so there is no field name to
  // check within an element. The empty field marks that, and `export.test.ts` skips it.
  'attendee_interests.interest': { section: 'interests', field: '' },

  'registrations.event_id': { section: 'registrations', field: 'eventId' },
  'registrations.created_at': { section: 'registrations', field: 'registeredAt' },

  'active_event_selections.event_id': { section: 'activeConference', field: 'eventId' },
  'active_event_selections.updated_at': { section: 'activeConference', field: 'updatedAt' },

  'saved_sessions.session_id': { section: 'savedSessions', field: 'sessionId' },
  'saved_sessions.saved_at': { section: 'savedSessions', field: 'savedAt' },

  'session_notes.session_id': { section: 'sessionNotes', field: 'sessionId' },
  'session_notes.body': { section: 'sessionNotes', field: 'body' },
  'session_notes.updated_at': { section: 'sessionNotes', field: 'updatedAt' },

  'auth_sessions.created_at': { section: 'signInSessions', field: 'createdAt' },
  'auth_sessions.last_used_at': { section: 'signInSessions', field: 'lastUsedAt' },
  'auth_sessions.expires_at': { section: 'signInSessions', field: 'expiresAt' },
  'auth_sessions.revoked_at': { section: 'signInSessions', field: 'revokedAt' },
}
