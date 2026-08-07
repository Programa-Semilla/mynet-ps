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
