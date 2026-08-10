/**
 * The schema registry. **Append-only** — a feature adds its module here and writes its own
 * file, rather than editing another feature's (constitution: extension points are append-only
 * registries).
 *
 * The six tables of the production foundation slice, plus what 002 adds (data-model.md).
 * Remaining content entities — attendee profiles beyond identity, conversations, appointments
 * — belong to the features that own them and are **not** created here (FR-039).
 *
 * **Every table declares which scoping rule applies to it and why, in its own file.** The
 * constitution makes neither per-event nor cross-event a default that may be assumed.
 */
export * from './attendees.js'
export * from './auth-sessions.js'
export * from './events.js'
export * from './sign-in-attempts.js'

// 002 — event context. `active_event_selections` is cross-event; see the file for why.
export * from './active-event.js'

// 002 — the session catalog. Every table in it is per-event; see the file for why.
export * from './catalog.js'

// 005 — the attendee's own agenda: saved sessions and personal notes. Both per-event, and both
// state why in the file. Attendee state *about* conference content, never conference content —
// which is why they are not in `catalog.js` and why the catalog gains no write path (FR-191).
export * from './agenda.js'

// 004 — the attendee's own description of themselves. Both tables cross-event, and the file
// states why, along with the recorded consequence that they are cross-event rows *read* through
// a per-event condition (FR-357, research D5).
export * from './profiles.js'

// 004 — verification and password-reset material. Cross-event: properties of the account.
// Two tables of identical shape, deliberately not one with a discriminator — see the file.
export * from './identity-tokens.js'

// 004 — the development/test/preview backing store for `StorageService`. Not a domain table:
// only `storage/db-adapter.ts` touches it, and it deliberately holds no foreign key, which is
// the single case FR-370's structural guard exists to catch (research D3, D10).
export * from './stored-objects.js'

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 007 — Messages, and the notification delivery platform it needs. Seven tables, and **every
// one of them is cross-event** — the first feature where that is true of the whole set.
//
// They are also the first tables in this product that `EventScope` cannot reach. Conversations
// have no event to scope by (FR-507), so the predicate is *participation* instead:
// `plugins/participation.ts` mirrors `plugins/event-access.ts` in shape, and
// `tests/unit/participation-audit.test.ts` is its audit. The event audit does not cover these
// routes and would silently appear to — research R9 is why the second one exists.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The exchange, its pair constraint, and the participation that is this feature's whole
// authorization predicate. `conversation_pairs` is a table rather than a column so that a
// departed attendee's identifier is not retained by the thing enforcing uniqueness (R10).
export * from './conversations.js'

// What was said. `author_id`'s cascade is the entirety of M3 — see the file.
export * from './messages.js'

// The refusal of contact that makes open send shippable. Directional, deliberately unlike
// `conversation_pairs`, and the file states why collapsing the two directions would be a bug.
export * from './blocks.js'

// Written, mailed, and read by nothing in this product (FR-548).
export * from './reports.js'

// Where a device can be reached. Two of its columns are credentials rather than content, and
// the export redacts them to a presence (research R14).
export * from './push-subscriptions.js'

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 008 — Network: contacts, exchanged cards, and appointments. **Three tables, and they do NOT
// share a scoping rule** — which is the first time that has been true of one feature's set, and
// is why the two files say which they are separately rather than under a shared header.
//
// `shared_cards` is **cross-event**: standing decision 7 names exchanged cards among the
// relationships that persist, and constitution v3.2.0 (N1) makes holding a card the definition
// of a contact. `appointments` and `meeting_slots` are **per-event**: an appointment is a time
// and a place at a specific conference.
//
// That split decides the guards, and it is the opposite of what 007 predicted. Cards name no
// conference, so `event-scope-audit` walks past them and reports success — they get a third
// branded scope (`plugins/card-access.ts`) and a third audit (`tests/unit/card-audit.test.ts`).
// Appointments name their event, so the audit that already exists covers them unchanged
// (research R1, R2).
// ═══════════════════════════════════════════════════════════════════════════════════════════

// The exchange rather than the person: sharer, recipient, where they met, and when. Directional
// and deliberately unnormalised — the file states why copying `conversation_pairs`' ordered pair
// would make a reciprocal exchange impossible.
export * from './cards.js'

// The meeting and the seeded grid of times it can claim. `lapsed` is derived from the slot
// instant and stored nowhere, which is what keeps this feature free of any background job.
export * from './appointments.js'

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 009 — Session Q&A: audience questions and the upvotes that rank them. **Two tables, and both
// are per-event** — the file says so in its header and again per table, because the constitution
// makes neither rule a default.
//
// Unlike 007 and 008 this feature adds **no branded scope and no route audit**: a question always
// belongs to a session and a session to exactly one event, so `EventScope` already reaches it —
// *provided every address names its conference*, which is why `/events/:eventId/questions/:id`
// carries an event it does not strictly need to find the row. Tidying that away would make the
// **existing** audit walk past these routes reporting success (research R12).
//
// It also adds one column to a neighbour's table — `abuse_reports.question_ids` in `reports.ts` —
// because a question must be reportable from the question itself (FR-781, FR-783).
// ═══════════════════════════════════════════════════════════════════════════════════════════
export * from './questions.js'
