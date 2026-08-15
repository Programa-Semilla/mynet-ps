import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { attendeeInterests, attendeeProfiles } from '../../src/db/schema/profiles.js'
import { interestOptions, sectors, subsectors } from '../../src/db/schema/vocabulary.js'
import {
  ADA,
  attendees,
  clearThrottle,
  cookieHeader,
  resetDatabase,
  SEED_PASSWORD,
  sessionCookieFrom,
  setupTestApp,
  teardown,
} from './helpers.js'

/**
 * T168, T174 (014 tranche 2) — **membership is enforced at the profile write, as the union of
 * the choosable and the held** (FR-1095b, FR-1087, FR-1088, R18).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **FR-1095b IN ONE SENTENCE: WHAT MAY BE ADDED IS CONTROLLED; WHAT MAY BE KEPT IS EVERYTHING
 * THE ATTENDEE ALREADY HOLDS.**
 *
 * A profile write must accept every value the writing attendee already holds — retained free
 * text from before the vocabulary existed, and retired vocabulary values alike — and refuse
 * only values that are neither held by that attendee nor currently choosable. Without the held
 * half, an attendee holding a retired value could not save an unrelated change to their own
 * profile; without the choosable half, FR-1088's chosen-not-typed rule has no enforcement.
 *
 * There is no foreign key behind any of this (R18): the checks run in `writeOwnProfile`
 * against labels, which is what keeps `attendee_interests` untouched and the exact-match
 * ranking exact.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

describe('vocabulary membership at the profile write (T168, T174)', () => {
  let app: FastifyInstance
  let ada: string
  let adaId: string

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    await clearThrottle()
    const db = getDb()

    // The vocabulary this file writes against, rebuilt per test. "Servicios" carries a live
    // subsector and a retired one; "Industria" is retired outright; one interest is choosable.
    await db.delete(subsectors)
    await db.delete(interestOptions)
    await db.delete(sectors)
    const inserted = await db
      .insert(sectors)
      .values([
        { label: 'Servicios' },
        { label: 'Comercio' },
        { label: 'Industria', retiredAt: new Date() },
        { label: 'Agro' },
      ])
      .returning({ id: sectors.id, label: sectors.label })
    const servicios = inserted.find((sector) => sector.label === 'Servicios')!
    const comercio = inserted.find((sector) => sector.label === 'Comercio')!
    await db.insert(subsectors).values([
      { sectorId: servicios.id, label: 'Consultoría' },
      { sectorId: servicios.id, label: 'Turismo', retiredAt: new Date() },
      { sectorId: comercio.id, label: 'Minorista' },
    ])
    await db.insert(interestOptions).values([{ label: 'Fintech' }])

    adaId = (await getDb().select().from(attendees).where(eq(attendees.email, ADA)))[0]!.id
    // Ada starts each test with a clean slate: no taxonomy selections, seeded interests only.
    await db.delete(attendeeInterests).where(eq(attendeeInterests.attendeeId, adaId))
    await db.insert(attendeeInterests).values([{ attendeeId: adaId, interest: 'Legacy free text' }])
    await db
      .insert(attendeeProfiles)
      .values({ attendeeId: adaId })
      .onConflictDoUpdate({
        target: attendeeProfiles.attendeeId,
        set: { sector: null, subsector: null, productiveActivity: null },
      })

    const signedIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: SEED_PASSWORD },
    })
    ada = sessionCookieFrom(signedIn) as string
  })

  const write = (body: Record<string, unknown>) =>
    app.inject({
      method: 'PUT',
      url: '/profile',
      headers: { cookie: cookieHeader(ada) },
      payload: body,
    })

  it('accepts a choosable sector, subsector and interest, and reads them back (FR-1090)', async () => {
    const response = await write({
      sector: 'Servicios',
      subsector: 'Consultoría',
      productiveActivity: 'Asesoría contable para pymes.',
      interests: ['Fintech'],
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      sector: 'Servicios',
      subsector: 'Consultoría',
      productiveActivity: 'Asesoría contable para pymes.',
      interests: ['Fintech'],
    })
  })

  it('accepts every value the attendee already holds, retired or not (FR-1095b)', async () => {
    const db = getDb()
    // Ada already holds a sector and subsector that have since been retired, plus retained
    // free text — the exact state FR-1095b exists for.
    await db
      .update(attendeeProfiles)
      .set({ sector: 'Servicios', subsector: 'Turismo' })
      .where(eq(attendeeProfiles.attendeeId, adaId))

    // Saving an UNRELATED change re-submits the whole profile (whole-profile semantics), so a
    // held-value check that only accepted choosable values would block this save outright.
    const response = await write({
      company: 'Naves del Sur',
      sector: 'Servicios',
      subsector: 'Turismo',
      interests: ['Legacy free text'],
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      company: 'Naves del Sur',
      sector: 'Servicios',
      subsector: 'Turismo',
      interests: ['Legacy free text'],
    })
  })

  it('accepts a held retired sector even when the sector row is retired (FR-1094a)', async () => {
    await getDb()
      .update(attendeeProfiles)
      .set({ sector: 'Industria' })
      .where(eq(attendeeProfiles.attendeeId, adaId))

    const response = await write({ sector: 'Industria' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ sector: 'Industria' })
  })

  it('refuses a sector that is neither held nor choosable, with its own code', async () => {
    const retired = await write({ sector: 'Industria' })
    expect(retired.statusCode).toBe(400)
    expect((retired.json() as { code: string }).code).toBe('sector_not_choosable')

    const invented = await write({ sector: 'Minería' })
    expect(invented.statusCode).toBe(400)
    expect((invented.json() as { code: string }).code).toBe('sector_not_choosable')
  })

  it('refuses a subsector that is neither held nor choosable, with its own code', async () => {
    // "Turismo" exists and is retired; Ada does not hold it, so it is not on offer (FR-1094a).
    const response = await write({ sector: 'Servicios', subsector: 'Turismo' })
    expect(response.statusCode).toBe(400)
    expect((response.json() as { code: string }).code).toBe('subsector_not_choosable')
  })

  it('refuses moving the sector out from under a held subsector (FR-1095b, FR-1087)', async () => {
    // The spec's named edge case, where the two rules pull opposite ways. Ada holds the PAIR
    // (Servicios, Turismo) — written while choosable, since retired — so FR-1095b says accept
    // everything she holds, and FR-1087 says a subsector must belong to the chosen sector.
    // Held pairs count only AS A PAIR (`holdsPair` in `writeOwnProfile`): what Ada holds is
    // "Turismo under Servicios", not "Turismo" free-floating. Submitting the held subsector
    // under a DIFFERENT sector is therefore a fresh choice, not a retained one, and a fresh
    // choice must pass membership — which "Turismo under Comercio" does not.
    const db = getDb()
    await db
      .update(attendeeProfiles)
      .set({ sector: 'Servicios', subsector: 'Turismo' })
      .where(eq(attendeeProfiles.attendeeId, adaId))

    const response = await write({ sector: 'Comercio', subsector: 'Turismo' })
    expect(response.statusCode).toBe(400)
    expect((response.json() as { code: string }).code).toBe('subsector_outside_sector')

    // And nothing moved: the held pair survives the refused save whole.
    const [row] = await db
      .select({ sector: attendeeProfiles.sector, subsector: attendeeProfiles.subsector })
      .from(attendeeProfiles)
      .where(eq(attendeeProfiles.attendeeId, adaId))
    expect(row).toEqual({ sector: 'Servicios', subsector: 'Turismo' })
  })

  it('refuses a subsector outside the submitted sector, with its own code (FR-1087)', async () => {
    // "Minorista" is a real, choosable subsector — of Comercio, not of Servicios. The refusal
    // is a different fact from "no such subsector" and carries a different code, because the
    // next step is different: pick a subsector of your sector, not a different subsector.
    const response = await write({ sector: 'Servicios', subsector: 'Minorista' })
    expect(response.statusCode).toBe(400)
    expect((response.json() as { code: string }).code).toBe('subsector_outside_sector')
  })

  it('refuses a subsector with no sector at all (FR-1087)', async () => {
    const response = await write({ subsector: 'Consultoría' })
    expect(response.statusCode).toBe(400)
    expect((response.json() as { code: string }).code).toBe('subsector_outside_sector')
  })

  it('refuses a typed interest that is neither held nor choosable (FR-1088)', async () => {
    const response = await write({ interests: ['Legacy free text', 'Something invented'] })
    expect(response.statusCode).toBe(400)
    expect((response.json() as { code: string }).code).toBe('interest_not_choosable')

    // And nothing was written: the held set survives a refused save intact.
    const held = await getDb()
      .select()
      .from(attendeeInterests)
      .where(eq(attendeeInterests.attendeeId, adaId))
    expect(held.map((row) => row.interest)).toEqual(['Legacy free text'])
  })

  it('lets a save omit a held value, which removes it — whole-profile semantics unchanged', async () => {
    await write({ sector: 'Servicios', subsector: 'Consultoría', interests: ['Fintech'] })

    // The next save omits everything: the taxonomy fields clear exactly as company does. This
    // is the behaviour that makes the editor's present-and-removable rule (FR-1095b's editor
    // half) load-bearing — a held value silently dropped from the form IS a removal.
    const cleared = await write({})
    expect(cleared.statusCode).toBe(200)
    expect(cleared.json()).toMatchObject({
      sector: null,
      subsector: null,
      productiveActivity: null,
      interests: [],
    })
  })
})
