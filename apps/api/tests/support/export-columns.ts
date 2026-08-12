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

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // T018, T136 (007). Four sections, and the columns NOT here are the interesting half —
  // `messages.author_id` (the exclusion is a WHERE clause), and the two `push_subscriptions`
  // key columns (credentials, exported as a redacted presence). Both are declared with their
  // reasoning in `tests/unit/export-coverage.test.ts`.
  // ═════════════════════════════════════════════════════════════════════════════════════════
  'messages.conversation_id': { section: 'messages', field: 'conversationId' },
  'messages.body': { section: 'messages', field: 'body' },
  'messages.sent_at': { section: 'messages', field: 'sentAt' },

  'attendee_blocks.blocked_id': { section: 'blocks', field: 'blockedAttendeeId' },
  'attendee_blocks.created_at': { section: 'blocks', field: 'createdAt' },

  'abuse_reports.reported_id': { section: 'reports', field: 'reportedAttendeeId' },
  'abuse_reports.reason': { section: 'reports', field: 'reason' },
  'abuse_reports.message_ids': { section: 'reports', field: 'messageIds' },
  'abuse_reports.created_at': { section: 'reports', field: 'createdAt' },

  'push_subscriptions.endpoint': { section: 'pushSubscriptions', field: 'endpoint' },
  'push_subscriptions.created_at': { section: 'pushSubscriptions', field: 'createdAt' },
  'push_subscriptions.last_delivered_at': {
    section: 'pushSubscriptions',
    field: 'lastDeliveredAt',
  },

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // T027 (008) — **`shared_cards` appears TWICE, and that is FR-653 rather than a duplication.**
  //
  // A card row is one fact seen from two sides: it is *a card you shared* to its sharer and *a
  // card you hold* to its recipient. An export keyed on one attendee therefore has to reproduce
  // the same table in two sections, filtered by a different column each time — which is why the
  // two identifier columns land in different places below rather than one being "the requester".
  //
  // `appointments` is the same shape for the same reason: the export lists them in both roles.
  // ═════════════════════════════════════════════════════════════════════════════════════════
  'shared_cards.event_id': { section: 'cardsShared', field: 'eventId' },
  'shared_cards.shared_at': { section: 'cardsShared', field: 'sharedAt' },
  // The counterpart in each direction. In `cardsShared` the recipient is the other person; in
  // `cardsHeld` the sharer is. Each is mapped to the section where it is somebody else.
  'shared_cards.recipient_id': { section: 'cardsShared', field: 'recipientAttendeeId' },
  'shared_cards.sharer_id': { section: 'cardsHeld', field: 'sharerAttendeeId' },

  'appointments.event_id': { section: 'appointments', field: 'eventId' },
  'appointments.slot_id': { section: 'appointments', field: 'slotId' },
  'appointments.topic': { section: 'appointments', field: 'topic' },
  'appointments.status': { section: 'appointments', field: 'status' },
  'appointments.created_at': { section: 'appointments', field: 'createdAt' },
  'appointments.answered_at': { section: 'appointments', field: 'answeredAt' },
  // Both roles are exported, so neither identifier is "the requester" the way
  // `attendee_blocks.blocker_id` is: the reader is the proposer on some rows and the invitee on
  // others. `role` on each element says which, and `counterpartAttendeeId` names the other party.
  'appointments.proposer_id': { section: 'appointments', field: 'role' },
  'appointments.invitee_id': { section: 'appointments', field: 'counterpartAttendeeId' },

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // T015, T016 (009) — questions asked and votes cast, in **two** sections (FR-764).
  //
  // Two rather than one because they are two different acts: authoring a question, and holding
  // an opinion about somebody else's. Each names its session by title, which is what makes the
  // document readable once the identifiers mean nothing to the person reading it.
  //
  // The columns NOT here are the interesting half, and both are declared with their reasoning in
  // `tests/unit/export-coverage.test.ts`: each table's `attendee_id` is the requester, and
  // `session_questions.body` is deliberately absent from the *votes* section because the question
  // a vote backs is another attendee's words.
  // ═════════════════════════════════════════════════════════════════════════════════════════
  'session_questions.id': { section: 'questionsAsked', field: 'questionId' },
  'session_questions.session_id': { section: 'questionsAsked', field: 'sessionId' },
  'session_questions.body': { section: 'questionsAsked', field: 'body' },
  'session_questions.asked_at': { section: 'questionsAsked', field: 'askedAt' },

  'question_votes.question_id': { section: 'questionVotes', field: 'questionId' },
  'question_votes.voted_at': { section: 'questionVotes', field: 'votedAt' },

  // The reported questions, alongside `message_ids` above (FR-783). Same section, same shape,
  // same absence of a foreign key.
  'abuse_reports.question_ids': { section: 'reports', field: 'questionIds' },

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // T026 (013) — **organizer assignments, and they are the ONLY thing this feature exports**
  // (FR-981).
  //
  // Of the five tables 011 adds, exactly one holds attendee data: an assignment is a fact about
  // the attendee who holds it — that they were given authority over a named conference, by
  // somebody, on a date, and possibly had it revoked. That belongs in their export exactly as
  // their registrations do.
  //
  // The other four are declared not-attendee-data in `export-coverage.test.ts`, each with its
  // reasoning. The one worth flagging here is `admin_audit_entries`: it *contains* an attendee
  // identifier and is still not the attendee's data, because it records an **operator's act**.
  // Exporting it would hand somebody a list of administrative decisions made about them,
  // attributed to named operators — which is a different document with different governance,
  // and is not what Principle VIII's portability right asks for.
  //
  // `assigned_by` is exported as the operator's **display name**, not their identifier. The
  // attendee is entitled to know who granted their authority; a UUID tells them nothing and a
  // raw operator id is an identifier for a principal they have no other way to resolve.
  // ═════════════════════════════════════════════════════════════════════════════════════════
  'organizer_assignments.id': { section: 'organizerAssignments', field: 'assignmentId' },
  'organizer_assignments.event_id': { section: 'organizerAssignments', field: 'eventId' },
  'organizer_assignments.assigned_by': { section: 'organizerAssignments', field: 'assignedBy' },
  'organizer_assignments.assigned_at': { section: 'organizerAssignments', field: 'assignedAt' },
  'organizer_assignments.revoked_at': { section: 'organizerAssignments', field: 'revokedAt' },
}
