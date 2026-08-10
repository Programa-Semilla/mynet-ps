import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T073 (007) — **nothing in this product may read a report** (FR-548, SC-508).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE TIGHTEST CONSTRAINT IN THE FEATURE, AND IT FOLLOWS DIRECTLY FROM PRINCIPLE III.**
 *
 * A report is the classic reason to introduce a moderator, and a moderator is an organizer: the
 * actor this product excludes by construction. So rather than smuggle one in as "just an admin
 * screen", the report leaves the product entirely — it is written, mailed to an operator, and
 * then left alone until a 90-day sweep removes it.
 *
 * **A reviewer looking for the missing half of this feature should find nothing, and finding
 * nothing is the pass condition.** That is a strange thing to assert, which is exactly why it is
 * asserted: an absence with no test is a gap somebody eventually fills in good faith, and the
 * good faith here is real — "operators need to see reports" is true, and the answer is that they
 * see them in their inbox and in the database, not through a surface this product ships.
 *
 * Four directions, because the absence can erode from four places: the route table, the query
 * layer, the repository interface, and the client.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

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
      .filter((route) => !methodsOf(route).every((method) => method === 'POST'))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      readable,
      'A report-reading route exists. FR-548 forbids any interface, role or route by which a ' +
        'report can be read from within this product — a report-reading screen needs a moderator, ' +
        'and a moderator is an organizer, the actor Principle III excludes by construction.',
    ).toEqual([])
  })

  it('exposes no admin, moderation or operator address of any kind', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Broader than reports, deliberately. The failure mode FR-548 guards against is not
    // "somebody adds `GET /reports`" — it is somebody adding an administrative area, of which a
    // report list is the first tenant. There is no privileged role in this product and no
    // address that would need one.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const administrative = routes
      .filter((route) =>
        /\/(admin|moderation|moderator|operator|staff|internal)\b/i.test(route.url),
      )
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(administrative).toEqual([])
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

    const offending = walk(join(import.meta.dirname, '../../src/routes')).filter((file) =>
      /abuse_reports|abuseReports/.test(readFileSync(file, 'utf8')),
    )

    expect(
      offending.map((file) => file.split('/').slice(-2).join('/')),
      'A route reaching the reports table directly bypasses the query layer this test guards.',
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
