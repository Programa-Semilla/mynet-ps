import type {
  AbuseReportDraft,
  BlockedAttendee,
  BlockRepository,
  ReportRepository,
} from '../interfaces/safety.js'
import type { HttpClient } from './client.js'

/**
 * T025 (007) — the HTTP block and report repositories.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * Cross-event addresses, like `messages-repository.ts` and for the same reason: a block refuses
 * contact, and contact is not scoped to a conference.
 *
 * **No method takes the acting attendee's identifier** — the blocker and the reporter are the
 * signed-in attendee, decided from the cookie at the request boundary. The identifiers in these
 * paths and bodies name the target.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THERE IS NO READ OF A REPORT IN THIS FILE, AND THERE IS NO ADDRESS TO ADD ONE AT**
 * (FR-548, SC-508).
 *
 * `HttpReportRepository` has exactly one method. If you are here because a "my reports" screen
 * or an operator view needed a `GET`, that is the surface Principle III puts out of scope —
 * see the interface's header, and `apps/api/tests/unit/no-report-read-surface.test.ts`, which
 * fails the build if one is ever registered.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** The avatar shape the API embeds, before it becomes a data URL. */
interface AvatarBody {
  readonly contentType: string
  readonly base64: string
}

/** The block list, as it arrives. */
interface BlockListBody {
  readonly blocks: readonly (Omit<BlockedAttendee, 'avatar'> & {
    readonly avatar: AvatarBody | null
  })[]
}

export class HttpBlockRepository implements BlockRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async list(): Promise<BlockedAttendee[]> {
    const body = await this.#http.request<BlockListBody>('/blocks')

    return body.blocks.map((block) => ({
      ...block,
      avatar: block.avatar
        ? `data:${block.avatar.contentType};base64,${block.avatar.base64}`
        : null,
    }))
  }

  /**
   * `POST` rather than `PUT` on a per-attendee address, and the idempotency is the server's
   * (a conflicting insert is absorbed) rather than the address's.
   *
   * The block is created for the **caller**, so the address cannot name both parties without
   * naming the actor — which FR-525 forbids. `POST /blocks` with the target in the body is the
   * shape that leaves the actor implicit.
   */
  async block(attendeeId: string): Promise<void> {
    await this.#http.request<void>('/blocks', {
      method: 'POST',
      body: JSON.stringify({ attendeeId }),
    })
  }

  /**
   * Releases **only the caller's** block (FR-540). If the other attendee also blocks the
   * caller, that row is untouched and nothing here reveals that it exists.
   */
  async unblock(attendeeId: string): Promise<void> {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // `DELETE /blocks` with the target in the body, **not** `DELETE /blocks/{attendeeId}` as the
    // contract page writes it. A write route naming an attendee in its URL is forbidden outright
    // by `tests/unit/event-scope-audit.test.ts` — 004 narrowed that rule to permit *reads* and
    // kept writes closed. The route file records the deviation in full.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await this.#http.request<void>('/blocks', {
      method: 'DELETE',
      body: JSON.stringify({ attendeeId }),
    })
  }
}

export class HttpReportRepository implements ReportRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  /**
   * Resolves to `void`, and the emptiness is deliberate (contract).
   *
   * The route answers 204 with no body: no case identifier, no status, and nothing to poll —
   * because there is no route that would answer either, and inventing one in the response would
   * promise the review surface FR-548 forbids building. The dialog's confirmation says a human
   * will look at it, which is the honest position.
   *
   * **Resolves even when operator mail fails** (FR-549). The block and the record have already
   * landed by then; safety does not depend on an external service succeeding.
   */
  async submit(report: AbuseReportDraft): Promise<void> {
    await this.#http.request<void>('/reports', {
      method: 'POST',
      body: JSON.stringify({
        attendeeId: report.attendeeId,
        reason: report.reason,
        messageIds: report.messageIds,
      }),
    })
  }
}
