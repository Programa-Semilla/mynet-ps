import type {
  AdminConference,
  AdminConferenceRepository,
  AdminIdentity,
  AdminReportDetail,
  AdminReportRepository,
  AdminReportSummary,
  AdminSessionRepository,
} from '../interfaces/administration.js'
import type { HttpClient } from './client.js'

/**
 * T065, T091, T108, T126 (013) — the HTTP administrative repositories.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THREE REPOSITORIES, ONE `HttpClient`, AND NONE OF THEM IS DECORATED.**
 *
 * `cached` is not applied to any of these, and that is the whole offline story for this product.
 * 008's defect is the reason it is an absence rather than a configuration: the decorator treats
 * every method not named in `reads` as a **write**, and a write purges the entire conference
 * prefix — so omitting a method looked right while silently wiping cached state. 009's answer was
 * not to decorate at all, which removes the mechanism instead of configuring it: there is no
 * `reads` map to omit from and no `args[0]` to misread.
 *
 * It is also correct on its own terms. An operator acting on stale state resolves a report twice,
 * promotes somebody who has withdrawn, or removes a question that is already gone — a different
 * class of error from an attendee reading a stale agenda, and one the person cannot detect.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Every path here is administrative and names no conference**, with one exception — promotion
 * and demotion name the conference they act on. See `routes/admin/index.ts` for why that one path
 * is where two route audits disagree.
 */

export class HttpAdminSessionRepository implements AdminSessionRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async signIn(credentials: { email: string; password: string }): Promise<void> {
    // 204 with no body: the token is in a host-only cookie and never in a response (FR-911), and
    // the tier is deliberately not returned here — `me()` answers that with a session in hand.
    await this.#http.request<void>('/admin/session', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })
  }

  async signOut(): Promise<void> {
    await this.#http.request<void>('/admin/session', { method: 'DELETE' })
  }

  async me(): Promise<AdminIdentity> {
    return this.#http.request<AdminIdentity>('/admin/me')
  }

  async replaceCredential(input: { currentPassword: string; newPassword: string }): Promise<void> {
    await this.#http.request<void>('/admin/session/credential', {
      method: 'PUT',
      body: JSON.stringify(input),
    })
  }
}

export class HttpAdminReportRepository implements AdminReportRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async list(): Promise<readonly AdminReportSummary[]> {
    return this.#http.request<AdminReportSummary[]>('/admin/reports')
  }

  async detail(reportId: string): Promise<AdminReportDetail> {
    // **This read writes an audit entry server-side** (FR-995) — the only read in the product
    // that does, because it is the only one the constitution needed an exception to permit. The
    // client cannot see that and must not try to: it is not a header, not a field, and not
    // something the interface exposes.
    return this.#http.request<AdminReportDetail>(`/admin/reports/${reportId}`)
  }

  async resolve(
    reportId: string,
    resolution: { outcome: 'actioned' | 'dismissed'; note: string },
  ): Promise<void> {
    await this.#http.request<void>(`/admin/reports/${reportId}/resolution`, {
      method: 'POST',
      body: JSON.stringify(resolution),
    })
  }

  async removeQuestion(input: { reportId: string; questionId: string }): Promise<void> {
    // The report travels as a query parameter because the server checks that it **names this
    // question** (FR-953). Without it, `reportId` would be decoration and any question in the
    // product could be removed by anybody holding a report identifier — which every operator has.
    await this.#http.request<void>(
      `/admin/questions/${input.questionId}?reportId=${encodeURIComponent(input.reportId)}`,
      { method: 'DELETE' },
    )
  }
}

export class HttpAdminConferenceRepository implements AdminConferenceRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async list(): Promise<readonly AdminConference[]> {
    return this.#http.request<AdminConference[]>('/admin/conferences')
  }

  async promote(input: { eventId: string; attendeeId: string }): Promise<void> {
    await this.#http.request<void>(`/admin/conferences/${input.eventId}/organizers`, {
      method: 'POST',
      body: JSON.stringify({ attendeeId: input.attendeeId }),
    })
  }

  async demote(input: { eventId: string; attendeeId: string }): Promise<void> {
    await this.#http.request<void>(
      `/admin/conferences/${input.eventId}/organizers/${input.attendeeId}`,
      { method: 'DELETE' },
    )
  }

  async deactivateOperator(operatorId: string): Promise<void> {
    await this.#http.request<void>(`/admin/operators/${operatorId}/deactivation`, {
      method: 'POST',
    })
  }
}
