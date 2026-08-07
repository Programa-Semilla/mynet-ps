import { readFileSync } from 'node:fs'

import { API_LOG } from './api-process.js'

/**
 * 004 — reading a verification or reset link out of the development mail sink.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THERE IS NOWHERE ELSE TO READ ONE.**
 *
 * The plaintext of a link exists for exactly one moment, inside the request that issued it —
 * only its SHA-256 is stored (FR-323, FR-333). That is the property under test, so a spec that
 * could recover a link from the database would be a spec proving the property false.
 *
 * The sink writes each link to the API's output, `api-process.ts` points that at a file, and
 * quickstart.md Scenario 2 already tells a reader to look there while register entry 18 is
 * open. This is the same instruction, automated.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Waits for a link of the given kind to appear for an address, and returns it. */
export const waitForLink = async (
  kind: 'verification' | 'password-reset',
  email: string,
  timeoutMs = 15_000,
): Promise<string> => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const link = latestLink(kind, email)
    if (link) return link
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  throw new Error(
    `No ${kind} link for ${email} appeared in the API log within ${timeoutMs}ms. The ` +
      'development mail sink writes one per send; if none arrived, the send did not happen.',
  )
}

/**
 * The most recent link of a kind for an address, or `undefined`.
 *
 * Scans backwards so a resend wins over the message it replaces — which is what somebody
 * clicking the newest message in their inbox would get.
 */
const latestLink = (kind: string, email: string): string | undefined => {
  let log: string
  try {
    log = readFileSync(API_LOG, 'utf8')
  } catch {
    return undefined
  }

  const lines = log.split('\n')

  for (let index = lines.length - 1; index >= 1; index -= 1) {
    // The sink writes the kind and address on one line and the link on the next.
    if (!lines[index]?.includes(email) || !lines[index]?.includes(kind)) continue

    const link = lines[index + 1]?.trim()
    if (link?.startsWith('http')) return link
  }

  return undefined
}
