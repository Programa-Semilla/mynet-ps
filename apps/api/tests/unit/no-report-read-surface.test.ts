import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T073 (007) — **nothing in MYNET may read a report** (FR-548, SC-508, and now FR-972).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T151 (011) — THIS GUARD IS NARROWED TO THE ATTENDEE PRODUCT, AND THE NARROWING IS THE
 * SINGLE MOST DELICATE CHANGE THIS FEATURE MAKES TO ANOTHER FEATURE'S TEST.**
 *
 * It used to say *nothing in this product may read a report*, on the reasoning that a
 * report-reading screen needs a moderator, and a moderator is an organizer — the actor
 * Principle III excluded by construction.
 *
 * **That reasoning was correct and its premise is gone.** Constitution v4.0.0 reversed the
 * exclusion, and this table is one of the two obligations that *forced* the reversal: register
 * entry 21 records that the reporting dialog has promised a human reader since 007 shipped, and
 * for the whole life of this project no such human existed. An exclusion whose cost is an
 * unkeepable safety promise must be paid for or reversed.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **WHAT SURVIVES IS EVERYTHING EXCEPT THE ONE ROUTE GROUP v4.1.0 NAMED.**
 *
 * FR-972 keeps FR-548 in force for MyNet, and decision 38 bounds the new read on four sides:
 * the administrative product only, the platform tier only, only what was reported, and the
 * reporter still told nothing. This file now enforces the first of those — every assertion
 * below excludes `apps/api/src/routes/admin/` and `apps/api/src/db/queries/admin-reports.ts`
 * **by exact path**, and nothing else.
 *
 * **The narrowing is by PATH, not by weakening a pattern.** 009 recorded that weakening the
 * pattern until it passes is the natural wrong repair, and it applies exactly here: relaxing
 * `/report/i` to something that happens not to match the new routes would stop catching a
 * `GET /reports` added to the attendee surface tomorrow. Two named exclusions leave the guard
 * as strong as it was everywhere it still applies.
 *
 * **A reviewer looking for a report-reading surface in `apps/web` or in the attendee API should
 * still find nothing, and finding nothing is still the pass condition.**
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/**
 * The administrative surface, excluded by exact path.
 *
 * Two entries and no wildcards beyond the directory itself. Every other file in `routes/` and
 * `db/queries/` is still checked, so a report read added to the attendee surface fails exactly
 * as it did before this feature.
 */
const ADMINISTRATIVE_ROUTE_PREFIX = /^\/admin(\/|$)/
const ADMINISTRATIVE_QUERY_MODULE = 'admin-reports.ts'
const ADMINISTRATIVE_ROUTE_DIRECTORY = 'admin'

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

const sourceIn = (directory: string, predicate: (name: string) => boolean): string =>
  readdirSync(directory)
    .filter(predicate)
    .map((name) => readFileSync(join(directory, name), 'utf8'))
    .join('\n')

describe('no report can be read from inside this product (FR-548)', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found routes to audit', () => {
    // A gate that cannot fail is not a gate.
    expect(routes.length).toBeGreaterThan(5)
  })

  it('the write route exists, so the absences below are about reading and not about reports', () => {
    const writes = routes.filter(
      (route) => route.url === '/reports' && methodsOf(route).includes('POST'),
    )
    expect(writes.length, 'a report can be filed — that is the capability this bounds').toBe(1)
  })

  it('EXPOSES NO ROUTE THAT READS A REPORT, BY ANY METHOD OR ADDRESS', () => {
    const readable = routes
      .filter((route) => /report/i.test(route.url))
      // T151 (011) — the administrative queue is the one permitted reader (decision 38). Every
      // attendee-facing address is still checked.
      .filter((route) => !ADMINISTRATIVE_ROUTE_PREFIX.test(route.url))
      .filter((route) => !methodsOf(route).every((method) => method === 'POST'))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      readable,
      'A report-reading route exists on the ATTENDEE surface. FR-972 keeps FR-548 in force for ' +
        'MyNet: the queue exists only in the administrative product, only for the platform ' +
        'tier, and the reporter is still promised nothing they can observe (FR-946).',
    ).toEqual([])
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T151 (011) — THIS ASSERTION IS INVERTED RATHER THAN DELETED, AND THAT IS THE POINT.**
   *
   * It used to say *no administrative address of any kind exists*, on the reasoning that the
   * failure mode was not "somebody adds `GET /reports`" but "somebody adds an administrative
   * area, of which a report list is the first tenant."
   *
   * There is now an administrative area, deliberately, and deleting the assertion would lose the
   * guarantee it was actually protecting. What that guarantee reduces to, after v4.0.0, is:
   * **an administrative address must live under `/admin` and nowhere else.**
   *
   * That matters because the alternative is administrative capability leaking into the attendee
   * route tree under some other name — `/moderation/…`, `/internal/…`, `/staff/…` — where the
   * fourth route audit, which matches on the `/admin` prefix, would never examine it. An
   * administrative route outside `/admin` is a route with no guard checking it at all.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  it('exposes no administrative address outside the /admin prefix', () => {
    const misplaced = routes
      .filter((route) => /\/(moderation|moderator|operator|staff|internal)\b/i.test(route.url))
      .filter((route) => !ADMINISTRATIVE_ROUTE_PREFIX.test(route.url))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      misplaced,
      'An administrative address exists outside `/admin`. `operator-audit.test.ts` — the only ' +
        'guard covering administrative routes — matches on that prefix, so a route here is ' +
        'examined by nothing at all. Move it under `/admin` (FR-905).',
    ).toEqual([])
  })

  it('the query layer exports no way to read one', () => {
    const source = sourceIn(
      join(import.meta.dirname, '../../src/db/queries'),
      (name) => name === 'reports.ts',
    )

    const exported = [...source.matchAll(/export const (\w+)/g)].map((match) => match[1] as string)
    const readers = exported.filter((name) => /^(get|list|find|count|read|search)/i.test(name))

    expect(
      readers,
      'A read function in `queries/reports.ts` is the first half of a moderation screen. ' +
        '`pruneExpiredReports` is not one: it selects nothing and returns nothing.',
    ).toEqual([])
  })

  it('the query layer contains no SELECT against the reports table', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Function names are the easy half. This is the harder one: a `SELECT … FROM abuse_reports`
    // hidden inside a function called something else — a "statistics" query, a health check, a
    // count on a dashboard — reads the table just as much.
    //
    // The **export** query is the one legitimate reader, and it is deliberately not here: it
    // lives in `queries/account.ts` and returns only the reports the *requester filed*, which is
    // their own record rather than a moderation surface (FR-548's prohibition is on reading
    // reports *about* people from inside the product).
    // ───────────────────────────────────────────────────────────────────────────────────────
    const directory = join(import.meta.dirname, '../../src/db/queries')
    const offending = readdirSync(directory)
      .filter((name) => name !== 'account.ts')
      // T151 (011) — the administrative queue module, excluded by exact filename. It is the
      // permitted reader under decision 38, and `queries/reports.ts` — 007's module — is still
      // checked and is still write-and-sweep only.
      .filter((name) => name !== ADMINISTRATIVE_QUERY_MODULE)
      .filter((name) => {
        const source = readFileSync(join(directory, name), 'utf8')
        return /select[\s\S]{0,200}from\s+abuse_reports/i.test(source)
      })

    expect(
      offending,
      'A SELECT against `abuse_reports` outside the personal-data export. The export returns ' +
        'only the reports the requester filed, which is their own record; anything else is a ' +
        'moderation surface by another name.',
    ).toEqual([])
  })

  it('no route file anywhere selects from the reports table', () => {
    const walk = (directory: string): string[] =>
      readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(join(directory, entry.name)) : [join(directory, entry.name)],
      )

    const offending = walk(join(import.meta.dirname, '../../src/routes'))
      // T151 (011) — the administrative route group, excluded by directory. Every attendee
      // route file is still checked, which is where a report read would actually erode.
      .filter((file) => !file.split('/').includes(ADMINISTRATIVE_ROUTE_DIRECTORY))
      .filter((file) => /abuse_reports|abuseReports/.test(readFileSync(file, 'utf8')))

    expect(
      offending.map((file) => file.split('/').slice(-2).join('/')),
      'An ATTENDEE route reaches the reports table directly, bypassing the query layer this ' +
        'test guards. The administrative queue reads it through `queries/admin-reports.ts`, ' +
        'where the four bounds of decision 38 are expressed as the query itself.',
    ).toEqual([])
  })

  it('the repository interface exposes exactly one method, and it is a write', () => {
    const source = readFileSync(
      join(import.meta.dirname, '../../../../packages/data/src/interfaces/safety.ts'),
      'utf8',
    )

    // The `ReportRepository` block, up to its closing brace.
    const block = /export interface ReportRepository \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
    const methods = [...block.matchAll(/^\s{2}(\w+)\(/gm)].map((match) => match[1] as string)

    expect(
      methods,
      'Not "no read method yet" and not "a read method a later feature will add" — none, ever. ' +
        'The client-side interface is where a "my reports" screen would ask for one first.',
    ).toEqual(['submit'])
  })
})
