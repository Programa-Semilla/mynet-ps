import type { QuestionListItem, QuestionsRepository } from '../interfaces/questions.js'
import type { HttpClient } from './client.js'

/**
 * T029 (009) — the HTTP questions repository.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The conference identifier goes in the path, where the server's access guard reads it — on
 * **every** method, including the three whose question could be found without one. That mirrors
 * the routes, and the routes name it because `event-scope-audit` examines a route only if it does
 * (research R12). A reader who "tidies" one of these paths here would only break the request; the
 * damage of tidying it on the server is silent, which is why both sides say so.
 *
 * A refusal — not registered, no such conference, a question in another one, or none at all —
 * arrives as the same `ApiError` in every case, and this class deliberately does nothing to tell
 * them apart: they are indistinguishable on the wire by design (FR-743), and a client that
 * appeared to know which had happened would be inventing information it does not have.
 *
 * **The two refusals that DO explain themselves are distinguished by `code`, never by class**
 * (FR-745) — and not here. `ApiError extends RequestRefusedError`, so an `instanceof` check
 * catches 400, 404, 429 and 500 alike; classification belongs to the caller reading `error.code`,
 * which is what `useSessionQuestions` does and what 008 got wrong.
 *
 * **No method takes an attendee identifier.** Identity travels as the HttpOnly sign-in cookie
 * `HttpClient` attaches to every request, so there is nothing here to get wrong.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** Encoded once, so no call site can forget and no identifier can escape into the path. */
const eventPath = (eventId: string, rest: string): string =>
  `/events/${encodeURIComponent(eventId)}${rest}`

export class HttpQuestionsRepository implements QuestionsRepository {
  readonly #http: HttpClient

  constructor(http: HttpClient) {
    this.#http = http
  }

  async list(eventId: string, sessionId: string): Promise<QuestionListItem[]> {
    return this.#questions(
      eventPath(eventId, `/sessions/${encodeURIComponent(sessionId)}/questions`),
    )
  }

  async ask(eventId: string, sessionId: string, body: string): Promise<QuestionListItem[]> {
    return this.#questions(
      eventPath(eventId, `/sessions/${encodeURIComponent(sessionId)}/questions`),
      { method: 'POST', body: JSON.stringify({ body }) },
    )
  }

  async withdraw(eventId: string, questionId: string): Promise<QuestionListItem[]> {
    return this.#questions(eventPath(eventId, `/questions/${encodeURIComponent(questionId)}`), {
      method: 'DELETE',
    })
  }

  async vote(eventId: string, questionId: string): Promise<QuestionListItem[]> {
    return this.#questions(
      eventPath(eventId, `/questions/${encodeURIComponent(questionId)}/vote`),
      { method: 'POST' },
    )
  }

  async unvote(eventId: string, questionId: string): Promise<QuestionListItem[]> {
    return this.#questions(
      eventPath(eventId, `/questions/${encodeURIComponent(questionId)}/vote`),
      { method: 'DELETE' },
    )
  }

  /**
   * Every method here answers the same shape, so it is unwrapped in one place.
   *
   * The route answers `{ questions: [...] }` rather than a bare array, so the response has
   * somewhere to grow without becoming a breaking change — 005's reasoning for `{ sessionIds }`,
   * unchanged. The interface promises the list.
   *
   * **Reads and writes share this method because they share a return type**, which is research
   * R5's decision made visible: a write here is a read with a side effect, and the list it
   * answers with is the one the reader is about to render.
   */
  async #questions(path: string, init?: RequestInit): Promise<QuestionListItem[]> {
    const body = await this.#http.request<{ questions: QuestionListItem[] }>(path, init)
    return body.questions
  }
}
