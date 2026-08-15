import type {
  AdminInterestOption,
  AdminSector,
  AdminSubsector,
  AdminVocabularyRepository,
  VocabularyValueInput,
} from '../interfaces/administration.js'
import type { HttpClient } from './client.js'

/**
 * T172 (014 tranche 2) — the HTTP vocabulary-authoring repository.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **NO PATH HERE NAMES A CONFERENCE, AND THAT ABSENCE IS THE OPPOSITE DECISION TO
 * `admin-catalog-repository.ts`'s — TAKEN FOR THE SAME REASON.** The catalog names its
 * conference in every path because authority over one is the operand the server checks; the
 * vocabulary is product-wide reference data no conference owns (FR-1085), so its paths carry no
 * operand at all and the server's predicate is the platform tier itself (FR-1089, R20). A
 * conference organizer calling any of these receives the 404 a nonexistent route gives.
 *
 * Undecorated, like every administrative repository, and the refusals pass through unclassified:
 * classification happens once, on `error.code`, in `apps/admin/src/app/errors.ts` — each
 * vocabulary refusal carries its own code precisely so that switch can tell them apart.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export class HttpAdminVocabularyRepository implements AdminVocabularyRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async sectors(): Promise<readonly AdminSector[]> {
    return this.#http.request<readonly AdminSector[]>('/admin/vocabulary/sectors')
  }

  async subsectors(): Promise<readonly AdminSubsector[]> {
    return this.#http.request<readonly AdminSubsector[]>('/admin/vocabulary/subsectors')
  }

  async interests(): Promise<readonly AdminInterestOption[]> {
    return this.#http.request<readonly AdminInterestOption[]>('/admin/vocabulary/interests')
  }

  async createSector(input: VocabularyValueInput): Promise<void> {
    await this.#write('/admin/vocabulary/sectors', 'POST', input)
  }

  async renameSector(id: string, input: VocabularyValueInput): Promise<void> {
    await this.#write(`/admin/vocabulary/sectors/${encodeURIComponent(id)}`, 'PATCH', input)
  }

  async retireSector(id: string): Promise<void> {
    await this.#write(`/admin/vocabulary/sectors/${encodeURIComponent(id)}/retirement`, 'POST')
  }

  async unretireSector(id: string): Promise<void> {
    await this.#write(`/admin/vocabulary/sectors/${encodeURIComponent(id)}/retirement`, 'DELETE')
  }

  async deleteSector(id: string): Promise<void> {
    await this.#write(`/admin/vocabulary/sectors/${encodeURIComponent(id)}`, 'DELETE')
  }

  async createSubsector(input: VocabularyValueInput & { sectorId: string }): Promise<void> {
    await this.#write('/admin/vocabulary/subsectors', 'POST', input)
  }

  async renameSubsector(id: string, input: VocabularyValueInput): Promise<void> {
    await this.#write(`/admin/vocabulary/subsectors/${encodeURIComponent(id)}`, 'PATCH', input)
  }

  async retireSubsector(id: string): Promise<void> {
    await this.#write(`/admin/vocabulary/subsectors/${encodeURIComponent(id)}/retirement`, 'POST')
  }

  async unretireSubsector(id: string): Promise<void> {
    await this.#write(`/admin/vocabulary/subsectors/${encodeURIComponent(id)}/retirement`, 'DELETE')
  }

  async deleteSubsector(id: string): Promise<void> {
    await this.#write(`/admin/vocabulary/subsectors/${encodeURIComponent(id)}`, 'DELETE')
  }

  async createInterest(input: VocabularyValueInput): Promise<void> {
    await this.#write('/admin/vocabulary/interests', 'POST', input)
  }

  async renameInterest(id: string, input: VocabularyValueInput): Promise<void> {
    await this.#write(`/admin/vocabulary/interests/${encodeURIComponent(id)}`, 'PATCH', input)
  }

  async retireInterest(id: string): Promise<void> {
    await this.#write(`/admin/vocabulary/interests/${encodeURIComponent(id)}/retirement`, 'POST')
  }

  async unretireInterest(id: string): Promise<void> {
    await this.#write(`/admin/vocabulary/interests/${encodeURIComponent(id)}/retirement`, 'DELETE')
  }

  async deleteInterest(id: string): Promise<void> {
    await this.#write(`/admin/vocabulary/interests/${encodeURIComponent(id)}`, 'DELETE')
  }

  /** One write path, so every refusal takes the same route out — the catalog's pattern. */
  async #write(path: string, method: string, body?: unknown): Promise<void> {
    await this.#http.request<unknown>(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  }
}
