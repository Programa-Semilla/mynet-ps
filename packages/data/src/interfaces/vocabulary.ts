/**
 * T172 (014 tranche 2) — the attendee-side read of the controlled vocabulary (FR-1085, FR-1086,
 * FR-1094a, R17).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **READ-ONLY, AND ITS OWN DOMAIN — NOT A METHOD ON `ProfileRepository`.**
 *
 * Two surfaces read the same vocabulary: the profile editor's choosers, and Discover's interest
 * filter (FR-1096). Putting the read on `ProfileRepository` would make the directory reach
 * through the profile interface — putting "read the vocabulary" one autocomplete away from
 * `saveOwn`, which is the same argument that file already makes about not putting "read anyone"
 * beside "write mine" (R17). And it must not live in `administration.ts`: the attendee product
 * never imports an administrative interface (013's D2), and this read carries no authority at
 * all.
 *
 * **Only choosable values are offered here.** A retired value is withdrawn from NEW choice and
 * nothing else (FR-1094a); what the attendee already HOLDS — retained free text and retired
 * choices alike — comes from their own profile read, and the editor presents held-but-
 * unchoosable values as present and removable rather than silently dropping them (FR-1095b).
 *
 * The list is cross-event and identical for every signed-in attendee: a closed vocabulary the
 * product publishes is not population data (FR-1096's reasoning), which is what makes offering
 * the whole of it not a disclosure.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface VocabularySector {
  readonly id: string
  readonly label: string
}

export interface VocabularySubsector extends VocabularySector {
  /** The sector this refines (FR-1087). The editor filters its chooser by the selected sector. */
  readonly sectorId: string
}

export type VocabularyInterest = VocabularySector

/** Everything currently on offer, in one read — the editor needs all three lists at once. */
export interface ChoosableVocabulary {
  readonly sectors: readonly VocabularySector[]
  readonly subsectors: readonly VocabularySubsector[]
  readonly interests: readonly VocabularyInterest[]
}

export interface VocabularyRepository {
  /**
   * The choosable vocabulary. May be entirely empty apart from the four seeded sectors — the
   * client's subsector and interest lists do not exist yet (FR-1086) — and every consumer
   * renders an inviting empty state for a list with nothing in it, never an error.
   */
  choosable(): Promise<ChoosableVocabulary>
}
