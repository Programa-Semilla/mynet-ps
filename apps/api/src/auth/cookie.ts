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
    /**
     * T065 (006) — **`Secure` on every DEPLOYED environment, not only on the one called
     * "production"** (FR-478).
     *
     * ─────────────────────────────────────────────────────────────────────────────────────
     * This read `config.isProduction`, which is a statement about a *name*. UAT is a real,
     * publicly reachable environment carrying realistically-shaped attendee data, and a
     * session cookie sent without `Secure` there is one an attacker on the same network can
     * take by downgrading a single request.
     *
     * `isDeployed` is deliberately the inverse of "local development" rather than a synonym
     * for production, so a future environment name defaults to secure. `config.ts` records the
     * reasoning; relaxed only on the developer's machine and in the test suite, because
     * localhost has no certificate.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    secure: config.isDeployed,
    /**
     * Lax, not Strict: the attendee following a link into MyNet from an email or a conference
     * schedule should arrive signed in. Lax still withholds the cookie from cross-site POSTs,
     * which is the CSRF case that matters.
     *
     * ─────────────────────────────────────────────────────────────────────────────────────
     * **006 — `Lax` only became a genuine defence with the move to one origin** (FR-476,
     * FR-477). In the configuration this replaces, the client was on `pages.dev` and the API on
     * `fly.dev` — two separate registrable domains on the Public Suffix List — so the cookie
     * was **never sent at all** and sign-in could not complete. Caddy serving the client and
     * proxying `/api/*` is what makes same-site mean the same site.
     *
     * No token scheme replaces it, and that is the point: an `Authorization` header would need
     * the token to be reachable from JavaScript, which `httpOnly` above exists to prevent.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
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
    // Must match `sessionCookieOptions` exactly — including this. A cleared cookie whose
    // `Secure` attribute differs from the one that was set is a *different* cookie, so the
    // browser keeps the original alongside it and sign-out leaves the session in place.
    secure: config.isDeployed,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  }
}
