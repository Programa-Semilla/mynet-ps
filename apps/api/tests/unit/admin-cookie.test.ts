import { describe, expect, it } from 'vitest'

import {
  adminSessionCookieOptions,
  ADMIN_SESSION_COOKIE,
  clearedAdminSessionCookieOptions,
} from '../../src/admin/cookie.js'
import { SESSION_COOKIE, sessionCookieOptions } from '../../src/auth/cookie.js'

/**
 * T039 (011) — **the administrative cookie is host-only, and the absence of `Domain` is the
 * requirement** (FR-911, FR-912, FR-913, decision 37).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS ASSERTS AN ABSENCE, WHICH IS WHY IT NEEDS A TEST AT ALL.**
 *
 * A cookie with no `Domain` attribute is host-only: the browser sends it to `admin.example.com`
 * and nowhere else. Setting `Domain=example.com` would make one cookie travel to **both**
 * products, and one person signed into both would hold **one** session — signing out of MyNet
 * would sign them out of administration, and the administrative session token would be attached
 * to every attendee request.
 *
 * Nothing in `cookie.ts` expresses that: it is met by a property that is not there. So the
 * failure mode is somebody adding `domain` while debugging a cookie they could not get to send,
 * which would look like a fix and would silently collapse the independence decision 37 is about.
 * That is exactly the shape of change this file exists to fail.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the administrative session cookie is host-only (FR-912)', () => {
  it('sets no Domain attribute', () => {
    const options = adminSessionCookieOptions(60_000)

    expect(
      'domain' in options,
      'The administrative session cookie declares a `Domain`. That makes it travel to the ' +
        'apex host and every other subdomain, so one person signed into both products holds ' +
        'ONE session — and the administrative token is attached to every attendee request. ' +
        'Host-only scoping is what makes the two sessions independent (decision 37, FR-912).',
    ).toBe(false)
    expect(options.domain).toBeUndefined()
  })

  it('sets no Domain attribute when clearing either', () => {
    // A cleared cookie whose attributes differ from the set ones is a DIFFERENT cookie, so the
    // browser keeps the original alongside it and sign-out leaves the session in place. That
    // failure is invisible in a test that only checks the set options.
    const cleared = clearedAdminSessionCookieOptions()
    expect('domain' in cleared).toBe(false)
    expect(cleared.domain).toBeUndefined()
  })

  it('clears with attributes matching the set options in everything but lifetime', () => {
    const set = adminSessionCookieOptions(60_000)
    const cleared = clearedAdminSessionCookieOptions()

    expect(cleared.httpOnly).toBe(set.httpOnly)
    expect(cleared.secure).toBe(set.secure)
    expect(cleared.sameSite).toBe(set.sameSite)
    expect(cleared.path).toBe(set.path)
    expect(cleared.maxAge).toBe(0)
  })

  /**
   * **`SameSite=Lax` is preserved on both origins, and that is not in tension with host-only.**
   *
   * The two attributes answer different questions and it is possible to have both: `SameSite` is
   * evaluated against the **registrable domain**, so a request from `admin.example.com` to
   * `admin.example.com` is same-site and the cookie is sent at all; `Domain`'s absence decides
   * *which hosts* it is sent to. Decision 19's CSRF defence therefore survives untouched, and no
   * synchroniser token is needed.
   *
   * Asserted alongside the attendee cookie so that a future change to one is visibly a change to
   * only one.
   */
  it('preserves SameSite=Lax on both products', () => {
    expect(adminSessionCookieOptions(60_000).sameSite).toBe('lax')
    expect(sessionCookieOptions(60_000).sameSite).toBe('lax')
  })

  it('uses a different cookie name from the attendee session', () => {
    // A second, weaker line. Host-only scoping already stops the browser sending one to the
    // other host; the distinct name means that even if a `Domain` were added by mistake, the
    // two could not overwrite one another — the attendee session would survive rather than
    // being silently replaced, which would present as a mysterious sign-out.
    expect(ADMIN_SESSION_COOKIE).not.toBe(SESSION_COOKIE)
  })

  it('is HttpOnly, so no client code can read the administrative token', () => {
    // FR-045 forbids feature code touching platform storage at all, so a token the client could
    // read would have nowhere legitimate to live — and this token authenticates the tier that
    // can read the abuse-report queue.
    expect(adminSessionCookieOptions(60_000).httpOnly).toBe(true)
  })
})
