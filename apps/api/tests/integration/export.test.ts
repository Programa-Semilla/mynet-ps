import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { attendeeBlocks } from '../../src/db/schema/blocks.js'
import {
  conversationPairs,
  conversationParticipants,
  conversations,
} from '../../src/db/schema/conversations.js'
import { messages } from '../../src/db/schema/messages.js'
import { pushSubscriptions } from '../../src/db/schema/push-subscriptions.js'
import { abuseReports } from '../../src/db/schema/reports.js'
import {
  ADA,
  attendees,
  clearThrottle,
  cookieHeader,
  GRACE,
  resetDatabase,
  SEED_EVENTS,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'
// The claim the unit guard makes, checked here against a real document. Imported rather than
// restated so the two cannot drift — a mapping this file did not see is a mapping it cannot check.
import { EXPORTED_COLUMNS } from '../support/export-columns.js'

/**
 * T094 (004) — the personal-data export (FR-373–FR-379, SC-305).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE ASSERTS WHAT MUST BE PRESENT AND WHAT MUST BE ABSENT; THE STRUCTURAL GUARD IN
 * `tests/unit/export-coverage.test.ts` ASSERTS THAT NOTHING WAS FORGOTTEN.**
 *
 * The division matters. This file can only check the fields somebody thought to check — it
 * would pass unchanged after a later feature added a table and omitted it, which is exactly the
 * defect FR-377 calls a defect. The guard derives its expectations from the schema, so a new
 * column fails by existing. Neither is sufficient alone: the guard cannot tell whether the
 * document is *correct*, and this cannot tell whether it is *complete*.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('personal-data export', () => {
  let app: FastifyInstance
  let ada: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await clearThrottle()

    ada = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: ADA, password: SEED_PASSWORD },
      }),
    ) as string

    // An attendee with data across four features, which is what US6's independent test asks for.
    const events = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(ada) },
    })
    const eventId = (events.json() as Array<{ id: string; name: string }>).find(
      (event) => event.name === SEED_EVENTS[0].name,
    )?.id as string

    const sessions = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/sessions`,
      headers: { cookie: cookieHeader(ada) },
    })
    const sessionId = (sessions.json() as Array<{ id: string }>)[0]?.id as string

    await app.inject({
      method: 'PUT',
      url: `/events/${eventId}/agenda/saved/${sessionId}`,
      headers: { cookie: cookieHeader(ada) },
    })
    await app.inject({
      method: 'PUT',
      url: `/events/${eventId}/agenda/notes/${sessionId}`,
      headers: { cookie: cookieHeader(ada) },
      payload: { body: 'A private note nobody else can read.' },
    })
    await app.inject({
      method: 'PUT',
      url: '/workspace/active-event',
      headers: { cookie: cookieHeader(ada) },
      payload: { eventId },
    })

    const image = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 12, g: 34, b: 56 } },
    })
      .png()
      .toBuffer()
    await app.inject({
      method: 'PUT',
      url: '/profile/avatar',
      headers: { cookie: cookieHeader(ada) },
      payload: { image: image.toString('base64') },
    })

    // ─────────────────────────────────────────────────────────────────────────────────────
    // 008 **before** 007, and the order is load-bearing: `populate007Sections` inserts a block
    // from Ada to Grace, and a block refuses both card sharing and meeting proposals (FR-608,
    // FR-637). Driving 008's routes afterwards would silently populate nothing, and the emptiness
    // guard below would then fail for a reason that looks like a missing export.
    // ─────────────────────────────────────────────────────────────────────────────────────
    await populate008Sections()
    await populate009Sections()
    await populate007Sections()
  })

  /**
   * 007 — the four sections this feature added to the export (research R14).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **WRITTEN DIRECTLY TO THE DATABASE RATHER THAN THROUGH ROUTES, AND THAT IS DELIBERATE.**
   *
   * Every other section above is populated by driving the real API, which is the better fixture
   * wherever it is available: it proves the write path and the read path agree. These four
   * cannot be, yet — `POST /conversations`, `POST /blocks`, `POST /reports` and
   * `POST /push/subscriptions` land in Phases 3, 5 and 7.
   *
   * Leaving them unpopulated is not the neutral choice it looks like. This test's whole
   * guarantee is that a **declared** column is actually **produced**, and an empty section
   * silences it for every column in that section — so `messages.body` could be declared,
   * omitted from `assembleExport`, and pass. The emptiness guard above exists precisely to make
   * that visible, and it is what went red when T018 declared these columns while the fixture
   * had nothing to show.
   *
   * T138 adds the round-trip version once the routes exist. This keeps the coverage guarantee
   * honest in the meantime, which is the whole reason T136/T137 were pulled forward at all.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  const populate007Sections = async (): Promise<void> => {
    const db = getDb()

    const adaId = (
      await db.select({ id: attendees.id }).from(attendees).where(eq(attendees.email, ADA)).limit(1)
    )[0]?.id as string
    const graceId = (
      await db
        .select({ id: attendees.id })
        .from(attendees)
        .where(eq(attendees.email, GRACE))
        .limit(1)
    )[0]?.id as string

    const [conversation] = await db.insert(conversations).values({}).returning({
      id: conversations.id,
    })
    const conversationId = conversation?.id as string

    // The ordered pair, as `createConversationWithFirstMessage` will write it. The CHECK
    // constraint refuses any other ordering, so the fixture cannot drift from the real shape.
    const [lower, higher] = [adaId, graceId].sort()
    await db.insert(conversationPairs).values({
      conversationId,
      lowerAttendeeId: lower as string,
      higherAttendeeId: higher as string,
    })
    await db.insert(conversationParticipants).values([
      { conversationId, attendeeId: adaId },
      { conversationId, attendeeId: graceId },
    ])

    // Two messages, one from each side. **Only Ada's may appear in her export** (FR-578) — the
    // absence of Grace's is asserted by `messages-export.test.ts` (T138); here the second
    // message exists so that a fixture with nothing to exclude cannot make that assertion
    // vacuous later.
    await db.insert(messages).values([
      { conversationId, authorId: adaId, body: 'A message Ada wrote, which her export contains.' },
      {
        conversationId,
        authorId: graceId,
        body: "A message Grace wrote, which Ada's export must not contain.",
      },
    ])

    await db.insert(attendeeBlocks).values({ blockerId: adaId, blockedId: graceId })

    await db.insert(abuseReports).values({
      reporterId: adaId,
      reportedId: graceId,
      reason: 'A report Ada filed.',
      messageIds: [],
      // 009 — `question_ids` mirrors `message_ids`, NOT NULL with no database default, so an
      // insert has to supply it. Populated here rather than left empty so the export's new field
      // is exercised by a value rather than by an absence.
      questionIds: [],
    })

    // `lastDeliveredAt` is set rather than left null so the column is exercised as a value the
    // export must reproduce, not merely as a key that happens to exist.
    await db.insert(pushSubscriptions).values({
      attendeeId: adaId,
      endpoint: 'https://push.example.test/subscription/ada-device-1',
      p256dhKey: 'a-public-key',
      authKey: 'an-auth-secret',
      lastDeliveredAt: new Date(),
    })
  }

  /**
   * 008 — the three sections this feature added to the export (FR-653, SC-610).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **DRIVEN THROUGH THE REAL ROUTES, WHICH IS THE OPPOSITE OF `populate007Sections` ABOVE —
   * AND THE DIFFERENCE IS THE POINT.**
   *
   * 007's four sections had to be written straight to the database because the routes that would
   * create them landed in later phases; its own comment records that as a compromise and names
   * the round-trip version as follow-up work. 008 has no such excuse: sharing a card and
   * proposing a meeting are both reachable by the time the export is assembled, so this fixture
   * uses them.
   *
   * That buys a strictly stronger guarantee. Writing rows by hand proves the export **reads**
   * what a test put there; driving the routes proves the export reads what the **product**
   * writes — so a mismatch between the write path's column choices and the export's is caught
   * here rather than surviving as two consistent halves of the same misunderstanding.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   *
   * All three directions are exercised, because `shared_cards` appears in the document **twice**
   * and one row cannot populate both sections: Ada sharing with Grace fills `cardsShared`, Grace
   * sharing back fills `cardsHeld`, and a proposal from Ada fills `appointments`.
   */
  const populate008Sections = async (): Promise<void> => {
    await clearThrottle()
    const grace = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: GRACE, password: SEED_PASSWORD },
      }),
    ) as string

    const graceId = (
      await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieHeader(grace) } })
    ).json() as { id: string }
    const adaId = (
      await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: cookieHeader(ada) } })
    ).json() as { id: string }

    // Both directions. A→B and B→A are two different facts (research R5), and the export shows
    // each from the side it belongs to.
    await clearThrottle()
    await app.inject({
      method: 'POST',
      url: '/cards',
      headers: { cookie: cookieHeader(ada) },
      payload: { attendeeId: graceId.id },
    })
    await clearThrottle()
    await app.inject({
      method: 'POST',
      url: '/cards',
      headers: { cookie: cookieHeader(grace) },
      payload: { attendeeId: adaId.id },
    })

    const events = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(ada) },
    })
    const eventId = (events.json() as Array<{ id: string; name: string }>).find(
      (event) => event.name === SEED_EVENTS[0].name,
    )?.id as string

    const slots = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/appointments/slots?attendeeId=${graceId.id}`,
      headers: { cookie: cookieHeader(ada) },
    })
    const slotId = (slots.json() as { slots: Array<{ slotId: string }> }).slots[0]?.slotId

    // A seeded conference in the future always has slots; if it ever does not, the emptiness
    // guard below reports it as an unpopulated section rather than passing vacuously.
    if (slotId) {
      await clearThrottle()
      await app.inject({
        method: 'POST',
        url: `/events/${eventId}/appointments`,
        headers: { cookie: cookieHeader(ada) },
        payload: {
          inviteeId: graceId.id,
          slotId,
          topic: 'A meeting Ada proposed, which her export contains.',
        },
      })
    }
  }

  /**
   * 009 — the two sections this feature added to the export (FR-764).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **DRIVEN THROUGH THE REAL ROUTES, following 008 rather than 007.**
   *
   * The reasoning in `populate008Sections` above applies unchanged and is worth restating for
   * the one thing it buys here: driving the routes proves the export reads what the **product**
   * writes. If `askQuestion` ever stored a trimmed body while the export reproduced an untrimmed
   * column, or if the ordering changed, a hand-written fixture would agree with the export and
   * both would be wrong together.
   *
   * **Both attendees ask, because Ada cannot vote on her own question** (FR-722). One row cannot
   * populate both sections: Ada's question fills `questionsAsked`, and her upvote of Grace's
   * fills `questionVotes`. That is the same shape as the two card directions above, reached by a
   * different rule.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  const populate009Sections = async (): Promise<void> => {
    await clearThrottle()
    const grace = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: GRACE, password: SEED_PASSWORD },
      }),
    ) as string

    const events = await app.inject({
      method: 'GET',
      url: '/events',
      headers: { cookie: cookieHeader(ada) },
    })
    const eventId = (events.json() as Array<{ id: string; name: string }>).find(
      (event) => event.name === SEED_EVENTS[0].name,
    )?.id as string

    const programme = await app.inject({
      method: 'GET',
      url: `/events/${eventId}/sessions`,
      headers: { cookie: cookieHeader(ada) },
    })
    const sessionId = (programme.json() as Array<{ id: string }>)[0]?.id as string

    // Ada's own question — `questionsAsked`.
    await clearThrottle()
    await app.inject({
      method: 'POST',
      url: `/events/${eventId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(ada) },
      payload: { body: 'A question Ada asked, which her export contains.' },
    })

    // Grace's question, so Ada has something she is allowed to upvote — `questionVotes`.
    await clearThrottle()
    const asked = await app.inject({
      method: 'POST',
      url: `/events/${eventId}/sessions/${sessionId}/questions`,
      headers: { cookie: cookieHeader(grace) },
      payload: {
        body: "A question Grace asked, which Ada's export must not reproduce the text of.",
      },
    })

    const graces = (asked.json() as { questions: Array<{ id: string; body: string }> }).questions
    const target = graces.find((question) => question.body.startsWith('A question Grace'))

    if (target) {
      await clearThrottle()
      await app.inject({
        method: 'POST',
        url: `/events/${eventId}/questions/${target.id}/vote`,
        headers: { cookie: cookieHeader(ada) },
      })
    }
  }

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
  })

  const exportFor = (token = ada) =>
    app.inject({
      method: 'GET',
      url: '/profile/export',
      headers: { cookie: cookieHeader(token) },
    })

  it("contains the attendee's data from every feature that holds any (FR-374)", async () => {
    const response = await exportFor()
    expect(response.statusCode).toBe(200)

    const document = response.json() as Record<string, unknown>

    expect(document['account']).toMatchObject({ email: ADA, displayName: 'Ada Lovelace' })
    expect(document['profile']).toMatchObject({ company: 'Analytical Engines' })
    expect(document['interests']).toEqual(expect.arrayContaining(['Design systems']))
    expect((document['registrations'] as unknown[]).length).toBeGreaterThan(0)
    expect(document['activeConference']).not.toBeNull()
    expect((document['savedSessions'] as unknown[]).length).toBe(1)
    expect((document['sessionNotes'] as unknown[])[0]).toMatchObject({
      body: 'A private note nobody else can read.',
    })
    expect((document['signInSessions'] as unknown[]).length).toBeGreaterThan(0)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE HALF OF THE COVERAGE GUARANTEE THE UNIT GUARD CANNOT MAKE** (FR-377, SC-305).
   *
   * `tests/unit/export-coverage.test.ts` proves every schema column is *declared* in
   * `EXPORTED_COLUMNS`. It reads the Drizzle schema, not the export, so it cannot tell whether
   * `assembleExport` actually produces what was declared — a future author could satisfy it by
   * adding one line and shipping a field that never reaches the document.
   *
   * This walks the same mapping against a real, fully-populated export and requires each named
   * field to be present. Together the two make FR-377 checkable in both directions: a column
   * that exists must be declared, and a column that is declared must be produced.
   *
   * The fixture must stay fully populated for this to mean anything — every section is
   * non-empty for `ada`, and the emptiness guard below is what keeps a vacuous pass visible.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('produces every field EXPORTED_COLUMNS declares, not merely a section for it (FR-377)', async () => {
    const document = (await exportFor()).json() as Record<string, unknown>

    const checked: string[] = []

    for (const [column, { section, field }] of Object.entries(EXPORTED_COLUMNS)) {
      // `interests` is a list of bare strings, so there is no field within an element to look
      // for. Its presence is asserted by the test above.
      if (field === '') continue

      const value = document[section]
      expect(value, `the export has no "${section}" section, declared for ${column}`).toBeDefined()
      expect(value, `"${section}" is null in a fixture built to populate it`).not.toBeNull()

      const element = Array.isArray(value) ? value[0] : value
      expect(
        element,
        `"${section}" is empty, so ${column} cannot be checked — the fixture must populate it`,
      ).toBeDefined()

      expect(
        Object.hasOwn(element as object, field),
        `${column} is declared exported as ${section}.${field}, but the document has no such ` +
          `field. Either add it to \`assembleExport\`, or correct the mapping in ` +
          `tests/support/export-columns.ts. A field collected but absent from the export ` +
          `is a defect (FR-377).`,
      ).toBe(true)

      checked.push(column)
    }

    // Non-vacuity: if the loop silently checked nothing, everything above passes.
    expect(checked.length).toBeGreaterThan(20)
  })

  it('embeds the avatar rather than linking to it (FR-374, research D11)', async () => {
    const document = (await exportFor()).json() as {
      avatar: { contentType: string; base64: string }
    }

    expect(document.avatar).toBeDefined()
    expect(document.avatar.contentType).toBe('image/webp')

    // Genuinely an image, not a placeholder that happens to be base64.
    const bytes = Buffer.from(document.avatar.base64, 'base64')
    expect((await sharp(bytes).metadata()).format).toBe('webp')

    // A URL would make the export a pointer into a system the attendee may have asked to be
    // deleted from thirty seconds later.
    expect(JSON.stringify(document.avatar)).not.toMatch(/https?:\/\//)
  })

  it('contains NO credential material of any kind (FR-376, SC-311)', async () => {
    const body = (await exportFor()).body

    for (const forbidden of [
      'argon2',
      'passwordHash',
      'password_hash',
      'tokenHash',
      'token_hash',
    ]) {
      expect(body, `the export contains "${forbidden}"`).not.toContain(forbidden)
    }

    const document = (await exportFor()).json() as Record<string, unknown>
    expect(Object.keys(document)).not.toContain('verifications')
    expect(Object.keys(document)).not.toContain('passwordResets')

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **…and no live token, by SHAPE rather than by name — which this now actually does.**
    //
    // The two assertions above, and the string list before them, are all name-based: they
    // catch a token that arrives under a predictable key and nothing else. A token leaking as
    // `account.pendingVerificationToken`, or inside an element of `signInSessions`, satisfies
    // every one of them. The comment here has claimed a shape check since it was written;
    // this is it.
    //
    // `issueToken` produces `randomBytes(32).toString('base64url')` — 43 characters of
    // `[A-Za-z0-9_-]` with no padding.
    //
    // **The avatar must be excised, or this flakes.** Standard base64 uses `+`, `/` and `=`,
    // none of which are in the character class, so they act as boundaries — and a long image
    // payload throws up runs of exactly 43 by chance. Measured at 2 in 20 over real 512px webp
    // avatars, i.e. a ~10% false failure rate, which is worse than no check at all. The avatar
    // is bytes rather than a string field, so nothing about tokens is lost by skipping it.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const { avatar: _avatar, ...withoutImage } = document
    const scanned = JSON.stringify(withoutImage)

    const TOKEN_SHAPE = /(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])/
    const suspect = TOKEN_SHAPE.exec(scanned)

    expect(
      suspect?.[0],
      `a value shaped like a live 256-bit token appears in the export: ${suspect?.[0] ?? ''}. ` +
        'Verification and reset material must never reach a file the attendee downloads and ' +
        'keeps (FR-376, FR-391).',
    ).toBeUndefined()
  })

  it('contains no data belonging to any other attendee (FR-375)', async () => {
    const body = (await exportFor()).body

    expect(body).not.toContain(GRACE)
    expect(body).not.toContain('Grace Hopper')
    expect(body).not.toContain('Naval Systems Group')
    expect(body).not.toContain('alan@example.com')
  })

  it('is bound to the session — a different attendee gets their own (FR-378)', async () => {
    const grace = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: GRACE, password: SEED_PASSWORD },
      }),
    ) as string

    const document = (await exportFor(grace)).json() as { account: { email: string } }

    expect(document.account.email).toBe(GRACE)
  })

  it('has no address in which another identifier could be named (FR-378)', async () => {
    // The strongest form of "MUST refuse any request naming another identifier" is a route with
    // nowhere to put one. A query parameter must change nothing.
    const document = (
      await app.inject({
        method: 'GET',
        url: '/profile/export?attendeeId=00000000-0000-4000-8000-000000000000',
        headers: { cookie: cookieHeader(ada) },
      })
    ).json() as { account: { email: string } }

    expect(document.account.email).toBe(ADA)
  })

  it('refuses an unauthenticated caller (FR-378)', async () => {
    const response = await app.inject({ method: 'GET', url: '/profile/export' })
    expect(response.statusCode).toBe(401)
  })

  it('is rate-limited (FR-379)', async () => {
    // An export is the most expensive request in the product — every table holding anything
    // about one person, plus an image. Nobody has a reason to want several a minute.
    let throttled = false
    for (let attempt = 0; attempt < 12 && !throttled; attempt += 1) {
      throttled = (await exportFor()).statusCode === 429
    }

    expect(throttled).toBe(true)
  })

  it('offers itself as a file rather than a wall of JSON', async () => {
    await clearThrottle()
    const response = await exportFor()

    // Machine-readable is the requirement (FR-373); usable is what makes it worth having.
    expect(response.headers['content-disposition']).toMatch(/attachment/)
    expect(response.headers['content-disposition']).toMatch(/\.json/)
  })

  it('produces a valid document for an attendee with no profile and no conference', async () => {
    // The edge case the specification names: an export for a brand-new account must describe an
    // account and nothing else, rather than failing.
    await clearThrottle()
    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email: 'empty-export@example.com', displayName: 'Empty', password: SEED_PASSWORD },
    })

    const document = (await exportFor(sessionCookieFrom(created) as string)).json() as Record<
      string,
      unknown
    >

    expect(document['account']).toMatchObject({ email: 'empty-export@example.com' })
    expect(document['profile']).toBeNull()
    expect(document['interests']).toEqual([])
    expect(document['registrations']).toEqual([])
    expect(document['avatar']).toBeNull()
  })
})
