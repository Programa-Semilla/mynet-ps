import type { FastifyBaseLogger } from 'fastify'

/**
 * 004 review — **bounding the mail send, which the port cannot do for itself** (FR-318a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A `try/catch` HANDLES A FAILURE. IT DOES NOT HANDLE A HANG — AND A HANG IS THE COMMON
 * FAILURE MODE OF AN HTTP MAIL API.**
 *
 * FR-318a's guarantee is that a send failure must not fail account creation, and every call site
 * implements it with a `try/catch`. That is correct for a promise that *rejects*. It does
 * nothing for one that never settles, which is what a stalled connection to a provider produces.
 *
 * The consequence is worst exactly where the requirement was aimed. On sign-up the account is
 * already committed and the session cookie already staged when the send begins; if it hangs, the
 * client aborts at its own 20-second timeout, never receives the response, never applies the
 * cookie — and the retry meets `409 address_registered`. The attendee is locked out of a journey
 * that succeeded. That is the precise outcome FR-318a exists to prevent, reached by a route the
 * requirement's own mitigation does not cover.
 *
 * On reset-request it is worse than an inconvenience: a hang that occurs only when an account
 * exists is an account-existence oracle, which is the one thing FR-327 forbids.
 *
 * **The bound lives here rather than in each adapter** so that a future provider cannot ship
 * without one. `MailService` implementations are written against a two-method interface with no
 * timeout parameter; making the timeout the caller's business would mean re-deciding it at every
 * call site, and the register entry 18 adapter is written by someone who has not read this file.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * Deliberately well under the web client's own 20-second abort (`packages/data/src/http/client.ts`).
 * A send that has not completed in this long is not going to complete usefully, and the attendee
 * is better served by a response than by a connection held open on their behalf — the message is
 * resendable, and the account exists either way.
 */
export const MAIL_SEND_TIMEOUT_MS = 5_000

/**
 * Awaits a send, bounded, and swallows both rejection and timeout after logging.
 *
 * **Swallowing is the requirement here, not an oversight** (FR-318a) — the caller has already
 * committed the work the message describes, and the send is genuinely best-effort. The error is
 * logged with enough context to diagnose, and the returned boolean lets a caller that wants to
 * distinguish do so without reaching for the error itself.
 *
 * Returns `true` when the message was handed to the provider successfully.
 */
export const dispatchMail = async (
  send: () => Promise<void>,
  log: FastifyBaseLogger,
  what: string,
): Promise<boolean> => {
  // `unref()` so a pending timer cannot hold the process open at shutdown — the sweep and the
  // server both exit on SIGTERM, and a five-second timer is long enough to be noticed.
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`mail send timed out after ${MAIL_SEND_TIMEOUT_MS}ms`)),
      MAIL_SEND_TIMEOUT_MS,
    )
    timer.unref()
  })

  try {
    await Promise.race([send(), timeout])
    return true
  } catch (error) {
    log.error({ err: error }, what)
    return false
  } finally {
    // Cleared on every path, so a fast send does not leave a timer pending for five seconds.
    if (timer) clearTimeout(timer)
  }
}
