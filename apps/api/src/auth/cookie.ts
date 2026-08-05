import type { CookieSerializeOptions } from '@fastify/cookie'

import { loadConfig } from '../config.js'

/**
 * The sign-in session cookie (FR-025, contracts/README.md).
 *
 * The token travels **only** in this cookie and never in a response body, so it is never
 * reachable from JavaScript. That is not belt-and-braces: FR-045 forbids feature code from
 * touching platform storage at all, so a token the client could read would have nowhere
 * legitimate to live.
 */
export const SESSION_COOKIE = 'mynet_session'

export const sessionCookieOptions = (maxAgeMs: number): CookieSerializeOptions => {
  const config = loadConfig()

  return {
    // Not readable by JavaScript. Rules out token theft via XSS.
    httpOnly: true,
    // TLS only. Relaxed in development because localhost has no certificate — and only there.
    secure: config.isProduction,
    // Lax, not Strict: the attendee following a link into MyNet from an email or a conference
    // schedule should arrive signed in. Lax still withholds the cookie from cross-site POSTs,
    // which is the CSRF case that matters.
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(maxAgeMs / 1000),
  }
}

/**
 * Options for clearing the cookie. Must match the set options in every attribute except
 * lifetime, or the browser keeps the original cookie alongside the cleared one.
 *
 * Note that clearing the cookie is the *lesser* half of sign-out. FR-027 requires server-side
 * revocation; a captured token that is merely forgotten by the browser still works.
 */
export const clearedSessionCookieOptions = (): CookieSerializeOptions => {
  const config = loadConfig()
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  }
}
