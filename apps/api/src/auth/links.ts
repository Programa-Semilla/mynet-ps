import { loadConfig } from '../config.js'

/**
 * 004 — the addresses the transactional messages point at (FR-318, FR-326).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Built here rather than in each route, because these are the one pair of strings the API and
 * the client must agree on exactly.** The client declares `/verify` and `/reset-password` in
 * `apps/web/src/app/navigation.ts`; a message pointing anywhere else is a link that 404s in the
 * attendee's inbox, and no test on either side would notice a drift between two literals in two
 * packages.
 *
 * `webOrigin` is already the configured origin the API allows credentialed requests from, so
 * there is no second setting to keep in step — a link built against a different origin would be
 * one the browser refuses to send the session cookie to anyway.
 *
 * The token travels as a query parameter because the person clicks it out of a mail client,
 * which is the one delivery mechanism that cannot carry a body. That is a genuine exposure —
 * the address lands in browser history — and it is bounded by what the specification already
 * requires of these links: single use, and short-lived (FR-320, FR-328).
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const verificationLink = (token: string): string =>
  `${loadConfig().webOrigin}/verify?token=${encodeURIComponent(token)}`

export const passwordResetLink = (token: string): string =>
  `${loadConfig().webOrigin}/reset-password?token=${encodeURIComponent(token)}`
