import type { ConferenceFormat, ConferenceModality } from '@mynet/data'

/**
 * The two closed sets a conference's event type is chosen from, and their one set of labels —
 * shared by `CreateConferenceDialog` and `ConferenceEditor` (FR-1046, FR-1047).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **ONE MODULE, BECAUSE THERE WERE TWO COPIES AND THEY HAD ALREADY DIVERGED.** The editor and
 * the create dialog each spelled these options inline, and the hybrid label drifted between
 * them within the tranche that wrote both. Worse, the create dialog's copy had no type
 * relationship to the contract at all, so a seventh format added server-side would have
 * appeared in the editor and been silently unofferable at creation — the spec's own edge case
 * ("The client later renames a format, or asks for a seventh"), failed by duplication.
 *
 * The arrays catch a value REMOVED server-side (the annotation refuses an element outside the
 * union); the `Record`s catch a value ADDED server-side (a missing key fails the typecheck).
 * Both halves are needed, and both derive from `ConferenceModality`/`ConferenceFormat`, which
 * derive from the generated contract, which the server's constants generate.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const MODALITIES: readonly ConferenceModality[] = ['in-person', 'virtual', 'hybrid']

export const FORMATS: readonly ConferenceFormat[] = [
  'seminar',
  'hackathon',
  'workshop',
  'congress',
  'networking-breakfast',
  'corporate-event',
]

export const MODALITY_LABELS: Record<ConferenceModality, string> = {
  'in-person': 'In person — sessions carry a room',
  virtual: 'Virtual — sessions carry a joining link',
  hybrid: 'Hybrid — sessions carry a room, a link, or both',
}

export const FORMAT_LABELS: Record<ConferenceFormat, string> = {
  seminar: 'Seminar',
  hackathon: 'Hackathon',
  workshop: 'Workshop',
  congress: 'Congress',
  'networking-breakfast': 'Networking breakfast',
  'corporate-event': 'Corporate event',
}
