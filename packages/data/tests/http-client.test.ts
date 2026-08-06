import { describe, expect, it, vi } from 'vitest'

import { HttpClient } from '../src/http/client.js'
import {
  NotAuthenticatedError,
  OfflineError,
  SessionExpiredError,
} from '../src/interfaces/index.js'

/**
 * Regression cover for the one transport boundary the whole client goes through.
 *
 * The `content-type` case below is not hypothetical. It shipped: every request declared a JSON
 * body, so bodyless `POST /auth/sign-out` was refused by the server while the client cleared
 * its cookie and reported success. The session stayed valid — an FR-027 failure that
 * `fastify.inject()` cannot reproduce, because it does not send the header combination a
 * browser sends.
 */

const respond = (status: number, body: unknown = {}) =>
  new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const clientWith = (fetch: typeof globalThis.fetch, isOnline = () => true) =>
  new HttpClient({ baseUrl: 'https://api.test', isOnline, fetch })

/**
 * A `fetch` that records what it was handed. Recording into a closure rather than reading
 * `mock.calls` keeps the assertions typed without casting the tuple.
 */
const recordingFetch = (respondWith: () => Response) => {
  // Explicitly `| undefined` rather than optional: `exactOptionalPropertyTypes` distinguishes
  // "absent" from "present and undefined", and the recorder assigns the latter.
  const seen: { init: RequestInit | undefined } = { init: undefined }
  const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    seen.init = init
    return Promise.resolve(respondWith())
  }) as unknown as typeof globalThis.fetch

  return {
    fetch,
    calls: () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    headers: () => (seen.init?.headers ?? {}) as Record<string, string>,
    credentials: () => seen.init?.credentials,
  }
}

describe('HttpClient', () => {
  it('does not declare a JSON content type on a request with no body', async () => {
    const recorder = recordingFetch(() => respond(204))
    await clientWith(recorder.fetch).request('/auth/sign-out', { method: 'POST' })

    expect(recorder.headers()).not.toHaveProperty('content-type')
  })

  it('declares a JSON content type when it does send a body', async () => {
    const recorder = recordingFetch(() => respond(204))
    await clientWith(recorder.fetch).request('/auth/sign-in', {
      method: 'POST',
      body: JSON.stringify({ email: 'ada@example.com', password: 'secret' }),
    })

    expect(recorder.headers()['content-type']).toBe('application/json')
  })

  it('sends credentials, so the sign-in session cookie travels with every request', async () => {
    const recorder = recordingFetch(() => respond(200, {}))
    await clientWith(recorder.fetch).request('/auth/me')

    expect(recorder.credentials()).toBe('include')
  })

  it('refuses before attempting when offline, rather than queueing (FR-053)', async () => {
    const recorder = recordingFetch(() => respond(200))
    const client = clientWith(recorder.fetch, () => false)

    await expect(client.request('/events')).rejects.toBeInstanceOf(OfflineError)
    // Never queued silently, never shown as succeeded — and never even sent.
    expect(recorder.calls()).toBe(0)
  })

  it('tells an expired session from never having signed in (FR-028c)', async () => {
    const expired = recordingFetch(() => respond(401, { code: 'session_expired' }))
    await expect(clientWith(expired.fetch).request('/auth/me')).rejects.toBeInstanceOf(
      SessionExpiredError,
    )

    const anonymous = recordingFetch(() => respond(401, { code: 'not_authenticated' }))
    await expect(clientWith(anonymous.fetch).request('/auth/me')).rejects.toBeInstanceOf(
      NotAuthenticatedError,
    )
  })

  it('reports a refusal with an unreadable body as a failure, not an empty success (FR-058)', async () => {
    const recorder = recordingFetch(
      () => new Response('<html>gateway timeout</html>', { status: 504 }),
    )

    await expect(clientWith(recorder.fetch).request('/events')).rejects.toThrow()
  })
})
