import { randomUUID } from 'node:crypto'

import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import {
  attendees,
  clearThrottle,
  cookieHeader,
  GRACE,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T013 (010) — **an unverified account cannot share its card** (FR-806, FR-808, SC-809).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE FINDING, IN ONE SENTENCE: AN ACCOUNT CREATED AGAINST AN ADDRESS ITS HOLDER DOES NOT
 * CONTROL CAN INSTALL A LIVE-RESOLVING PROFILE, BEARING A CHOSEN NAME AND FACE, PERMANENTLY
 * INTO A VERIFIED ATTENDEE'S NETWORK.**
 *
 * Every clause of that is load-bearing:
 *
 *   * **live-resolving** — a held card resolves the sharer's *current* profile, by design
 *     (v3.2.0 N2). Whatever the sharer edits it to later is what the recipient sees.
 *   * **permanently** — FR-618: a card cannot be recalled, and the recipient cannot delete it.
 *   * **chosen name and face** — the profile is attendee-authored, and avatars are unmoderated
 *     (register entry 19, escalated and explicitly still open).
 *
 * Verification is the one signal that an address belongs to the person using it. Before this,
 * sharing consulted it for the **recipient** and not for the **sharer** — so the party being
 * checked was the one receiving something, and the party writing into somebody else's Network
 * was not checked at all.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THIS IS A SECOND USE OF VERIFICATION STATE, AND IT IS RECORDED RATHER THAN SLIPPED IN.**
 *
 * The standing invariant is that verification gates *exactly one thing: discoverability*, and
 * that no feature may use it for anything else. FR-806 is a deliberate, specified exception: it
 * governs **the actor at write time**, never a read. FR-807 draws the line — card *resolution*
 * continues to consult neither discoverability nor verification, because the three absences in
 * that query are the whole of what a standing consent means.
 *
 * If you are here because you are adding a third use: it needs the same treatment.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
describe('sharing a card requires the SHARER to be verified (FR-806)', () => {
  let app: FastifyInstance
  let cookie: string
  let sharerId: string
  let recipientId: string

  const share = (attendeeId: string) =>
    app.inject({
      method: 'POST',
      url: '/cards',
      headers: { cookie: cookieHeader(cookie) },
      payload: { attendeeId },
    })

  const setVerified = async (verified: boolean): Promise<void> => {
    await getDb()
      .update(attendees)
      .set({ emailVerifiedAt: verified ? new Date() : null })
      .where(eq(attendees.id, sharerId))
  }

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()

    // A self-signed-up account: unverified by construction, which is the state under test. The
    // seeded attendees are all verified, so the fixture has to be created rather than borrowed.
    const signUp = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: {
        email: `unverified-sharer-${randomUUID()}@example.com`,
        displayName: 'Unverified Sharer',
        password: SEED_PASSWORD,
      },
    })
    const issued = sessionCookieFrom(signUp)
    if (!issued) throw new Error(`Sign-up failed: ${signUp.body}`)
    cookie = issued

    const joined = await app.inject({
      method: 'POST',
      url: '/events/join',
      headers: { cookie: cookieHeader(cookie) },
      payload: { joinCode: 'PDS-2026' },
    })
    if (joined.statusCode >= 400) throw new Error(`Join failed: ${joined.body}`)

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieHeader(cookie) },
    })
    sharerId = (me.json() as { id: string }).id

    // A recipient who satisfies every OTHER condition: registered for the same conference,
    // discoverable and verified. So the only thing that can refuse the share is the sharer.
    const recipient = await getDb()
      .select({ id: attendees.id })
      .from(attendees)
      .where(eq(attendees.email, GRACE))
      .limit(1)
    recipientId = recipient[0]!.id

    await clearThrottle()
  }, 120_000)

  afterAll(async () => {
    await teardown(app)
  })

  it('the fixture is real: the account is unverified and everything else is in order', async () => {
    const rows = await getDb()
      .select({ verifiedAt: attendees.emailVerifiedAt })
      .from(attendees)
      .where(eq(attendees.id, sharerId))

    expect(rows[0]!.verifiedAt).toBeNull()
    expect(recipientId).toBeTruthy()
  })

  it('refuses the share (FR-806, SC-809)', async () => {
    await clearThrottle()
    const response = await share(recipientId)

    expect(
      response.statusCode,
      'An unverified account shared its card. Anybody can sign up with an address they do not ' +
        'control, and a shared card is irrevocable and resolves the sharer’s live profile.',
    ).toBe(404)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **FR-808 — BYTE-IDENTICAL, NOT MERELY "ALSO A 404".**
   *
   * The refusal must disclose nothing about the intended recipient. This route already answers
   * one identical 404 for five different causes — no such attendee, no conference in common, not
   * discoverable, a malformed identifier, and the caller having joined nothing — precisely
   * because distinguishing them turns sharing into an oracle for "is this identifier a real
   * attendee", against a world-readable repository and public self sign-up.
   *
   * A new sixth cause that answered with its own message would undo that in one line, and would
   * do it in the most natural way imaginable: by being *helpful* about why the share failed.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('is indistinguishable from sharing with somebody who does not exist (FR-808)', async () => {
    await clearThrottle()
    const refusedForVerification = await share(recipientId)

    await clearThrottle()
    const refusedForNonexistence = await share(randomUUID())

    expect(refusedForVerification.statusCode).toBe(refusedForNonexistence.statusCode)
    expect(
      refusedForVerification.body,
      'The refusal for an unverified sharer differs from the refusal for a nonexistent ' +
        'recipient. That difference is readable by anybody, and it turns this route into an ' +
        'oracle — the caller learns which of the two conditions failed, and therefore something ' +
        'about the identifier they supplied.',
    ).toBe(refusedForNonexistence.body)
  })

  it('writes nothing at all when it refuses', async () => {
    await clearThrottle()
    await share(recipientId)

    const held = await app.inject({
      method: 'GET',
      url: '/cards/shared',
      headers: { cookie: cookieHeader(cookie) },
    })

    const body = held.json() as { cards: unknown[] }
    expect(
      body.cards,
      'A refused share left a row behind. The refusal has to be complete: a card that exists but ' +
        'was never permitted is worse than either outcome on its own.',
    ).toHaveLength(0)
  })

  /**
   * The other half, and the one that keeps this a *gate* rather than a wall: verification is
   * reachable, and reaching it restores the capability immediately. Nothing about the refusal is
   * permanent, and nothing has to be repaired for the share to work afterwards.
   */
  it('permits the share as soon as the address is verified', async () => {
    await setVerified(true)
    await clearThrottle()

    const response = await share(recipientId)

    expect(
      response.statusCode,
      `A verified account was still refused: ${response.body}. The check is on verification and ` +
        'must not have become a check on something else.',
    ).toBe(201)
  })

  /**
   * FR-806a — **no backfill, and the absence is deliberate rather than forgotten.**
   *
   * A card is irrevocable by requirement (FR-618). A rule that removed one because its sharer
   * turned out to be unverified would contradict a shipped guarantee, and there is no such card
   * to remove in any case: no environment has ever been deployed.
   */
  it('leaves an already-shared card alone if verification is ever lost (FR-806a)', async () => {
    // Nothing in the product can un-verify an address; this drives the state directly to assert
    // the *resolution* side is untouched by FR-806 — which is FR-807 in one observation.
    await setVerified(false)
    await clearThrottle()

    const held = await app.inject({
      method: 'GET',
      url: '/cards/shared',
      headers: { cookie: cookieHeader(cookie) },
    })

    expect(
      (held.json() as { cards: unknown[] }).cards,
      'The card shared while verified disappeared when verification was withdrawn. FR-806 is a ' +
        'check on the ACTOR AT WRITE TIME. FR-807 forbids it reaching resolution, where the ' +
        'three deliberate absences — no discoverability, no verification, no registration join — ' +
        'are what a standing consent means.',
    ).toHaveLength(1)

    await setVerified(true)
  })
})
