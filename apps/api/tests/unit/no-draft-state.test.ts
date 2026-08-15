import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T092 (014) — **conference content is live-edited; there is no draft/publish lifecycle**
 * (FR-1040, constitution v5.2.0, decision 48).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **A LIFECYCLE WOULD BE A SECOND GATE OVER A GATE THAT ALREADY EXISTS.**
 *
 * A conference is reachable only by its **join code**, so an unfinished one is already private to
 * whoever holds that code. Adding draft/published state would buy nothing an organizer does not
 * have — they can simply not distribute the code yet — and would cost a second state that
 * **every read path in the product has to consult**: the programme, Agenda, Home's four
 * session-reading cards, the Q&A join, the notification fan-out. Each is a place to forget it,
 * and forgetting it means an attendee sees a draft.
 *
 * **The consequence is accepted rather than hidden**: an organizer authors into a conference
 * their attendees can already see. The empty state in the programme editor says so in as many
 * words, which is where somebody looking for a publish button will actually be.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE FAILURE THIS CATCHES IS ADDITIVE AND WOULD LOOK HARMLESS.**
 *
 * Nobody would propose a lifecycle in a review. What happens instead is a `published boolean
 * NOT NULL DEFAULT true` column added "so we can hide a session while it is being written" — a
 * change that breaks nothing, passes every test, and quietly makes decision 48 false. A feature
 * MUST NOT add one without an amendment, so this reads the schema rather than trusting review.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Comments are stripped before matching, as 009's guards do — the words below all appear in the
 * prose explaining the absence.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **T125 (014 tranche 2) — the population is larger than conference content now.** FR-1094b
 * extends the no-lifecycle rule to the vocabulary (reference data, `schema/vocabulary.ts`),
 * where the tempting column is not `published` but a lifecycle-shaped flag on a value — and
 * where exactly one withdrawal mechanism, `retired_at`, is REQUIRED to exist. The vocabulary
 * assertions below are a sibling population with their own message, not a widening of
 * `contentSchemas`, and one of them is positive: a guard that only banned lifecycle columns
 * would be "fixed" by deleting retirement.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))

const sourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })

const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

const label = (path: string): string => path.slice(apiSrc.length)

const schemaFiles = sourceFiles(join(apiSrc, 'db', 'schema'))
const migrationsDir = fileURLToPath(new URL('../../migrations/', import.meta.url))

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

describe('014 — no draft or publish lifecycle (FR-1040, decision 48)', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found the schema and routes to audit', () => {
    expect(schemaFiles.length).toBeGreaterThan(8)
    expect(routes.length).toBeGreaterThan(5)
  })

  /**
   * **No lifecycle column**, which is the form the mistake would actually take.
   */
  it('declares no draft or published column on any table (FR-1040)', () => {
    const declaring = schemaFiles
      .filter((path) => /\b(draft|published|publishedAt|isPublished)\s*:/i.test(codeOnly(path)))
      .map(label)

    expect(
      declaring,
      'A table declares lifecycle state. A conference is already private to whoever holds its ' +
        'join code (decision 48), so this buys nothing — and costs a second state every read ' +
        'path in the product must consult, each of them a place to forget it.',
    ).toEqual([])
  })

  /**
   * **A generic `status` is forbidden on CONFERENCE CONTENT specifically**, and the narrowing is
   * the decision rather than a loophole.
   *
   * The first draft of this assertion banned `status:` on every table and caught
   * `appointments.status` — 008's proposed/accepted/declined/cancelled, which is a **relationship
   * between two attendees** negotiating a meeting, not a visibility gate on content. Banning it
   * would have failed correct code and taught the next reader to weaken the pattern.
   *
   * On a session or a conference, though, a `status` column is exactly how a lifecycle arrives
   * without being called one: `status: 'draft' | 'live'` breaches decision 48 while matching no
   * pattern containing the word "published".
   */
  it('declares no status column on conference content (FR-1040)', () => {
    const contentSchemas = schemaFiles.filter((path) => /catalog\.ts$|events\.ts$/.test(path))
    expect(contentSchemas.length, 'the content schemas could not be located').toBeGreaterThan(1)

    const declaring = contentSchemas
      .filter((path) => /\b(status|state|stage|phase)\s*:/i.test(codeOnly(path)))
      .map(label)

    expect(
      declaring,
      'Conference content gained a status column. That is how a lifecycle arrives without being ' +
        'called one — `status: draft | live` breaches decision 48 while matching no pattern ' +
        'containing the word "published". Cancellation is a timestamp, deliberately.',
    ).toEqual([])
  })

  /**
   * **T125 (014 tranche 2, R17) — the vocabulary is a SIBLING population, not a widening of
   * `contentSchemas` above.** `vocabulary.ts` is a new schema file and was outside every
   * file-listed assertion in this guard, so a `status` column there would have passed green.
   * It gets its own population and its own message rather than joining `contentSchemas`,
   * because putting reference data into a constant named "content" behind a message that says
   * "Conference content gained a status column" is the naming lie `appendAuditEntry` already
   * taught this project about (FR-1094b).
   */
  it('declares no lifecycle-shaped column on the vocabulary (FR-1094b)', () => {
    const referenceSchemas = schemaFiles.filter((path) => /vocabulary\.ts$/.test(path))
    expect(referenceSchemas.length, 'the vocabulary schema could not be located').toBe(1)

    const declaring = referenceSchemas
      .filter((path) =>
        /\b(status|state|stage|phase|draft|published|approved|visible)\s*:/i.test(codeOnly(path)),
      )
      .map(label)

    expect(
      declaring,
      'The vocabulary gained a lifecycle-shaped column. A value is choosable from the moment ' +
        'it exists and there is no unpublished vocabulary value (FR-1094b); retirement — below — ' +
        'is the ONE permitted withdrawal mechanism, and it is an attribute, not a lifecycle.',
    ).toEqual([])
  })

  /**
   * **The positive counterpart** (T125's second half): retirement IS the mechanism FR-1094
   * requires — a vocabulary value must be withdrawable without writing to any attendee record —
   * so a guard that only banned lifecycle-shaped columns would be "fixed" by deleting
   * `retired_at`, and this assertion is what stops that repair.
   */
  it('keeps retirement as the one vocabulary withdrawal mechanism (FR-1094)', () => {
    const vocabulary = codeOnly(join(apiSrc, 'db', 'schema', 'vocabulary.ts'))
    expect(vocabulary).toMatch(/retiredAt/)

    // And no attendee-side read filters held values out: the profile and card reads must keep
    // presenting a retired value its holder still has (FR-1094a). The write-path membership
    // check in `queries/profiles.ts` is a write check, which is the one place `retired` may
    // legitimately appear outside the vocabulary's own modules.
    const filtering = sourceFiles(join(apiSrc, 'db', 'queries'))
      .filter((path) => !/admin-vocabulary\.ts$|vocabulary\.ts$|profiles\.ts$/.test(path))
      .filter((path) => /\bretired/i.test(codeOnly(path)))
      .map(label)

    expect(
      filtering,
      'A read outside the vocabulary and the profile write path consults retirement. Retiring ' +
        'withdraws a value from FUTURE choice and does nothing else: holders keep it, it keeps ' +
        'displaying, it keeps ranking (FR-1094a).',
    ).toEqual([])
  })

  it('registers no publish or unpublish route (FR-1040)', () => {
    const publishing = routes
      .filter((route) => /\b(publish|unpublish|draft|preview)\b/i.test(route.url))
      .flatMap((route) => methodsOf(route).map((method) => `${method} ${route.url}`))

    expect(
      publishing,
      'A route publishes content. Live editing is decision 48: an organizer authors into a ' +
        'conference their attendees can already see, and that consequence is accepted rather ' +
        'than hidden (FR-1040).',
    ).toEqual([])
  })

  it('filters no read by a lifecycle state (FR-1040)', () => {
    // The other half: a column could exist unnamed while a read filtered on it. Scanned over the
    // query layer, where such a filter would have to live.
    const filtering = sourceFiles(join(apiSrc, 'db', 'queries'))
      .filter((path) => /\bisPublished\b|\bpublished\s*,|eq\([^)]*published/i.test(codeOnly(path)))
      .map(label)

    expect(filtering).toEqual([])
  })

  // Retitled by T125: it always read EVERY migration on disk, but its title said "0011" and
  // went stale the moment tranche 2 generated 0012 (O4: numbers are claimed at generation).
  it('adds no lifecycle column in any migration (FR-1040)', () => {
    // Read from the migration rather than only from the Drizzle schema: the schema is what the
    // application believes, and the migration is what the database has. 013's regeneration
    // lesson is that those two are worth checking separately.
    const sql = readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .map((name) => ({ name, text: readFileSync(join(migrationsDir, name), 'utf8') }))

    expect(sql.length, 'no migrations found to audit').toBeGreaterThan(8)

    const offending = sql
      .filter(({ text }) => /\b(draft|published|is_published)\b/i.test(text))
      .map(({ name }) => name)

    expect(
      offending,
      'A migration adds lifecycle state to the database. A column can exist in the database ' +
        'while the Drizzle schema stays clean, and every read path would then be one `WHERE` ' +
        'away from a draft nobody meant to hide (FR-1040).',
    ).toEqual([])
  })

  /**
   * **Cancellation is the one stored session state, and it is not a lifecycle**, stated
   * positively so the rule above is not read as "a session may have no state at all".
   *
   * `cancelled_at` is stored rather than derived because it is an organizer's *act* — unlike
   * 008's `lapsed`, which is a function of the clock. It is also the opposite of a draft: a
   * cancelled session is **more** visible, marked everywhere rather than hidden.
   */
  it('keeps cancellation as the one stored session state, which hides nothing (FR-1020)', () => {
    const catalog = codeOnly(join(apiSrc, 'db', 'schema', 'catalog.ts'))

    expect(catalog).toMatch(/cancelledAt/)
    // A cancelled session is still returned by the attendee read. Filtering it out would be a
    // lifecycle in everything but name — and FR-1022 requires it marked, not missing.
    const reads = codeOnly(join(apiSrc, 'db', 'queries', 'catalog.ts'))
    expect(
      /isNull\(\s*sessions\.cancelledAt\s*\)|cancelled_at\s+IS\s+NULL/i.test(reads),
      'The attendee programme read filters out cancelled sessions. That is a lifecycle by ' +
        'another name: FR-1022 requires cancellation to be MARKED, because an attendee who ' +
        'planned around a session needs to see that it will not happen.',
    ).toBe(false)
  })
})
