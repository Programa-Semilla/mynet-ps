import { RequestRefusedError } from '@mynet/data'

/**
 * T083 (013) — **classify on `error.code`, never on the class** (contracts, 008's defect).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **`ApiError extends RequestRefusedError` AND *EVERY* NON-2xx THROWS `ApiError`.**
 *
 * So `instanceof RequestRefusedError` catches 401, 403, 404, 409, 429 and 500 alike — which is
 * precisely what swallowed 008's deliberately-written messages: the routes wrote refusals to be
 * read, and the client rendered one generic sentence for all of them.
 *
 * This feature has **seven** distinguishable outcomes, and a test requires all seven to be
 * different from each other (`error-classification.test.ts`). That property is the one
 * `instanceof` classification destroys, and it is the one that would have caught 008.
 *
 * The seven, from `contracts/administrative.md`:
 *
 *   1. `not_authenticated`        — no session, expired, unknown token. **401, no detail.**
 *   2. `invalid_credentials`      — all four sign-in failures, indistinguishable (FR-915).
 *   3. `credential_not_replaced`  — 403 **with an explanation**; the reader can fix it.
 *   4. `not_found`                — wrong tier, gone, or never existed. One answer for all.
 *   5. `report_already_resolved`  — 409 **with an explanation**; the reader's own conflict.
 *   6. `refused`                  — a reasonless conflict (already an organizer).
 *   7. `too_many_attempts`        — throttled; delay only, never denial (FR-916).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/** The outcomes this client distinguishes. `unknown` is the honest catch-all, not a default. */
export type AdminFailure =
  | 'not_authenticated'
  | 'invalid_credentials'
  | 'credential_not_replaced'
  | 'not_found'
  | 'report_already_resolved'
  | 'refused'
  | 'too_many_attempts'
  | 'unreachable'
  | 'unknown'

/**
 * Reads the server's code off a refusal.
 *
 * **Reads `code`, not the class.** `RequestRefusedError` is used only to tell *a refusal the
 * server explained* from *a request that never arrived* — never to decide which refusal it was.
 */
export const classify = (error: unknown): AdminFailure => {
  if (error instanceof RequestRefusedError) {
    const code = (error as { code?: string }).code
    switch (code) {
      case 'not_authenticated':
      case 'session_expired':
        return 'not_authenticated'
      case 'invalid_credentials':
        return 'invalid_credentials'
      case 'credential_not_replaced':
        return 'credential_not_replaced'
      case 'not_found':
        return 'not_found'
      case 'report_already_resolved':
        return 'report_already_resolved'
      case 'refused':
        return 'refused'
      case 'too_many_attempts':
        return 'too_many_attempts'
      default:
        return 'unknown'
    }
  }

  // Nothing reached the server. `HttpClient` throws `OfflineError` for this, and its message is
  // already truthful — nothing was changed, try again — so the distinction is kept rather than
  // collapsed into `unknown`, which would send somebody to reload a page that will not load.
  return 'unreachable'
}

/**
 * What to say. **Every string differs**, which is what `error-classification.test.ts` asserts.
 *
 * The two that explain themselves — `credential_not_replaced` and `report_already_resolved` —
 * pass the test every explained refusal in this product must pass: *the follow-up question is
 * about the reader.* Everything else says as little as the server did.
 */
export const describe = (failure: AdminFailure): string => {
  switch (failure) {
    case 'not_authenticated':
      return 'Your administrative session has ended. Sign in again to continue.'
    case 'invalid_credentials':
      return 'That email and password combination did not match. Check both and try again.'
    case 'credential_not_replaced':
      return 'Replace your initial password before continuing. It was set for you, so it is not yours yet.'
    case 'not_found':
      return 'That is no longer available. Reload to see the current state.'
    case 'report_already_resolved':
      return 'Another operator has already resolved this report. Reload the queue to see what they decided.'
    case 'refused':
      return 'That could not be completed.'
    case 'too_many_attempts':
      return 'Too many attempts. Wait a moment and try again.'
    case 'unreachable':
      return 'MyNet could not be reached. Nothing was changed — try again when you have a connection.'
    case 'unknown':
      return 'Something went wrong. Try again, and reload if it keeps happening.'
  }
}
