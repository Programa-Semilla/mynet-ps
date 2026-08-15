import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T167, FR-1091a, FR-1099b, FR-1099c (014 tranche 2) — **what the taxonomy row must NOT build**,
 * asserted as absences in the shape 009's `qa-absences` established.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THREE ABSENCES, EACH THE FIRST STEP OF A DIFFERENT WRONG PRODUCT.**
 *
 *   - **No completeness surface** (FR-1091a). A score, a meter, a badge or a repeated prompt is
 *     how an optional field becomes mandatory without anybody deciding it was — and FR-1091 is
 *     shipped FR-336 holding unchanged: an incomplete profile is valid and no capability may be
 *     gated on finishing one.
 *   - **No census** (FR-1099b). The administrative product must gain no view of who holds which
 *     value: no per-sector attendee count, no roster, and no route from a vocabulary value to a
 *     person. The vocabulary surface authors LABELS; the moment it answers "how many people are
 *     in Servicios" it is a demographic readout nobody ratified.
 *   - **No notification** (FR-1099c). The trigger set stays at two, and neither a vocabulary
 *     change nor a profile edit is in it. `notification-triggers.test.ts` pins the caller set
 *     product-wide; the assertion here is the narrower, local half that fails in the same file
 *     a violating import would appear in.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * Comments are stripped before matching — every pattern below appears in the prose explaining
 * its absence, and matching raw text would fail on a correct implementation (009's rule).
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))
const webSrc = fileURLToPath(new URL('../../../web/src/', import.meta.url))
const adminSrc = fileURLToPath(new URL('../../../admin/src/', import.meta.url))

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

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

/** The two vocabulary modules this tranche adds on the API side. */
const VOCABULARY_MODULES = [
  join(apiSrc, 'db', 'queries', 'admin-vocabulary.ts'),
  join(apiSrc, 'routes', 'admin', 'vocabulary.ts'),
]

describe('no profile-completeness surface exists in either product (FR-1091a)', () => {
  it('names no completeness score, meter, badge or checklist in any client', () => {
    const offenders = [...sourceFiles(webSrc), ...sourceFiles(adminSrc)]
      .filter((path) => /\b(completeness|completion)\b/i.test(codeOnly(path)))
      .map((path) => path)

    expect(
      offenders,
      'A client names profile completeness. FR-1091a forbids any score, percentage, meter, ' +
        'badge, checklist or repeated prompt to finish a profile, in either product — a ' +
        'completeness surface is how an optional field becomes mandatory without anybody ' +
        'deciding it was (FR-1091, shipped FR-336).',
    ).toEqual([])
  })

  it('serves no completeness figure from the API', () => {
    const offenders = sourceFiles(join(apiSrc, 'routes'))
      .filter((path) => /\b(completeness|profileCompletion)\b/i.test(codeOnly(path)))
      .map((path) => path)

    expect(offenders).toEqual([])
  })
})

describe('the vocabulary surface is not a census (FR-1099b, T167)', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found the vocabulary routes to audit — a gate that cannot fail is not a gate', () => {
    const vocabulary = routes.filter((route) => /^\/admin\/vocabulary\//.test(route.url))
    expect(vocabulary.length).toBeGreaterThan(2)
  })

  it('registers no route from a vocabulary value to an attendee', () => {
    // A path is a promise (FR-1093a). `/admin/vocabulary/sectors/:id/attendees` would be a
    // roster whatever its handler did — the same rule the disclosure guard's noun set enforces,
    // asserted here over the one route family it was widened for.
    const disclosing = routes
      .filter((route) => /^\/admin\/vocabulary\//.test(route.url))
      .filter((route) => /\b(attendees?|holders?|roster|members?|profiles?)\b/i.test(route.url))
      .flatMap((route) => methodsOf(route).map((method) => `${method} ${route.url}`))

    expect(
      disclosing,
      'A vocabulary route addresses the people holding a value. The administrative product ' +
        'must gain no view of who holds which value (FR-1099b): the surface authors labels, ' +
        'never people.',
    ).toEqual([])
  })

  it('projects no attendee identity and no per-value count from the vocabulary query layer', () => {
    // The holder-existence check FR-1094/FR-1094c require is a SELECT that answers yes or no.
    // It must never grow into a count handed to a caller or a roster: `count(` in this module is
    // the first step of "how many attendees are in Servicios", which is FR-1099b's named
    // prohibition ("no per-sector attendee count").
    for (const path of VOCABULARY_MODULES) {
      const code = codeOnly(path)
      expect(
        code.length,
        `${path} is missing — the population this guard audits moved`,
      ).toBeGreaterThan(100)

      expect(
        /\bdisplay_name\b|\bdisplayName\b|\.email\b/.test(code),
        `${path} touches an attendee identity. The vocabulary layer may ask WHETHER a value is ` +
          'held and nothing else (FR-1099b).',
      ).toBe(false)

      expect(
        /count\(\s*\*?\s*\)[\s\S]{0,120}?(attendee_profiles|attendee_interests)|(attendee_profiles|attendee_interests)[\s\S]{0,120}?count\(/i.test(
          code,
        ),
        `${path} counts attendees holding a value. Existence is the whole question the ` +
          'holder check may ask; a number is a per-value census (FR-1099b).',
      ).toBe(false)
    }
  })

  it('dispatches nothing (FR-1099c)', () => {
    // The product-wide caller set is pinned by `notification-triggers.test.ts`; this is the
    // local half, failing in the file the import would appear in.
    for (const path of VOCABULARY_MODULES) {
      expect(
        /notifications\/dispatch|dispatchToDevices|attendeesToNotify/.test(codeOnly(path)),
        `${path} reaches the notification platform. The trigger set stays at two, and neither ` +
          'a vocabulary change nor a profile edit is in it (FR-1099c).',
      ).toBe(false)
    }
  })

  it('falls inside the populations the shipped guards audit (T167)', () => {
    // FR-1093's guard (`profile-uneditable.test.ts`) audits `routes/admin/**`, `admin/**` and
    // `db/queries/*admin*`; the disclosure guard audits the same. This pins the NAMES that put
    // the two new modules inside those populations, so a rename cannot silently move them out —
    // the exact failure mode R17's finding (2) records for the "profile" ban's one hard-coded
    // path.
    const queries = readdirSync(join(apiSrc, 'db', 'queries'))
    expect(queries).toContain('admin-vocabulary.ts')

    const adminRoutes = readdirSync(join(apiSrc, 'routes', 'admin'))
    expect(adminRoutes).toContain('vocabulary.ts')
  })
})
