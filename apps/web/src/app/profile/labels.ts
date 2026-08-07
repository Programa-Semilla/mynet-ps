import type { Availability, NetworkingIntent } from '@mynet/data'

/**
 * 004 — the words behind the stored values (FR-339).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The column stores `open_to_meetings`; the attendee reads "Open to meetings". Keeping the two
 * apart is what lets the wording change without a migration, and what stops a display string
 * becoming the thing 006 filters a directory on.
 *
 * Declared as a total `Record`, so adding an option to `NETWORKING_INTENTS` without a label
 * fails to compile rather than rendering a raw enum value at somebody.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const INTENT_LABELS: Record<NetworkingIntent, string> = {
  open_to_meetings: 'Open to meetings',
  open_to_messages: 'Open to messages',
  not_networking: 'Not looking to network right now',
}

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: 'Available',
  busy: 'Busy',
}
