import type { ChoosableVocabulary, VocabularyRepository } from '../interfaces/vocabulary.js'
import type { HttpClient } from './client.js'

/**
 * T172 (014 tranche 2) — the attendee-side HTTP read of the choosable vocabulary.
 *
 * One address, deliberately NOT under `/events/…` (R18): the vocabulary is cross-event
 * reference data, so an event-scoped path would make the option list a function of the
 * conference — which FR-1096 forbids for the filter this list also feeds. Only unretired
 * values arrive; held values come from the attendee's own reads (FR-1095b).
 */
export class HttpVocabularyRepository implements VocabularyRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async choosable(): Promise<ChoosableVocabulary> {
    return this.#http.request<ChoosableVocabulary>('/vocabulary')
  }
}
