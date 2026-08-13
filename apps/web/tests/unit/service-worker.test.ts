import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Deep review — **the service worker had no test at any layer** (FR-051, FR-553, FR-554).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE FILE THIS COVERS IS THE ONE THE FEATURE CALLS ITS HIGHEST-RISK STEP, AND NOTHING
 * FAILED IF ANY OF IT WAS DELETED.**
 *
 * `src/sw.ts` carries the whole of FR-554 — activating a notification opens the application on
 * that conversation — plus the malformed-payload fallback, the per-conversation replacement tag,
 * and **the navigation denylist**. Its own header calls the denylist "the highest-risk mechanical
 * step in the feature" and CLAUDE.md singles it out as "the API denylist most of all": without it
 * the HTML shell is served in answer to API requests, so a failed request looks like a successful
 * page load and the client parses HTML as JSON.
 *
 * None of that was asserted anywhere. `injectManifest` fails the build only on a missing
 * `__WB_MANIFEST` reference; every other line could be removed and the ten gates stayed green.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **WHY THIS IS A SOURCE-LEVEL GUARD RATHER THAN A BEHAVIOURAL TEST.**
 *
 * The worker is a `lib="webworker"` module compiled by its own `tsconfig.sw.json`, precisely
 * because its globals must not merge into the application's. Importing it here would drag those
 * globals back into the jsdom program — reintroducing the exact problem that separate tsconfig
 * exists to solve — and stubbing `self`, `clients`, `registration` and `ExtendableEvent` well
 * enough to execute it would be testing the stub.
 *
 * So this is the same "fail by existence" technique the feature's other absence guards use, aimed
 * at the handful of lines whose removal is silent and expensive. It cannot prove the handlers
 * behave correctly; it can make their disappearance fail the build. The behaviour is verified by
 * hand through DevTools' push simulator — `quickstart.md` scenario 5, steps 8 to 11.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const WORKER = readFileSync(join(import.meta.dirname, '../../src/sw.ts'), 'utf8')

/** Comments stripped, so a rule that survives only in prose fails. */
const code = WORKER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the service worker keeps what the generated one did (FR-051)', () => {
  it('finds the worker — a gate that cannot fail is not a gate', () => {
    expect(WORKER.length).toBeGreaterThan(1_000)
    expect(code).toContain('addEventListener')
  })

  it('EXCLUDES /api/ from the navigation fallback — the one that costs most if dropped', () => {
    // Without this, a navigation request to `/api/anything` is answered with `index.html`. The
    // request succeeds, the client parses an HTML document as JSON, and an outage is reported as
    // whatever that parse happens to produce. It is invisible in development, where the dev
    // server registers no worker at all.
    expect(
      /denylist:\s*\[\s*\/\^\\\/api\\\/\//.test(code),
      'The navigation fallback must exclude /api/. See the header: without it the HTML shell is ' +
        'served in answer to API requests and a failed request looks like a successful load.',
    ).toBe(true)
  })

  it('still precaches the shell and evicts what a previous deployment left (FR-055)', () => {
    expect(code).toContain('precacheAndRoute')
    expect(code).toContain('self.__WB_MANIFEST')
    expect(code).toContain('cleanupOutdatedCaches')
  })

  it('falls back to the shell for in-scope navigations, so a deep link opens offline', () => {
    expect(code).toContain('NavigationRoute')
    expect(code).toContain("createHandlerBoundToURL('index.html')")
  })

  it('claims clients WITHOUT skipping waiting — the pair 001 chose, unchanged', () => {
    // Claim, so the offline shell works from a first-time visitor's first visit. No skip-waiting,
    // so a new deployment does not swap assets under a page somebody is reading.
    expect(code).toContain('clientsClaim()')
    expect(code, 'skipWaiting would swap assets under a live page').not.toContain('skipWaiting')
  })

  it('shows a notification even when the payload cannot be parsed (FR-553)', () => {
    // `userVisibleOnly` was promised at subscribe time. A worker that receives a push and shows
    // nothing gets the browser's own "site updated in the background" notice substituted after a
    // few occurrences — worse than either outcome intended.
    expect(code).toContain("self.addEventListener('push'")
    expect(code).toContain('showNotification')
    expect(code).toContain("'New message'")
    expect(code).toContain('waitUntil')
  })

  it('opens the application ON the conversation, focusing an existing window (FR-554)', () => {
    expect(code).toContain("self.addEventListener('notificationclick'")
    // 014 — the identifier moved into `data`, which now carries two shapes. The address is still
    // built here from an identifier rather than sent as a URL: the client owns its own addressing
    // scheme, and a server emitting `/messages/<id>` would be a second place it is decided.
    expect(code).toContain('/messages/${data.conversationId}')
    // Focus-and-navigate before openWindow: tapping a notification with the app already open
    // must not produce a second copy of it.
    expect(code).toContain('client.focus()')
    expect(code).toContain('client.navigate(target)')
    expect(code).toContain('openWindow(target)')
    expect(code.indexOf('client.focus()')).toBeLessThan(code.indexOf('openWindow(target)'))
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T073 (014) — A COALESCED NOTIFICATION OPENS AGENDA, NEVER A LIST OF CHANGES** (FR-1034b).
   *
   * The obvious destination for "4 of your saved sessions changed" is a screen listing the four.
   * **That screen is the surface FR-1031 forbids** — an in-app aggregate over things that
   * happened, which is the notification centre v3.1.0's exclusion exists to prevent. So the count
   * lives in the notification body, which is a single interruption, and activating it lands on
   * Agenda where the changed rows carry their individual markers.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('opens the SESSION for one change and AGENDA for several (FR-1029, FR-1034b)', () => {
    expect(code).toContain('/agenda/${data.sessionId}')
    expect(code).toContain("'/agenda'")

    // And no address that could be a list of changes. A route named for them would be the
    // notification centre arriving through the service worker.
    for (const forbidden of ['/changes', '/updates', '/activity', '/notifications']) {
      expect(
        code,
        `The service worker can open ${forbidden}. Activating a coalesced notification must land ` +
          'on Agenda, where the changed rows carry their own markers — never on a list of ' +
          'changes, which is the surface FR-1031 forbids (FR-1034b).',
      ).not.toContain(forbidden)
    }
  })

  it('caches no API response — 007 caches nothing at all (FR-563)', () => {
    // A `runtimeCaching` equivalent here would be a cache of message content, which FR-563
    // forbids outright. Adding one needs a recorded decision about staleness first.
    for (const forbidden of ['NetworkFirst', 'StaleWhileRevalidate', 'CacheFirst', 'caches.open']) {
      expect(
        code,
        `${forbidden} would cache a response this feature refuses to cache`,
      ).not.toContain(forbidden)
    }
  })
})
