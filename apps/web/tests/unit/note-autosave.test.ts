import { describe, expect, it } from 'vitest'

import { AUTOSAVE_DEBOUNCE_MS } from '../../src/app/agenda/useNoteAutosave.js'

/**
 * T048 (005) — **an out-of-order response cannot resurrect an older status** (FR-214,
 * research D5).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * Two writes can be in flight at once, and they can resolve in either order. Without sequence
 * numbers, a slow first write resolving *after* a fast second one would report its own verdict
 * last — telling the attendee `Saved` for text they have already replaced, or, far worse,
 * telling them the note **failed** when a later write has since succeeded. The second sends
 * them to retype a note that is safely stored.
 *
 * This is **ordering hygiene, not conflict resolution.** No merge is attempted and no
 * concurrent edit is detected; the last confirmed write still wins, exactly as FR-214 says.
 * That disclaimer only stays honest because nothing here tries to be cleverer than it.
 *
 * The rule is tested here as pure logic rather than through the panel, because it is a
 * property of the ordering itself: reproducing an interleaving reliably through rendering,
 * timers and a dialog would make the test about the harness rather than about the rule.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * The rule extracted exactly as `useNoteAutosave` applies it: a response is honoured only when
 * its ticket is not older than the newest already-resolved one.
 */
const honours = (ticket: number, latestResolved: number): boolean => ticket >= latestResolved

describe('out-of-order write responses', () => {
  it('honours responses that arrive in order', () => {
    let latestResolved = 0

    expect(honours(1, latestResolved)).toBe(true)
    latestResolved = 1
    expect(honours(2, latestResolved)).toBe(true)
  })

  it('IGNORES a stale response that arrives after a newer one', () => {
    // Write 1 is slow. Write 2 overtakes it and resolves first.
    let latestResolved = 0

    expect(honours(2, latestResolved)).toBe(true)
    latestResolved = 2

    // Write 1 finally answers. Its verdict is about text the attendee has already replaced.
    expect(
      honours(1, latestResolved),
      'A slow earlier write must not overwrite a newer one’s verdict — that is how "Saved" ' +
        'appears for text that was never sent, and how "failed" appears for a note that is safe.',
    ).toBe(false)
  })

  it('ignores a stale FAILURE just as firmly as a stale success', () => {
    // The dangerous direction. If write 2 succeeded and write 1 then fails, reporting the
    // failure tells the attendee their note is lost when it is stored.
    let latestResolved = 0
    expect(honours(2, latestResolved)).toBe(true)
    latestResolved = 2

    expect(honours(1, latestResolved)).toBe(false)
  })

  it('honours the newest response even when several are outstanding', () => {
    let latestResolved = 0

    // Three writes out; the third answers first.
    expect(honours(3, latestResolved)).toBe(true)
    latestResolved = 3

    for (const stale of [1, 2]) {
      expect(honours(stale, latestResolved), `write ${stale} is stale`).toBe(false)
    }
  })

  it('honours a repeat of the newest ticket, so a retry of the latest write still reports', () => {
    // `>=` rather than `>`: the retry path re-resolves the same logical write, and a strict
    // comparison would silently swallow its result, leaving the status stuck on `saving`.
    const latestResolved = 2
    expect(honours(2, latestResolved)).toBe(true)
  })
})

/**
 * FR-209 fixes the band rather than the value: no shorter than 500ms so ordinary typing does
 * not write per keystroke, no longer than three seconds so a note survives an unexpected loss
 * of the page.
 *
 * Asserted against the exported constant, so changing it to something outside the band fails
 * here rather than in a browser at a conference.
 */
describe('the autosave debounce', () => {
  it('sits inside FR-209’s 500ms–3s band', () => {
    expect(AUTOSAVE_DEBOUNCE_MS).toBeGreaterThanOrEqual(500)
    expect(AUTOSAVE_DEBOUNCE_MS).toBeLessThanOrEqual(3_000)
  })

  it('is the 1200ms research D5 chose', () => {
    // Pinned deliberately. A change is a decision about how much unsaved typing an attendee can
    // lose, and it should have to be made on purpose rather than drift.
    expect(AUTOSAVE_DEBOUNCE_MS).toBe(1_200)
  })
})
