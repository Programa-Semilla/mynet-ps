import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { addressTakenByOtherPrincipal } from '../../src/admin/identity.js'
// Minted directly, because these tests drive the query layer with the route bypassed — which is
// the only way to prove the lock and the unique constraint rather than the handler around them.
// `admin-scope-brand.test.ts`'s sole-importer assertion scans `src/` alone, deliberately: a test
// fabricating a scope proves nothing about what a request can reach.
import { mintPlatformScope } from '../../src/admin/scope.js'
import { getDb } from '../../src/db/client.js'
import { removeQuestion } from '../../src/db/queries/admin-moderation.js'
import { adminAuditEntries } from '../../src/db/schema/admin-audit.js'
import { sessions } from '../../src/db/schema/catalog.js'
import { operators } from '../../src/db/schema/operators.js'
import { organizerAssignments } from '../../src/db/schema/organizer-assignments.js'
import { questionVotes, sessionQuestions } from '../../src/db/schema/questions.js'
import { reportResolutions } from '../../src/db/schema/report-resolutions.js'
import { abuseReports } from '../../src/db/schema/reports.js'
import { ADA, attendees, GRACE, setupTestApp, teardown } from './helpers.js'

/**
 * T049, T101 (013) — **the two properties no layer but a real database can test.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * Both are races, and both are the kind that pass a hundred sequential runs before failing once
 * in production. They are driven concurrently on purpose: a sequential version of either would
 * assert the happy path and report green about the thing that matters.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * A platform scope for the query-layer calls below. The removal tests assert a *database*
 * property, so the operator behind the scope is immaterial — what matters is that the query now
 * refuses an unbranded value, which `admin-scope-brand.test.ts` covers directly.
 */
const SCOPE = mintPlatformScope('00000000-0000-4000-8000-0000000000aa')

describe('administrative concurrency', () => {
  let app: FastifyInstance
  let adaId: string
  let graceId: string
  let sessionId: string

  beforeAll(async () => {
    app = await setupTestApp()
  })

  afterAll(async () => {
    await teardown(app)
  })

  beforeEach(async () => {
    const db = getDb()
    await db.delete(adminAuditEntries)
    await db.delete(reportResolutions)
    await db.delete(abuseReports)
    await db.delete(organizerAssignments)
    await db.delete(operators)
    await db.delete(questionVotes)
    await db.delete(sessionQuestions)

    adaId = (await db.select().from(attendees).where(eq(attendees.email, ADA)))[0]!.id
    graceId = (await db.select().from(attendees).where(eq(attendees.email, GRACE)))[0]!.id
    sessionId = (await db.select().from(sessions).limit(1))[0]!.id
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T101 — A VOTE ARRIVING MID-REMOVAL BLOCKS ON `FOR UPDATE` RATHER THAN LANDING ON A
   * REMOVED ROW** (research R7).
   *
   * Inserting a vote takes a `FOR KEY SHARE` lock on its parent question, and `FOR UPDATE`
   * conflicts with it. So a vote arriving while an operator removes the question waits until the
   * removal commits, and is then refused by the foreign key against a row that is already gone.
   *
   * **The failure mode without the lock is not a lost vote.** It is a foreign-key violation
   * surfacing as a 500 on an *attendee's* upvote, caused by an administrative action they cannot
   * see — which is why this is driven rather than reasoned about. 009 wrote the same test for
   * withdrawal, where the actor is the question's own author; this is that reasoning with the
   * actor swapped.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('blocks a vote arriving mid-removal rather than orphaning it (research R7)', async () => {
    const db = getDb()

    const [question] = await db
      .insert(sessionQuestions)
      .values({ sessionId, attendeeId: graceId, body: 'About to be removed.' })
      .returning({ id: sessionQuestions.id })

    // Fired together. Whichever wins, the outcome must be consistent: either the vote lands and
    // is then removed with the question, or it is refused — never a vote row pointing at nothing.
    const [removal, vote] = await Promise.allSettled([
      removeQuestion(SCOPE, question!.id),
      db.insert(questionVotes).values({ questionId: question!.id, attendeeId: adaId }),
    ])

    expect(removal.status, 'the removal itself failed').toBe('fulfilled')
    if (removal.status === 'fulfilled') expect(removal.value).toBe('removed')

    // The question is gone either way.
    expect(await db.select().from(sessionQuestions)).toEqual([])

    // ─────────────────────────────────────────────────────────────────────────────────────
    // **The assertion that matters: no orphaned vote.** If the vote succeeded it was taken by
    // the cascade; if it failed it never landed. What must never exist is a `question_votes` row
    // whose parent is gone — which is what the foreign key plus the lock together prevent.
    // ─────────────────────────────────────────────────────────────────────────────────────
    const orphans = await db.select().from(questionVotes)
    expect(
      orphans,
      `A vote survived the removal of its question (the insert ${vote.status}). Without ` +
        '`SELECT … FOR UPDATE` the vote and the delete interleave, and the visible symptom is a ' +
        'foreign-key violation surfacing as a 500 on an attendee’s upvote (research R7).',
    ).toEqual([])
  })

  it('removes a question with many votes atomically, taking all of them', async () => {
    const db = getDb()
    const [question] = await db
      .insert(sessionQuestions)
      .values({ sessionId, attendeeId: graceId, body: 'Widely backed.' })
      .returning({ id: sessionQuestions.id })

    await db.insert(questionVotes).values([
      { questionId: question!.id, attendeeId: adaId },
      { questionId: question!.id, attendeeId: graceId },
    ])

    expect(await removeQuestion(SCOPE, question!.id)).toBe('removed')
    expect(await db.select().from(questionVotes)).toEqual([])
  })

  it('answers not-found for a malformed identifier exactly as for a missing one', async () => {
    // Matched rather than parsed, so a malformed identifier is refused identically to a
    // well-formed one naming nothing — `plugins/participation.ts`'s rule, applied here.
    expect(await removeQuestion(SCOPE, 'not-a-uuid')).toBe('not-found')
    expect(await removeQuestion(SCOPE, '00000000-0000-4000-8000-000000000000')).toBe('not-found')
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T049 — FR-918's CROSS-TABLE UNIQUENESS IS APPLICATION-ENFORCED, WHICH IS A GENUINE
   * WEAKNESS, AND THIS IS WHERE IT IS MEASURED RATHER THAN REASONED ABOUT.**
   *
   * Postgres cannot express uniqueness across two tables with a constraint, and every other
   * uniqueness rule in this product is database-enforced. `data-model.md` and plan.md's
   * Complexity Tracking both record it as a real weakness rather than hiding it.
   *
   * It matters because **FR-915 depends on it**: an address must identify at most one principal
   * product-wide, which is what makes administrative sign-in a single lookup with no branch for
   * an observer to time. If an address could name both an attendee and an operator, resolution
   * would have to *choose* — and the choice would be observable.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('sees an attendee’s address as taken when creating an operator (FR-918)', async () => {
    expect(
      await addressTakenByOtherPrincipal(ADA, 'operator'),
      'creating an operator with an attendee’s address was not refused (FR-918). One address ' +
        'must identify at most one principal product-wide, or administrative sign-in cannot be ' +
        'the single lookup FR-915 requires.',
    ).toBe(true)

    // Case-insensitively, because `citext` is what the columns use and an address differing only
    // in case is the same address.
    expect(await addressTakenByOtherPrincipal(ADA.toUpperCase(), 'operator')).toBe(true)

    // Surrounding whitespace is normalised, matching every other address path in the product.
    expect(await addressTakenByOtherPrincipal(`  ${ADA}  `, 'operator')).toBe(true)
  })

  it('sees an operator’s address as taken when creating an attendee (FR-918)', async () => {
    await getDb()
      .insert(operators)
      .values({ email: 'contended@mynet.invalid', displayName: 'Contended' })

    expect(await addressTakenByOtherPrincipal('contended@mynet.invalid', 'attendee')).toBe(true)
    expect(await addressTakenByOtherPrincipal('CONTENDED@MYNET.INVALID', 'attendee')).toBe(true)
    expect(await addressTakenByOtherPrincipal('nobody@mynet.invalid', 'attendee')).toBe(false)
  })

  /**
   * **Driven concurrently**, because the sequential case is the one that always worked.
   *
   * Two operator inserts of the same address race: the `operators.email` unique index serialises
   * them, so exactly one lands. That is the half a constraint *can* cover, and it is asserted
   * here so the boundary between what the database enforces and what the application does is
   * legible rather than assumed.
   */
  it('lets exactly one of two concurrent inserts of the same address survive', async () => {
    const db = getDb()
    const email = `raced-${Date.now()}@mynet.invalid`

    const results = await Promise.allSettled([
      db.insert(operators).values({ email, displayName: 'First' }),
      db.insert(operators).values({ email, displayName: 'Second' }),
    ])

    expect(
      results.filter((result) => result.status === 'fulfilled').length,
      'both concurrent inserts of the same operator address succeeded, so `operators.email` is ' +
        'no longer unique — and administrative sign-in would have two rows to choose between.',
    ).toBe(1)

    const rows = await db.select().from(operators).where(eq(operators.email, email))
    expect(rows.length).toBe(1)
  })

  /**
   * **A second resolution of the same report loses the race rather than overwriting** (FR-945).
   *
   * The sequential case is in `admin-tier-boundary.test.ts`. This is the concurrent one, and it
   * is the reason `report_id` is unique rather than the route checking first: a read-then-write
   * check narrows this window and does not close it.
   */
  it('lets exactly one of two concurrent resolutions land (FR-945)', async () => {
    const db = getDb()
    const [operator] = await db
      .insert(operators)
      .values({ email: `race-op-${Date.now()}@mynet.invalid`, displayName: 'Racing Operator' })
      .returning({ id: operators.id })

    const [report] = await db
      .insert(abuseReports)
      .values({
        reporterId: adaId,
        reportedId: graceId,
        reason: 'Reported.',
        messageIds: [],
        questionIds: [],
      })
      .returning({ id: abuseReports.id })

    const { resolveReport } = await import('../../src/db/queries/admin-reports.js')

    const outcomes = await Promise.all([
      resolveReport(mintPlatformScope(operator!.id), {
        reportId: report!.id,
        outcome: 'dismissed',
        note: 'The first.',
      }),
      resolveReport(mintPlatformScope(operator!.id), {
        reportId: report!.id,
        outcome: 'actioned',
        note: 'The second.',
      }),
    ])

    expect(
      outcomes.filter((outcome) => outcome === 'resolved').length,
      'both concurrent resolutions landed. `report_resolutions.report_id` is unique precisely ' +
        'so the second is a duplicate-key violation rather than a read-then-write race (FR-945).',
    ).toBe(1)
    expect(outcomes).toContain('already_resolved')

    expect((await db.select().from(reportResolutions)).length).toBe(1)
  })
})
