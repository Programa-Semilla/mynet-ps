import { NotAuthenticatedError, OfflineError, SessionExpiredError } from '@mynet/data'
import { attendeePrefix, type LocalCache } from '@mynet/data/http'
import { describe, expect, it, vi } from 'vitest'

import { attendeeIdentity, purgingOnSignOut } from '../../src/app/services.js'

/**
 * T033/T034 (012, FR-1149) — **the scope un-resolves on an auth refusal, and sign-in clears the
 * legacy `anonymous` bytes** (deep-review finding: neither behaviour had a test anywhere).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHY THIS IS A UNIT TEST OVER EXPORTED WIRING RATHER THAN A BEHAVIOURAL TEST.**
 *
 * The defect FR-1149 names is a cross-prefix write: a session that merely expires leaves the
 * scope resolved to the previous attendee, so the next person's content lands under the first
 * person's cache prefix — where the first person's sign-out purge will never run. No online
 * test can see the scope variable, and the write that goes to the wrong prefix renders
 * identically to one that went to the right one. The classification is also the fragile part:
 * it is `instanceof` over the two transport-minted classes, and 008's error-classification
 * history is exactly a reshape of error identity passing every behavioural test.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const repositoryAnswering = (outcomes: Array<'ada' | Error>) => {
  let call = 0
  return {
    getCurrent: async () => {
      const outcome = outcomes[Math.min(call++, outcomes.length - 1)]
      if (outcome instanceof Error) throw outcome
      return { id: 'ada', displayName: 'Ada', email: 'ada@example.com' } as never
    },
  }
}

describe('the identity scope and an ended session (FR-1149)', () => {
  it.each([
    ['NotAuthenticatedError', new NotAuthenticatedError()],
    ['SessionExpiredError', new SessionExpiredError()],
  ])('un-resolves to anonymous when the server answers %s', async (_name, refusal) => {
    const identity = attendeeIdentity()
    const watched = identity.watching(repositoryAnswering(['ada', refusal]))

    await watched.getCurrent()
    expect(identity.current()).toBe('ada')

    await expect(watched.getCurrent()).rejects.toBe(refusal)
    expect(
      identity.current(),
      'an auth refusal must un-resolve the scope: left resolved, the next person signing in ' +
        "in this document has their content written under the previous attendee's prefix, " +
        "where that attendee's sign-out purge will never run (FR-1149)",
    ).toBe('anonymous')
  })

  it.each([
    ['a network failure', new OfflineError('who is signed in')],
    ['a server fault', new Error('500')],
  ])('keeps the scope resolved through %s', async (_name, failure) => {
    const identity = attendeeIdentity()
    const watched = identity.watching(repositoryAnswering(['ada', failure]))

    await watched.getCurrent()
    await expect(watched.getCurrent()).rejects.toBe(failure)
    expect(
      identity.current(),
      'a failure that proves nothing about the session must not de-scope an attendee whose ' +
        'tab merely lost signal — only the two auth refusals un-resolve',
    ).toBe('ada')
  })
})

describe('sign-in and the legacy anonymous prefix (T034)', () => {
  it('purges the anonymous prefix BEFORE delegating the sign-in', async () => {
    const calls: string[] = []
    const store = {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
      purge: vi.fn(async (prefix: string) => {
        calls.push(`purge:${prefix}`)
      }),
      remove: vi.fn(async () => undefined),
      keys: vi.fn(async () => []),
    } satisfies LocalCache

    const identity = attendeeIdentity()
    const auth = purgingOnSignOut(
      {
        signIn: async () => {
          calls.push('signIn')
          return undefined as never
        },
        signOut: async () => undefined,
      },
      store,
      identity,
    )

    await auth.signIn({ email: 'b@example.com', password: 'pw' } as never)

    expect(calls).toEqual([`purge:${attendeePrefix('anonymous')}`, 'signIn'])
  })
})
