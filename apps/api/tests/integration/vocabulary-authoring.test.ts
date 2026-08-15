import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ADMIN_SESSION_COOKIE } from '../../src/admin/cookie.js'
import { hashPassword } from '../../src/auth/password.js'
import { getDb } from '../../src/db/client.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { operators } from '../../src/db/schema/operators.js'
import { attendeeInterests, attendeeProfiles } from '../../src/db/schema/profiles.js'
import { interestOptions, sectors, subsectors } from '../../src/db/schema/vocabulary.js'
import { ADA, attendees, clearThrottle, resetDatabase, setupTestApp, teardown } from './helpers.js'

/**
 * T169, T173, T175 (014 tranche 2) — **retire, never rewrite: what an operator may do to a value
 * attendees hold** (FR-1094, FR-1094a, FR-1094b, FR-1094c, FR-1089a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE INVARIANT UNDER EVERY ASSERTION HERE: NO VOCABULARY ACT WRITES TO ANY ATTENDEE RECORD.**
 *
 * Retirement withdraws a value from *future* choice and does nothing else — holders keep it, it
 * keeps displaying, it keeps ranking, and un-retiring needs no repair precisely because nothing
 * was ever written (FR-1094, FR-1094b). Renaming a held value is refused because it would change
 * what every holder's profile asserts about them **without writing to any attendee record** —
 * the same outcome FR-1093 forbids, reached by a route that looks like editing content
 * (FR-1094c). Deleting is refused while anybody holds the value, with retirement offered
 * instead — the delete-versus-cancel shape FR-1017 and FR-1019 already establish.
 *
 * Each act's refusal or success is asserted **alongside a byte-level read of the holder's own
 * row**, because "writes to no attendee record" is this row's half of T167 and a green refusal
 * with a silent write behind it would satisfy every other assertion in this file.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const OPERATOR_EMAIL = 'vocabulary-author@mynet.invalid'
const OPERATOR_PASSWORD = 'a-bootstrapped-operator-password'

describe('vocabulary authoring against held values (T169, T173)', () => {
  let app: FastifyInstance
  let platform: string
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
    await db.delete(adminAuditEntries)
    await db.delete(operators)
    // Rebuild the vocabulary to the seeded state between tests: this file renames, retires and
    // deletes sectors, and a fixture the previous test consumed is a fixture the next test
    // fails on for the wrong reason. Subsectors first — they reference sectors.
    await db.delete(subsectors)
    await db.delete(interestOptions)
    await db.delete(sectors)
    await db
      .insert(sectors)
      .values([
        { label: 'Servicios' },
        { label: 'Comercio' },
        { label: 'Industria' },
        { label: 'Agro' },
      ])
    // The interest one test attributes to Ada, removed so it cannot leak into another.
    await db.delete(attendeeInterests).where(eq(attendeeInterests.interest, 'Fintech'))

    await db.insert(operators).values({
      email: OPERATOR_EMAIL,
      displayName: 'Vocabulary Author',
      passwordHash: await hashPassword(OPERATOR_PASSWORD),
      credentialIsInitial: false,
    })

    adaId = (await db.select().from(attendees).where(eq(attendees.email, ADA)))[0]!.id
    // Ada holds the seeded sector "Servicios" — the held value every refusal below is about.
    await db
      .insert(attendeeProfiles)
      .values({ attendeeId: adaId, sector: 'Servicios' })
      .onConflictDoUpdate({
        target: attendeeProfiles.attendeeId,
        set: { sector: 'Servicios', subsector: null },
      })

    const signedIn = await app.inject({
      method: 'POST',
      url: '/admin/session',
      payload: { email: OPERATOR_EMAIL, password: OPERATOR_PASSWORD },
    })
    const cookie = signedIn.cookies.find((entry) => entry.name === ADMIN_SESSION_COOKIE)
    platform = `${ADMIN_SESSION_COOKIE}=${cookie?.value}`
  })

  const as = () => ({ cookie: platform })

  const sectorIdOf = async (label: string): Promise<string> =>
    (await getDb().select().from(sectors).where(eq(sectors.label, label)))[0]!.id

  const adaRow = async () =>
    (
      await getDb().select().from(attendeeProfiles).where(eq(attendeeProfiles.attendeeId, adaId))
    )[0]!

  it('refuses to rename a held value, naming that attendees hold it and offering retire-plus-create (FR-1094c)', async () => {
    const held = await sectorIdOf('Servicios')

    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/vocabulary/sectors/${held}`,
      headers: as(),
      payload: { label: 'Servicios y más' },
    })

    expect(response.statusCode).toBe(409)
    const body = response.json() as { code: string; message: string }
    expect(body.code).toBe('vocabulary_rename_held')
    // The refusal explains itself: attendees hold it, and the permitted route is stated.
    expect(body.message).toMatch(/hold/i)
    expect(body.message).toMatch(/retire/i)
    // Never who, and never how many: a number here would be a per-value census (FR-1099b).
    expect(body.message).not.toMatch(/\d/)

    // Nothing moved: not the value, and not the holder's row.
    expect((await getDb().select().from(sectors).where(eq(sectors.id, held)))[0]!.label).toBe(
      'Servicios',
    )
    expect((await adaRow()).sector).toBe('Servicios')
  })

  it('permits renaming a value nobody holds — correcting spelling stays possible (FR-1094c)', async () => {
    const unheld = await sectorIdOf('Agro')

    const response = await app.inject({
      method: 'PATCH',
      url: `/admin/vocabulary/sectors/${unheld}`,
      headers: as(),
      payload: { label: 'Agroindustria' },
    })

    expect(response.statusCode).toBe(200)
    expect((await getDb().select().from(sectors).where(eq(sectors.id, unheld)))[0]!.label).toBe(
      'Agroindustria',
    )
  })

  it('retires reversibly, writing to no attendee record (FR-1094, FR-1094b, T167)', async () => {
    const held = await sectorIdOf('Servicios')
    const before = await adaRow()

    const retired = await app.inject({
      method: 'POST',
      url: `/admin/vocabulary/sectors/${held}/retirement`,
      headers: as(),
    })
    expect(retired.statusCode).toBe(204)
    expect(
      (await getDb().select().from(sectors).where(eq(sectors.id, held)))[0]!.retiredAt,
    ).not.toBeNull()

    // The holder's row is untouched — same value, same everything, including the update stamp.
    // This is the byte-level half of "retirement writes to no attendee record".
    expect(await adaRow()).toEqual(before)

    // A retired value is not offered as a new choice anywhere (FR-1094a): the attendee-side
    // read stops listing it.
    const signedIn = await app.inject({
      method: 'POST',
      url: '/auth/sign-in',
      payload: { email: ADA, password: 'correct-horse-battery-staple' },
    })
    const cookie = signedIn.cookies.find((entry) => entry.name === 'mynet_session')
    const choosable = await app.inject({
      method: 'GET',
      url: '/vocabulary',
      headers: { cookie: `mynet_session=${cookie?.value}` },
    })
    expect(
      (choosable.json() as { sectors: { label: string }[] }).sectors.map((s) => s.label),
    ).not.toContain('Servicios')

    // And un-retiring restores choosability with no repair, because nothing was written.
    const unretired = await app.inject({
      method: 'DELETE',
      url: `/admin/vocabulary/sectors/${held}/retirement`,
      headers: as(),
    })
    expect(unretired.statusCode).toBe(204)
    expect(
      (await getDb().select().from(sectors).where(eq(sectors.id, held)))[0]!.retiredAt,
    ).toBeNull()
    expect(await adaRow()).toEqual(before)
  })

  it('refuses outright deletion while any attendee holds the value, offering retirement (FR-1094)', async () => {
    const held = await sectorIdOf('Servicios')

    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/vocabulary/sectors/${held}`,
      headers: as(),
    })

    expect(response.statusCode).toBe(409)
    const body = response.json() as { code: string; message: string }
    expect(body.code).toBe('vocabulary_delete_held')
    expect(body.message).toMatch(/hold/i)
    expect(body.message).toMatch(/retire/i)
    expect(body.message).not.toMatch(/\d/)

    expect((await getDb().select().from(sectors).where(eq(sectors.id, held))).length).toBe(1)
    expect((await adaRow()).sector).toBe('Servicios')
  })

  it('deletes a value nobody holds outright, and a held interest is protected the same way', async () => {
    const unheld = await sectorIdOf('Comercio')
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/admin/vocabulary/sectors/${unheld}`,
      headers: as(),
    })
    expect(deleted.statusCode).toBe(204)
    expect((await getDb().select().from(sectors).where(eq(sectors.id, unheld))).length).toBe(0)

    // The same protection covers an interest an attendee holds — including one they held as
    // retained free text before the vocabulary ever listed it (label match, FR-1094).
    await getDb().insert(attendeeInterests).values({ attendeeId: adaId, interest: 'Fintech' })
    const created = await app.inject({
      method: 'POST',
      url: '/admin/vocabulary/interests',
      headers: as(),
      payload: { label: 'Fintech' },
    })
    expect(created.statusCode).toBe(201)
    const interestId = (created.json() as { id: string }).id

    const refused = await app.inject({
      method: 'DELETE',
      url: `/admin/vocabulary/interests/${interestId}`,
      headers: as(),
    })
    expect(refused.statusCode).toBe(409)
    expect((refused.json() as { code: string }).code).toBe('vocabulary_delete_held')
  })

  it('refuses a subsector under a retired sector, and a duplicate label, each with its own code (FR-1087)', async () => {
    const agro = await sectorIdOf('Agro')

    const first = await app.inject({
      method: 'POST',
      url: '/admin/vocabulary/subsectors',
      headers: as(),
      payload: { sectorId: agro, label: 'Ganadería' },
    })
    expect(first.statusCode).toBe(201)

    const duplicate = await app.inject({
      method: 'POST',
      url: '/admin/vocabulary/subsectors',
      headers: as(),
      payload: { sectorId: agro, label: 'Ganadería' },
    })
    expect(duplicate.statusCode).toBe(409)
    expect((duplicate.json() as { code: string }).code).toBe('vocabulary_label_taken')

    await app.inject({
      method: 'POST',
      url: `/admin/vocabulary/sectors/${agro}/retirement`,
      headers: as(),
    })
    const underRetired = await app.inject({
      method: 'POST',
      url: '/admin/vocabulary/subsectors',
      headers: as(),
      payload: { sectorId: agro, label: 'Pesca' },
    })
    expect(underRetired.statusCode).toBe(409)
    expect((underRetired.json() as { code: string }).code).toBe('sector_retired')
  })

  it('refuses to delete a sector that still has subsectors, with its own code', async () => {
    const agro = await sectorIdOf('Agro')
    await app.inject({
      method: 'POST',
      url: '/admin/vocabulary/subsectors',
      headers: as(),
      payload: { sectorId: agro, label: 'Ganadería' },
    })

    const refused = await app.inject({
      method: 'DELETE',
      url: `/admin/vocabulary/sectors/${agro}`,
      headers: as(),
    })
    expect(refused.statusCode).toBe(409)
    expect((refused.json() as { code: string }).code).toBe('sector_has_subsectors')
  })

  it('writes an audit entry for every vocabulary act, under the three declared actions (FR-1089a, T175)', async () => {
    const agro = await sectorIdOf('Agro')

    await app.inject({
      method: 'POST',
      url: '/admin/vocabulary/interests',
      headers: as(),
      payload: { label: 'Logística' },
    })
    await app.inject({
      method: 'PATCH',
      url: `/admin/vocabulary/sectors/${agro}`,
      headers: as(),
      payload: { label: 'Agroindustria' },
    })
    await app.inject({
      method: 'POST',
      url: `/admin/vocabulary/sectors/${agro}/retirement`,
      headers: as(),
    })
    await app.inject({
      method: 'DELETE',
      url: `/admin/vocabulary/sectors/${agro}/retirement`,
      headers: as(),
    })
    const comercio = await sectorIdOf('Comercio')
    await app.inject({
      method: 'DELETE',
      url: `/admin/vocabulary/sectors/${comercio}`,
      headers: as(),
    })

    const entries = await getDb().select().from(adminAuditEntries)
    const actions = entries.map((entry) => entry.action)

    // Create and rename record authorship; retire and un-retire share a subject and an action
    // with the direction in the record; deletion is its own act because it is the one that is
    // not reversible (`schema/admin-audit.ts`).
    expect(actions.filter((action) => action === 'write_vocabulary').length).toBe(2)
    expect(actions.filter((action) => action === 'retire_vocabulary_value').length).toBe(2)
    expect(actions.filter((action) => action === 'delete_vocabulary_value').length).toBe(1)

    // Every entry names the acting operator and no attendee: the subject is a vocabulary value.
    for (const entry of entries) {
      expect(entry.operatorId).not.toBeNull()
      expect(entry.subjectAttendeeId).toBeNull()
    }
  })
})
