import { asc, isNull } from 'drizzle-orm'

import { getDb } from '../client.js'
import { interestOptions, sectors, subsectors } from '../schema/vocabulary.js'

/**
 * T172 (014 tranche 2) — **the attendee-side read of the choosable vocabulary** (FR-1085,
 * FR-1086, FR-1094a, R18).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **ONLY UNRETIRED VALUES ARE CHOOSABLE, AND THIS READ IS THE ONLY PLACE THAT FILTER LIVES.**
 *
 * Retiring a value withdraws it from *future* choice and does nothing else (FR-1094): every
 * read of what an attendee already HOLDS — their profile, their card, the directory, the
 * ranking — must keep presenting a retired value its holder still has, so none of them consults
 * retirement at all (`no-draft-state.test.ts` asserts that over the query layer, naming this
 * module as one of the three permitted to read the stamp). Held values come from the attendee's
 * own profile read, never from here.
 *
 * **No scope parameter, deliberately** (R18's rejected alternative): the vocabulary is
 * cross-event reference data describing the person rather than their presence at one conference
 * (FR-1085), so an event-scoped read would make the option list a function of the conference —
 * and it names no attendee, so there is no identity to scope by. It answers identically for
 * every signed-in attendee, which is what makes offering the whole list not a disclosure
 * (FR-1096's reasoning: a closed vocabulary the product publishes is not population data).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface ChoosableVocabulary {
  readonly sectors: readonly { readonly id: string; readonly label: string }[]
  readonly subsectors: readonly {
    readonly id: string
    readonly sectorId: string
    readonly label: string
  }[]
  readonly interests: readonly { readonly id: string; readonly label: string }[]
}

/**
 * Everything currently on offer, in creation order — the schema's stated rule, so the chooser
 * does not shuffle between reads and the product imposes no ordering of its own.
 *
 * A subsector of a retired sector stays listed while itself unretired: the client filters the
 * chooser by the *selected* sector, and an attendee keeping a held (retired) sector may still
 * refine it with a live subsector (FR-1095b's union, from the choosing side).
 */
export const readChoosableVocabulary = async (): Promise<ChoosableVocabulary> => {
  const db = getDb()

  const [sectorRows, subsectorRows, interestRows] = await Promise.all([
    db
      .select({ id: sectors.id, label: sectors.label })
      .from(sectors)
      .where(isNull(sectors.retiredAt))
      .orderBy(asc(sectors.createdAt), asc(sectors.id)),
    db
      .select({ id: subsectors.id, sectorId: subsectors.sectorId, label: subsectors.label })
      .from(subsectors)
      .where(isNull(subsectors.retiredAt))
      .orderBy(asc(subsectors.createdAt), asc(subsectors.id)),
    db
      .select({ id: interestOptions.id, label: interestOptions.label })
      .from(interestOptions)
      .where(isNull(interestOptions.retiredAt))
      .orderBy(asc(interestOptions.createdAt), asc(interestOptions.id)),
  ])

  return { sectors: sectorRows, subsectors: subsectorRows, interests: interestRows }
}
