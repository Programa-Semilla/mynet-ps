import { count } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { bootstrapOperatorCredential } from '../../src/admin/bootstrap.js'
import { resetConfigForTests } from '../../src/config.js'
import { getDb } from '../../src/db/client.js'
import { attendees } from '../../src/db/schema/attendees.js'
import { operators } from '../../src/db/schema/operators.js'
import { ensureOperatorIdentities, SEED_OPERATORS } from '../../src/db/seed/operators.js'
import { resetDatabase, setupTestApp, teardown } from './helpers.js'

/**
 * T005 (012) — **an operator identity is obtainable against a database holding attendee rows,
 * and no attendee row is touched** (FR-1102, SC-1210).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **BEHAVIOURAL BY REQUIREMENT, NOT A SOURCE GREP.**
 *
 * SC-1210's subject is what happens to a real database: *"a platform operator credential can be
 * issued against a database holding attendee records, and the attendee row count is unchanged
 * afterwards."* A test asserting the command's source contains no `delete` would be the
 * assertion class this project keeps finding blind — FR-1052's number-search, the FR-1102a
 * claim itself, and the `it.skipIf` precache test all scored green while checking nothing. So
 * this drives `ensureOperatorIdentities` against the seeded database and counts rows.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the additive operator-identity command', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    // Reseeds per D19: files run in size order, and this file depends on the seeded fixture.
    app = await setupTestApp()
    await resetDatabase()
  })

  afterAll(async () => {
    await teardown(app)
  })

  it('inserts the identities on a database holding attendee rows without changing them (SC-1210)', async () => {
    const db = getDb()

    // The precondition SC-1210 names: attendee data is present.
    const [attendeesBefore] = await db.select({ value: count() }).from(attendees)
    expect(attendeesBefore?.value ?? 0).toBeGreaterThan(0)

    // Remove what the seed inserted so the additive path actually inserts. Deleting operators
    // alone is safe: the referencing tables are empty on a fresh seed.
    await db.delete(operators)

    await ensureOperatorIdentities(db)

    const [attendeesAfter] = await db.select({ value: count() }).from(attendees)
    expect(attendeesAfter?.value).toBe(attendeesBefore?.value)

    const rows = await db.select({ email: operators.email }).from(operators)
    expect(rows.map((r) => r.email).sort()).toEqual(
      SEED_OPERATORS.map((o) => o.email)
        .slice()
        .sort(),
    )
  })

  it('is a no-op on re-run and never throws over an operator who chose a credential (research R2)', async () => {
    const db = getDb()

    // The state the old table-wide self-check threw on: one operator holds a real credential.
    await db
      .update(operators)
      .set({ passwordHash: 'a-hash-somebody-chose', credentialIsInitial: false })

    const [attendeesBefore] = await db.select({ value: count() }).from(attendees)

    // The narrowed check must not see the existing credential (T003) …
    await expect(ensureOperatorIdentities(db)).resolves.toBeUndefined()

    // … and must not have reset it, created a duplicate, or touched an attendee. **The hash
    // and the flag are compared by VALUE, not counted** (deep-review tightening): a count of
    // non-null hashes would pass an upsert that kept the hash and flipped
    // `credential_is_initial` back to true — which re-arms the bootstrap's
    // `WHERE credential_is_initial = true` and makes its next run overwrite the operator's
    // chosen password: FR-993's exact catastrophe, arriving through this command instead.
    const rows = await db
      .select({ passwordHash: operators.passwordHash, initial: operators.credentialIsInitial })
      .from(operators)
    expect(rows).toHaveLength(SEED_OPERATORS.length)
    for (const row of rows) {
      expect(row.passwordHash).toBe('a-hash-somebody-chose')
      expect(row.initial).toBe(false)
    }

    const [operatorCount] = await db.select({ value: count() }).from(operators)
    expect(operatorCount?.value).toBe(SEED_OPERATORS.length)

    const [attendeesAfter] = await db.select({ value: count() }).from(attendees)
    expect(attendeesAfter?.value).toBe(attendeesBefore?.value)
  })

  it('issues a CREDENTIAL against a database holding attendee rows, count unchanged — the whole of SC-1210', async () => {
    // The first test proves the identity half; SC-1210's sentence is about ISSUANCE, and
    // `admin-bootstrap.test.ts` never references an attendee row — so without this, the
    // criterion's own verb had no attendee-invariance assertion anywhere (deep review).
    const db = getDb()

    await db.delete(operators)
    await ensureOperatorIdentities(db)

    const [attendeesBefore] = await db.select({ value: count() }).from(attendees)
    expect(attendeesBefore?.value ?? 0).toBeGreaterThan(0)

    process.env['ADMIN_BOOTSTRAP_EMAIL'] = SEED_OPERATORS[0].email
    process.env['ADMIN_BOOTSTRAP_PASSWORD'] = 'sc-1210-issued-credential'
    resetConfigForTests()
    try {
      const outcome = await bootstrapOperatorCredential()
      expect(outcome.status).toBe('credential-set')
    } finally {
      delete process.env['ADMIN_BOOTSTRAP_EMAIL']
      delete process.env['ADMIN_BOOTSTRAP_PASSWORD']
      resetConfigForTests()
    }

    const [attendeesAfter] = await db.select({ value: count() }).from(attendees)
    expect(attendeesAfter?.value).toBe(attendeesBefore?.value)
  })
})
