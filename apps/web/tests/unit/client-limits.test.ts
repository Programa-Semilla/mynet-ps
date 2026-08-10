import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { PASSWORD_MIN_LENGTH as RESET_PASSWORD_MIN } from '../../src/app/auth/ResetPassword.js'
import { PASSWORD_MIN_LENGTH as SIGN_UP_PASSWORD_MIN } from '../../src/app/auth/SignUp.js'
import { MESSAGE_MAX_LENGTH } from '@mynet/data'

import { LIMITS } from '../../src/app/profile/ProfileEdit.js'

/**
 * 004 review — **the client's validation bounds, held to the published contract.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A COMMENT SAYING "MIRRORS THE SERVER" IS AN ACKNOWLEDGEMENT OF COUPLING, NOT A MECHANISM
 * FOR IT.**
 *
 * Every bound this feature enforces server-side is re-declared as a hand-copied literal on the
 * client: `PASSWORD_MIN_LENGTH` in two files, `LIMITS` in a third. Two of them carried a
 * comment naming the server file they mirror, and nothing checked that they still did.
 *
 * These are not cosmetic. FR-304 and FR-338 require the confirmation to be **disabled** with
 * the reason stated — *"never a post-submit error"* — and the disabled state is computed from
 * the client copy. Raise `PASSWORD_MIN_LENGTH` on the server without touching both client
 * files and the button enables, the request is submitted, and the attendee receives precisely
 * the post-submit 400 those requirements forbid. Nothing fails: the route schema still
 * validates, and each component test asserts against its own copy of the wrong number.
 *
 * **The contract is the right authority to check against**, rather than importing the server
 * constants directly. `contracts/openapi.json` is generated from the route schemas, committed,
 * and is what the client is written against — so it is the server's bound *as published*. It
 * also needs no dependency from `apps/web` on `apps/api`, which would invert the direction of
 * every other edge in this repository.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const contract = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../contracts/openapi.json', import.meta.url)),
    'utf8',
  ),
) as {
  paths: Record<
    string,
    Record<
      string,
      {
        requestBody?: {
          content: Record<string, { schema: { properties: Record<string, JsonSchema> } }>
        }
      }
    >
  >
}

interface JsonSchema {
  readonly minLength?: number
  readonly maxLength?: number
  readonly maxItems?: number
  readonly items?: JsonSchema
}

const bodyProperties = (path: string, method: string): Record<string, JsonSchema> => {
  const properties =
    contract.paths[path]?.[method]?.requestBody?.content['application/json']?.schema.properties

  // Non-vacuity. If the contract moved or a path was renamed, every assertion below would
  // compare `undefined` to `undefined` and pass while checking nothing.
  expect(
    properties,
    `the contract has no request body for ${method.toUpperCase()} ${path}`,
  ).toBeDefined()

  return properties as Record<string, JsonSchema>
}

describe("the client's copies of the server's validation bounds", () => {
  it('states the same password minimum the contract does, on both screens (FR-304)', () => {
    const signUp = bodyProperties('/auth/sign-up', 'post')['password']
    const reset = bodyProperties('/auth/reset', 'post')['password']

    expect(signUp?.minLength, 'the contract publishes no password minimum').toBeDefined()

    const message =
      'The client would enable its confirmation for a password the server refuses, producing ' +
      'the post-submit error FR-304 forbids. Update the client copy in the same change.'

    expect(SIGN_UP_PASSWORD_MIN, message).toBe(signUp?.minLength)
    expect(RESET_PASSWORD_MIN, message).toBe(reset?.minLength)

    // The two screens set the same password, so they must agree with each other as well — a
    // reset screen that accepted less than sign-up would be a way in under the policy.
    expect(SIGN_UP_PASSWORD_MIN).toBe(RESET_PASSWORD_MIN)
  })

  it('states the same profile bounds the contract does (FR-338)', () => {
    const profile = bodyProperties('/profile', 'put')

    const message =
      'The client would let the attendee type past what the server accepts, and its ' +
      'remaining-characters count would be counting down to the wrong number (FR-338).'

    expect(LIMITS.company, message).toBe(profile['company']?.maxLength)
    expect(LIMITS.role, message).toBe(profile['role']?.maxLength)
    expect(LIMITS.headline, message).toBe(profile['headline']?.maxLength)
    expect(LIMITS.interestCount, message).toBe(profile['interests']?.maxItems)
    expect(LIMITS.interest, message).toBe(profile['interests']?.items?.maxLength)
  })

  /**
   * The avatar bounds are **not** checked here, and the reason is worth stating rather than
   * leaving as a gap somebody later fills wrongly.
   *
   * `Avatar.tsx` renders the prose "JPEG, PNG, WebP, AVIF or GIF, up to 5 MB". The 5 MB half of
   * that is `AVATAR_MAX_UPLOAD_BYTES`, which is **environment-configurable** (`config.ts`,
   * `.env.example`) and therefore absent from the contract — so an operator can make that
   * sentence false without touching any code, and no test can catch it from here.
   *
   * That is a product decision to take, not a bug to fix in a review: either the limit stops
   * being configurable, or the client is told it at runtime (`GET /profile` already returns
   * `hasAvatar` and could carry it). Recorded in review-findings.md rather than resolved.
   */
  it.todo('holds the avatar prose to the server bound once that bound is knowable to the client')

  /**
   * 007's bound — the third hand-copied limit, and the one this file did not grow to cover.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * `MESSAGE_MAX_LENGTH` is declared twice: `packages/data/src/interfaces/messages.ts` (which
   * `Composer` uses to compute `sendable`, the remaining-characters counter and its threshold)
   * and `apps/api/src/db/queries/messages.ts` (the schema bound and the trimmed-length check).
   * Nothing checked they agreed — the exact failure this file exists for, added by a later
   * feature that did not extend it.
   *
   * Both directions are defects an attendee sees. Raise the server's limit and the send button
   * disables at the client's lower number, refusing a message the server would accept. Lower it
   * and the button enables for one the server rejects with a 400 — the post-submit error FR-512
   * and FR-517 both forbid.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it("the message limit matches the route's published bound (FR-512, FR-517)", () => {
    const body = bodyProperties('/conversations/{conversationId}/messages', 'post')['body']

    expect(
      body?.maxLength,
      'The route publishes a bound and the composer enforces its own copy. If these disagree, ' +
        'one of them is lying to an attendee about what they may send.',
    ).toBeGreaterThanOrEqual(MESSAGE_MAX_LENGTH)

    // The route deliberately publishes a *larger* wire bound than the trimmed limit, so a body
    // that is only over because of whitespace is rejected by the trimmed check with a message
    // rather than by the schema with a generic 400. Asserting the relationship rather than
    // equality keeps that deliberate slack visible instead of looking like a mismatch.
    expect(body?.maxLength).toBeLessThanOrEqual(MESSAGE_MAX_LENGTH * 2)
  })
})
