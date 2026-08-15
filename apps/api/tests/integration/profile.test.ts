import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  ADA,
  clearThrottle,
  cookieHeader,
  ensureInterestOptions,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T067 (004) — the attendee's own profile (FR-334, FR-336, FR-340, FR-341).
 *
 * **T174 (014 tranche 2)** — a NEW interest is chosen from the vocabulary rather than typed
 * (FR-1088), so the values this file writes through `PUT /profile` are made choosable in
 * `beforeAll`. The behaviours under test — persistence, whole-profile semantics, deduplication —
 * are unchanged; only the fixture moved, because free text stopped being an input the route
 * accepts for values the attendee does not already hold (FR-1095b).
 */
describe("an attendee's own profile", () => {
  let app: FastifyInstance
  let ada: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    await ensureInterestOptions([
      'Numerical methods',
      'Poetry',
      'Concurrency',
      'Gone soon',
      'One',
      'Two',
      'Three',
      'Rust',
      // Lowercase too: matching is exact, never case-folded (FR-1095a), and the deduplication
      // test below deliberately submits both spellings.
      'rust',
      'Go',
    ])
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    const signedIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    ada = sessionCookieFrom(signedIn) as string
  })

  const as = (token = ada) => ({ cookie: cookieHeader(token) })

  const read = (token = ada) => app.inject({ method: 'GET', url: '/profile', headers: as(token) })

  const write = (body: Record<string, unknown>, token = ada) =>
    app.inject({ method: 'PUT', url: '/profile', headers: as(token), payload: body })

  const newAccount = async (email: string) => {
    const created = await app.inject({
      method: 'POST',
      url: '/auth/sign-up',
      payload: { email, displayName: 'Brand New', password: 'correct-horse-battery-staple' },
    })
    return sessionCookieFrom(created) as string
  }

  it('reads the seeded profile back in full', async () => {
    const response = await read()

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      displayName: 'Ada Lovelace',
      email: ADA,
      company: 'Analytical Engines',
      role: 'Principal Engineer',
      networkingIntent: 'open_to_meetings',
      availability: 'available',
    })
    expect((response.json() as { interests: string[] }).interests.length).toBeGreaterThan(0)
  })

  it('reads as EMPTY rather than 404 for an attendee who has written nothing (FR-341)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The ordinary condition of a new account. A 404 here would make the client render a
    // failure state for the most common state a profile is ever in, and "you have not written
    // one yet" is not an error.
    //
    // The profile row is created on first save, so "empty" has exactly one representation in
    // the database — there is no blank row that could also mean empty.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const token = await newAccount('empty-profile@example.com')
    const response = await read(token)

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      displayName: 'Brand New',
      company: null,
      role: null,
      headline: null,
      networkingIntent: null,
      availability: null,
      interests: [],
      hasAvatar: false,
    })
  })

  it('persists every field, and reads them back identically (SC-302)', async () => {
    const draft = {
      company: 'Difference Engines Ltd',
      role: 'Chief Analyst',
      headline: 'Notes on the Analytical Engine, mostly.',
      networkingIntent: 'open_to_messages',
      availability: 'busy',
      interests: ['Numerical methods', 'Poetry'],
    }

    const written = await write(draft)
    expect(written.statusCode).toBe(200)
    // Echoed in full, so the editor's state comes from a confirmed response rather than from
    // what it just sent.
    expect(written.json()).toMatchObject(draft)

    const reread = await read()
    expect(reread.json()).toMatchObject(draft)
  })

  it('survives a fresh session on another device (SC-302)', async () => {
    await write({ company: 'Second Device Co', interests: ['Concurrency'] })

    const otherDevice = sessionCookieFrom(
      await app.inject({
        method: 'POST',
        url: '/auth/sign-in',
        payload: { email: ADA, password: SEED_PASSWORD },
      }),
    ) as string

    const response = await read(otherDevice)
    expect(response.json()).toMatchObject({
      company: 'Second Device Co',
      interests: ['Concurrency'],
    })
  })

  it('clears a field that is omitted — whole-profile semantics (FR-334)', async () => {
    await write({ company: 'Temporary', role: 'Temporary', interests: ['Gone soon'] })

    // The client sends the complete profile, so an omitted field has exactly one meaning.
    const cleared = await write({ headline: 'Only this now' })

    expect(cleared.json()).toMatchObject({
      company: null,
      role: null,
      headline: 'Only this now',
      interests: [],
    })
  })

  it('treats a blank string as unset, so "no company" has one representation', async () => {
    const response = await write({ company: '   ', headline: '' })

    expect(response.json()).toMatchObject({ company: null, headline: null })
  })

  it('replaces interests rather than merging them', async () => {
    await write({ interests: ['One', 'Two', 'Three'] })
    const response = await write({ interests: ['Two'] })

    expect(
      (response.json() as { interests: string[] }).interests,
      'Removing an interest is expressed by sending the set without it. A merge would make ' +
        'removal impossible without a second verb.',
    ).toEqual(['Two'])
  })

  it('deduplicates interests rather than refusing them', async () => {
    const response = await write({ interests: ['Rust', 'rust ', ' Rust', 'Go'] })

    // The composite primary key deduplicates identical values anyway; trimming first means
    // ` Rust` and `Rust` are the same interest rather than two.
    const interests = (response.json() as { interests: string[] }).interests
    expect(interests).toContain('Go')
    expect(interests.filter((i) => i.toLowerCase() === 'rust').length).toBeLessThanOrEqual(2)
  })

  it('lets the owner read their own profile regardless of visibility (FR-340)', async () => {
    // An attendee who has turned discoverability off, or has not verified, must still be able
    // to read and edit their own profile — otherwise they could not fill it in.
    const token = await newAccount('invisible-to-others@example.com')

    const response = await read(token)
    expect(response.statusCode).toBe(200)
    expect((response.json() as { emailVerified: boolean }).emailVerified).toBe(false)
  })

  it('refuses an unauthenticated caller on both verbs (FR-386)', async () => {
    expect((await app.inject({ method: 'GET', url: '/profile' })).statusCode).toBe(401)
    expect(
      (await app.inject({ method: 'PUT', url: '/profile', payload: { company: 'X' } })).statusCode,
    ).toBe(401)
  })

  /**
   * T165 (014 tranche 2) — **a profile with EVERY taxonomy field empty saves, and every
   * destination stays usable** (SC-1019, FR-1091, FR-1097).
   *
   * FR-1091 is shipped FR-336 holding unchanged under the new fields: sector, subsector,
   * productive activity and vocabulary interests are all optional, an incomplete profile is
   * valid, and no capability is gated on completeness. The destination sweep below is what
   * makes "no capability" an observation rather than a sentence — each answers 200 for an
   * attendee whose taxonomy is entirely unset.
   */
  it('saves with every taxonomy field empty, and every destination stays usable (SC-1019)', async () => {
    const written = await write({ company: 'Analytical Engines' })
    expect(written.statusCode).toBe(200)
    expect(written.json()).toMatchObject({
      company: 'Analytical Engines',
      sector: null,
      subsector: null,
      productiveActivity: null,
      interests: [],
    })

    const eventsResponse = await app.inject({ method: 'GET', url: '/events', headers: as() })
    expect(eventsResponse.statusCode).toBe(200)
    const [event] = eventsResponse.json() as { id: string }[]
    expect(event, 'the seeded attendee is registered for no conference').toBeDefined()

    // One request per destination: Agenda's programme, Discover's directory, Messages'
    // conversation list, Network's held cards. Home composes from the same reads.
    for (const url of [
      `/events/${event!.id}/sessions`,
      `/events/${event!.id}/attendees`,
      '/conversations',
      '/cards/held',
    ]) {
      const response = await app.inject({ method: 'GET', url, headers: as() })
      expect(
        response.statusCode,
        `${url} did not answer 200 for an attendee with an empty taxonomy — a capability is ` +
          'gated on profile completeness (FR-1091)',
      ).toBe(200)
    }
  })

  it('never returns credential material (FR-376, FR-391)', async () => {
    const body = (await read()).body

    expect(body).not.toContain('argon2')
    expect(body).not.toContain('passwordHash')
    expect(body).not.toContain('password_hash')
    expect(body).not.toContain('tokenHash')
  })
})
