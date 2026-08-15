import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'

import { loadConfig } from '../config.js'

/**
 * T063 (006) — security response headers, set by the API on API responses (FR-480, FR-481,
 * SC-411, research D8).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE API SETS ITS OWN; CADDY SETS THE STATIC DOCUMENT'S. NEITHER SETS THE OTHER'S.**
 *
 * That split is what makes both halves testable rather than assumed:
 *
 *   - Headers on **API** responses can be asserted by the existing integration suite, which
 *     runs against the real Fastify app with no proxy in front — so they are verified on every
 *     change, by machinery that already exists.
 *   - Headers on the **static document** cannot be, because nothing in CI serves the built
 *     client through Caddy. Those are asserted by the smoke check at the end of
 *     `deploy/vm/deploy.sh`, which curls the served document after every deploy.
 *
 * Setting both in Caddy would leave the API's own headers untested *and* absent from any
 * deployment without that proxy in front. Setting both in the API is impossible — the API never
 * serves the HTML document that CSP most needs to protect.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`img-src 'self' data:` — AND `data:` IS LOAD-BEARING** (FR-481).
 *
 * FR-456 delivers directory avatars as data URLs inside the listing response, which is what
 * makes a page of twenty-four faces one request instead of twenty-five. A later tightening that
 * dropped `data:` from this line would **blank every face in the directory** — with no error,
 * no failing test, and nothing in the console but a CSP report nobody is collecting.
 *
 * That is exactly the kind of silent breakage worth writing down beside the thing that would
 * cause it, which is why this is a requirement and not a comment in a config file.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * `connect-src 'self'` is **literally true** rather than aspirational, because client and API
 * share one origin (FR-476): Caddy serves the built client and reverse-proxies `/api/*`. In the
 * configuration this replaces — `pages.dev` calling `fly.dev` — it would have had to name the
 * API host, and the session cookie was never sent at all.
 */
const CONTENT_SECURITY_POLICY = [
  // The API returns JSON. Nothing it serves should ever be treated as a document source, so the
  // default is nothing at all and each capability is granted deliberately.
  "default-src 'none'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'none'",
].join('; ')

/**
 * Two years, with subdomains, and **only on deployed environments**.
 *
 * HSTS is a promise a browser remembers for its whole max-age, and it cannot be taken back from
 * a browser that already has it. Sending it from a development server on `localhost` would pin
 * a developer's browser to HTTPS for every localhost port they ever use — including other
 * projects' — which is why this is gated and the rest are not.
 */
const STRICT_TRANSPORT_SECURITY = 'max-age=63072000; includeSubDomains'

const securityHeadersPlugin = async (app: FastifyInstance): Promise<void> => {
  const config = loadConfig()

  app.addHook('onSend', async (_request, reply) => {
    reply.header('content-security-policy', CONTENT_SECURITY_POLICY)
    // Stops a browser guessing that a JSON error body is HTML and rendering it — the shortest
    // path from a reflected value to a script execution.
    reply.header('x-content-type-options', 'nosniff')
    // No referrer at all, rather than `strict-origin-when-cross-origin`: an API path can carry
    // an event or attendee identifier, and there is no third party this service links to for
    // whom that would be useful rather than a disclosure.
    reply.header('referrer-policy', 'no-referrer')
    // Nothing this API serves is ever framed. `frame-ancestors` above is the modern expression
    // of it; this is the one older browsers honour.
    reply.header('x-frame-options', 'DENY')
    // No reason for a browser to grant this origin a device capability. The API is not a
    // document and cannot use one.
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()')

    // `isDeployed`, not `isProduction` — the comment above says "deployed environments" and
    // `config.ts` records why the two are deliberately different predicates. The cookie was
    // migrated in this same change; this was left behind, so a future `NODE_ENV=staging` would
    // have sent a `Secure` cookie and no HSTS.
    if (config.isDeployed) {
      reply.header('strict-transport-security', STRICT_TRANSPORT_SECURITY)
    }
  })
}

export { CONTENT_SECURITY_POLICY, STRICT_TRANSPORT_SECURITY }

export default fp(securityHeadersPlugin, { name: 'security-headers' })
