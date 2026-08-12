import type { CookieSerializeOptions } from '@fastify/cookie'

import { loadConfig } from '../config.js'

/**
 * T038 (013) — the administrative session cookie (FR-911, FR-912, FR-913, decision 37).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS COOKIE SETS NO `Domain` ATTRIBUTE, AND THAT SINGLE OMISSION IS WHAT MAKES THE TWO
 * SESSIONS INDEPENDENT.**
 *
 * A cookie with no `Domain` is **host-only**: the browser sends it to `admin.example.com` and to
 * nothing else — not to `example.com`, not to any other subdomain. Setting
 * `Domain=example.com` instead would make one cookie travel to both products, and one person
 * signed into both would hold **one** session. Signing out of MyNet would sign them out of
 * administration, and — far worse — the administrative session cookie would be sent on every
 * attendee request, which is exactly the coupling decision 37 exists to prevent.
 *
 * There is no line of code here expressing that. The requirement is met by the **absence** of a
 * `domain` property, which is why `tests/unit/admin-cookie.test.ts` asserts the absence rather
 * than trusting a comment: a `domain` added later would look like a fix for a cookie somebody
 * could not get to send.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **WHY `SameSite=Lax` STILL WORKS ACROSS THE SUBDOMAIN, AND WHY THAT IS NOT A CONTRADICTION.**
 *
 * This is the distinction decision 37 turns on and it must not be re-derived carelessly:
 * `SameSite` is evaluated against the **registrable domain**, not the origin. So
 * `admin.example.com` is:
 *
 *   - **same-site** as `example.com` — which is why decision 19's CSRF defence survives
 *     untouched and no synchroniser token is needed; and
 *   - **different-origin** — which is why it gets its own service-worker scope, its own storage
 *     and its own CSP.
 *
 * No other topology gives both. A **path** (`example.com/admin`) shares the origin, so the
 * attendee service worker — registered at root scope — would intercept administrative
 * navigations. A **separate registrable domain** stops `SameSite=Lax` being sent at all, which
 * is precisely the v3.0.0 failure where the cookie was never sent and nobody could sign in.
 *
 * Host-only scoping and same-site evaluation are therefore doing two different jobs, and it is
 * possible to have both: the cookie is *sent* only to the admin host, and requests to that host
 * from that host are same-site so the cookie is sent at all.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const ADMIN_SESSION_COOKIE = 'mynet_admin_session'

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * The name differs from `mynet_session` deliberately, and it is a second, weaker line.
 *
 * Host-only scoping already stops the browser sending one cookie to the other host. The distinct
 * name means that even if a `Domain` attribute were ever added by mistake, the two cookies could
 * not overwrite one another — the attendee session would survive rather than being silently
 * replaced by an administrative one, which would present as a mysterious sign-out.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const adminSessionCookieOptions = (maxAgeMs: number): CookieSerializeOptions => {
  const config = loadConfig()

  return {
    // ── NO `domain` PROPERTY. See the header — the omission IS FR-912. ──────────────────────
    httpOnly: true,
    // `isDeployed`, not `isProduction` — 006's reasoning, and it matters more here: an
    // administrative session cookie sent without `Secure` on UAT is one an attacker on the same
    // network can take by downgrading a single request, and it authenticates the tier that can
    // read the abuse-report queue.
    secure: config.isDeployed,
    // Same-site is evaluated against the registrable domain, so this behaves exactly as it does
    // for the attendee cookie. See the header for why that is compatible with host-only scoping.
    sameSite: 'lax',
    path: '/',
    maxAge: Math.floor(maxAgeMs / 1000),
  }
}

/**
 * Options for clearing it. Every attribute must match the set options except lifetime, or the
 * browser keeps the original cookie alongside the cleared one and sign-out does nothing visible.
 *
 * As with the attendee cookie, clearing is the **lesser** half of signing out: `revokeAdminSession`
 * is what ends the session, and a captured token merely forgotten by the browser still works.
 */
export const clearedAdminSessionCookieOptions = (): CookieSerializeOptions => {
  const config = loadConfig()
  return {
    httpOnly: true,
    secure: config.isDeployed,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  }
}
