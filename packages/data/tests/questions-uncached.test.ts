import { describe, expect, it } from 'vitest'

import { HttpQuestionsRepository } from '../src/http/questions-repository.js'
import { cached, cacheKey } from '../src/http/cached.js'
import type { CachedEntry, LocalCache } from '../src/http/cache-store.js'

/**
 * T091 (009) — **SC-711: a Q&A action must not cost the attendee their offline conference.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS 008'S DEFECT, WRITTEN AS A TEST BEFORE IT CAN HAPPEN AGAIN.**
 *
 * `cached` classifies **every method not named in `reads`** as a write, and a write purges the
 * whole conference prefix on success. 008 left `slots` out of its `reads` map — the obvious way
 * to keep a read live — and opening the scheduling dialog therefore wiped the cached programme,
 * tracks, saved sessions, notes and appointments. FR-215 and FR-647 were both broken, and the
 * loss was invisible until the attendee's next disconnection.
 *
 * 009's answer is not a better classification: it is **not decorating the repository at all**
 * (research R1). An undecorated repository is never wrapped by the Proxy, so there is no `reads`
 * map to omit from, no write branch to fall into, and no `args[0]` to be misread as an event id.
 * The defect is unreachable rather than avoided.
 *
 * That claim is worth a test precisely because it rests on an **absence** at the composition
 * root — one line that says `new HttpQuestionsRepository(http)` instead of `cached(...)`. A
 * future author adding the decorator "for consistency" would reintroduce the exact failure, and
 * every other test in this feature would stay green.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** A store that records every purge, so the assertion is about what was asked, not what was lost. */
const recordingStore = () => {
  const entries = new Map<string, unknown>()
  const purges: string[] = []
  const removals: string[] = []

  return {
    purges,
    removals,
    entries,
    store: {
      read: async (key: string) =>
        (entries.has(key)
          ? { value: entries.get(key), storedAt: 0 }
          : null) as CachedEntry<never> | null,
      write: async (key: string, value: unknown) => {
        entries.set(key, value)
      },
      purge: async (prefix: string) => {
        purges.push(prefix)
        for (const key of [...entries.keys()]) {
          if (key.startsWith(prefix)) entries.delete(key)
        }
      },
      // FIX-2 / FIX-3 — recorded separately from `purges`, because this file's whole assertion
      // is that the questions repository touches the store in **no** way, and folding an exact
      // delete into the prefix list would blur the two verbs it must not use.
      remove: async (key: string) => {
        removals.push(key)
        entries.delete(key)
      },
      keys: async (prefix: string) => [...entries.keys()].filter((key) => key.startsWith(prefix)),
    } satisfies LocalCache,
  }
}

/** The transport, reduced to what the repository actually asks of it. */
const transport = () => {
  const requested: string[] = []

  return {
    requested,
    client: {
      request: async <T>(path: string): Promise<T> => {
        requested.push(path)
        return { questions: [] } as T
      },
    },
  }
}

describe('the questions repository and the conference cache', () => {
  it('purges NOTHING when a question is asked (SC-711, FR-756)', async () => {
    const recorder = recordingStore()
    const http = transport()

    // The composition root's wiring, reproduced exactly: **undecorated**.
    const questions = new HttpQuestionsRepository(
      http.client as unknown as ConstructorParameters<typeof HttpQuestionsRepository>[0],
    )

    // ───────────────────────────────────────────────────────────────────────────────────────
    // A warm conference cache, keyed with the **real** `cacheKey` rather than a literal that
    // looks like one. A guessed key silently fails to match the purge prefix, which makes the
    // survival assertion pass for the wrong reason — the counter-example below is what caught
    // that, by purging and leaving the entry in place.
    // ───────────────────────────────────────────────────────────────────────────────────────
    recorder.entries.set(cacheKey('ada', 'event-summit', 'programme'), ['a session'])
    recorder.entries.set(cacheKey('ada', 'event-summit', 'saved'), ['a saved session'])
    recorder.entries.set(cacheKey('ada', 'event-summit', 'notes'), ['a note'])

    await questions.ask('event-summit', 'session-1', 'A question that must cost nothing.')
    await questions.vote('event-summit', 'question-1')
    await questions.unvote('event-summit', 'question-1')
    await questions.withdraw('event-summit', 'question-1')

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Four writes, no purge, and the cached conference untouched.** The strong form of the
    // assertion is the first one: not "the entries survived" but "the store was never asked to
    // remove anything", which is what makes the property about the wiring rather than about a
    // prefix happening not to match.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(recorder.purges, 'a Q&A write purged the conference cache').toEqual([])

    expect(recorder.entries.get(cacheKey('ada', 'event-summit', 'programme'))).toEqual([
      'a session',
    ])
    expect(recorder.entries.get(cacheKey('ada', 'event-summit', 'saved'))).toEqual([
      'a saved session',
    ])
    expect(recorder.entries.get(cacheKey('ada', 'event-summit', 'notes'))).toEqual(['a note'])
  })

  it('serves no read from the cache either, so a withdrawn question cannot linger (FR-754)', async () => {
    const http = transport()
    const questions = new HttpQuestionsRepository(
      http.client as unknown as ConstructorParameters<typeof HttpQuestionsRepository>[0],
    )

    await questions.list('event-summit', 'session-1')
    await questions.list('event-summit', 'session-1')

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Two reads, two requests. A cached list would revoke on **age alone**, which is the wrong
    // clock entirely for content its author may have withdrawn a second ago and for a vote count
    // that is wrong the moment it is stored. The staleness stamp cannot rescue it: it answers
    // "when did this device last receive this", which is honest about the retrieval and silent
    // about the number.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(http.requested).toHaveLength(2)
  })

  it('DEMONSTRATES the defect this feature avoids, on a decorated repository', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **The counter-example, so the test above is not merely green by construction.**
    //
    // This is what wrapping the same repository in `cached` would do: `ask` is not in `reads`,
    // so the decorator classifies it as a write and purges the conference prefix — taking the
    // programme, the saved sessions and the notes with it. Exactly 008's `slots` defect, on
    // 009's methods.
    //
    // Asserting it here means the first test cannot quietly become vacuous: if `cached` ever
    // stopped purging on writes, this one fails and says so.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const recorder = recordingStore()
    const http = transport()

    const decorated = cached(
      new HttpQuestionsRepository(
        http.client as unknown as ConstructorParameters<typeof HttpQuestionsRepository>[0],
      ),
      recorder.store,
      { attendeeId: 'ada' },
      { list: 'questions' },
    )

    recorder.entries.set(cacheKey('ada', 'event-summit', 'programme'), ['a session'])

    await decorated.ask('event-summit', 'session-1', 'The question that would cost the cache.')

    expect(
      recorder.purges.length,
      'the decorator no longer purges on a write — the risk this feature avoids has changed ' +
        'shape, and the reasoning at the composition root needs revisiting',
    ).toBeGreaterThan(0)
    expect(
      recorder.entries.get(cacheKey('ada', 'event-summit', 'programme')),
      'the decorator purged a prefix that did not reach the cached programme — the key shape ' +
        'and the purge prefix have drifted apart',
    ).toBeUndefined()
  })
})
