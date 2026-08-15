import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * **FR-1006 — no administrative route edits anybody's profile, and a speaker record is not a route
 * to one** (standing decision 33, register entry 30).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE WAS CITED BY TWO OTHERS BEFORE IT EXISTED, AND THAT IS WHY IT EXISTS NOW.**
 *
 * `db/queries/admin-catalog.ts` said, of `updateSpeaker`: *"That is standing decision 33's clause
 * verbatim — conference content is authorable, a person is not — and
 * `tests/unit/profile-uneditable.test.ts` asserts it over the whole administrative surface **rather
 * than trusting this paragraph**."* `CatalogForms.tsx` said the same. The file did not exist.
 *
 * A comment claiming a guard exists is worse than no comment: it tells the next reader that the
 * absence has been checked, so they stop looking. This project has now met that shape four times —
 * 010's precache assertion that skipped on every CI run, 013's four functions whose headers
 * described callers that were nowhere, and two more found by the deep review of this feature — and
 * it is the class CLAUDE.md names as the most transferable defect 013 produced.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **WHAT THE REQUIREMENT ACTUALLY FORBIDS, AND WHAT IT DOES NOT.**
 *
 * Decision 33's clause is *conference content is authorable, a person is not*. So:
 *
 *   - **Forbidden**: any administrative write to `attendees`, `attendee_profiles` or
 *     `attendee_interests`. There is no tier that may correct somebody's job title for them.
 *   - **Forbidden**: a path from a speaker record to an attendee record. A speaker is conference
 *     content describing a real person who may or may not hold an account, and where the same human
 *     holds both, editing the programme must change nothing about them.
 *   - **Permitted, and deliberately not flagged**: administrative *reads* of an attendee's name for
 *     the promotion surface (013 needs to show who is being promoted), and writes to
 *     `organizer_assignments`, which is authority rather than personhood. 013's own absence guard
 *     already covers the routes that suspend or restrict a *person* — this one is about editing.
 *
 * That distinction is the same narrowing D14 records three times over: filtering by an identity is
 * not disclosing it, and acting on authority is not acting on a person. A guard written to catch
 * "administrative code mentions attendees" would fail on correct code, and the natural repair is to
 * weaken it until it checks nothing.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))
const adminSrc = fileURLToPath(new URL('../../../admin/src/', import.meta.url))

const filesUnder = (directory: string, prefix = ''): { label: string; code: string }[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    const label = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) return filesUnder(path, label)
    if (!/\.tsx?$/.test(entry.name)) return []
    return [{ label, code: codeOnly(path) }]
  })

/**
 * Comments stripped before matching.
 *
 * Every pattern below also appears in the prose explaining the absence — including in this file's
 * own header and in the two comments that cited it. Matching raw text would fail on a correct
 * implementation, and the natural repair is to weaken the pattern until it checks nothing. Every
 * absence guard in this repository does this for the same reason.
 */
const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')

/**
 * The tables that hold a person rather than conference content.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **T126 (014 tranche 2, R17) — this list is HAND-MAINTAINED, not schema-derived, and so is the
 * raw-SQL alternation two assertions down. That is the opposite of what `deletion-coverage` and
 * `export-coverage` do, and the consequence is recorded here because nothing enforces it: a NEW
 * attendee-side table would pass this guard green until somebody remembered to edit BOTH lists.**
 *
 * Tranche 2 honoured that constraint by adding no personal table at all: the taxonomy fields are
 * columns on `attendee_profiles`, and interest selections stay on `attendee_interests` — both
 * already listed, so FR-1093's guard extends to the new fields with no edit (R18). A future
 * feature that genuinely needs a new personal table must add it here AND to the raw-SQL
 * alternation in the same change, and should consider deriving both from the schema instead.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
const PERSONAL_TABLES = ['attendees', 'attendeeProfiles', 'attendeeInterests']

/** Everything administrative on the API side: the routes, the guards and the query modules. */
const administrativeApi = (): { label: string; code: string }[] => [
  ...filesUnder(join(apiSrc, 'routes', 'admin'), 'routes/admin'),
  ...filesUnder(join(apiSrc, 'admin'), 'admin'),
  ...filesUnder(join(apiSrc, 'db', 'queries'), 'db/queries').filter(({ label }) =>
    /admin/.test(label),
  ),
]

describe("FR-1006 — no administrative tier edits anybody's profile", () => {
  it('found the administrative surface to audit — a gate that cannot fail is not a gate', () => {
    const api = administrativeApi()
    const admin = filesUnder(adminSrc)

    expect(api.length, 'no administrative API modules found').toBeGreaterThan(5)
    expect(admin.length, 'no administrative client modules found').toBeGreaterThan(10)
    expect(api.map(({ label }) => label)).toContain('db/queries/admin-catalog.ts')
  })

  it.each(PERSONAL_TABLES)('never writes to %s from an administrative module', (table) => {
    const offenders = administrativeApi()
      .filter(({ code }) =>
        // A write is `insert(x)`, `update(x)` or `delete(x)`. A `select` from these tables is
        // permitted and ordinary — the promotion surface has to show whom it is promoting.
        new RegExp(`\\.(insert|update|delete)\\(\\s*${table}\\b`).test(code),
      )
      .map(({ label }) => label)

    expect(
      offenders,
      `An administrative module writes to \`${table}\`. FR-1006 and standing decision 33 permit ` +
        'authoring conference content and nothing else: **a person is not authorable at any ' +
        "tier**, and no administrative role may correct somebody's own profile for them. If a " +
        'requirement now needs this, it needs an amendment first.',
    ).toEqual([])
  })

  it('never writes to a personal table in raw SQL either', () => {
    const offenders = administrativeApi()
      .filter(({ code }) =>
        /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(attendees|attendee_profiles|attendee_interests)\b/i.test(
          code,
        ),
      )
      .map(({ label }) => label)

    expect(
      offenders,
      'An administrative module writes to a personal table in raw SQL. The Drizzle assertion ' +
        'above would not see it, which is why this one reads the statements as text: 014 writes ' +
        'raw `sql` fragments in several places, so the two spellings need two checks.',
    ).toEqual([])
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **THE SPEAKER RECORD IS NOT A ROUTE TO A PROFILE, AND THIS IS THE HALF THE CITATIONS WERE
   * ABOUT.**
   *
   * `speakers` carries a name, a title and a company and has no reference to `attendees` — by
   * design, since 002. What FR-1006 forbids is *adding* one, or resolving a speaker to an attendee
   * by matching on a name. register entry 30 records the open question this leaves: a speaker is
   * personal data about somebody who never signed up, and 014 moved responsibility for it from a
   * reviewed commit to a promoted attendee typing into a form.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  it('never joins or matches a speaker to an attendee', () => {
    const offenders = administrativeApi()
      .filter(({ code }) => /\bspeakers?\b/i.test(code))
      .filter(({ code }) =>
        PERSONAL_TABLES.some((table) =>
          // A join or a correlated predicate between the two — the shape that would turn a
          // programme edit into a profile lookup.
          new RegExp(`${table}[\\s\\S]{0,120}?speakers|speakers[\\s\\S]{0,120}?${table}`).test(
            code,
          ),
        ),
      )
      .map(({ label }) => label)

    expect(
      offenders,
      'An administrative module relates `speakers` to an attendee record. A speaker is ' +
        'conference content describing a real person who may or may not hold an account; where ' +
        'the same human holds both, editing the programme must change **nothing** about them ' +
        '(FR-1006, decision 33). Matching on a name is the shape to refuse most firmly — it is ' +
        'both a profile route and wrong about who somebody is.',
    ).toEqual([])
  })

  it('offers no profile-editing surface in the administrative client', () => {
    const offenders = filesUnder(adminSrc)
      .filter(({ code }) =>
        /updateProfile|editProfile|saveProfile|patchProfile|profileForm/i.test(code),
      )
      .map(({ label }) => label)

    expect(
      offenders,
      'The administrative client names a profile-editing surface. FR-1006 is an absence in both ' +
        'products: there is no form, no route and no repository member at any tier that edits a ' +
        'person.',
    ).toEqual([])
  })

  it('declares no profile write on the administrative repository interface', () => {
    const contract = codeOnly(
      fileURLToPath(
        new URL('../../../../packages/data/src/interfaces/administration.ts', import.meta.url),
      ),
    )

    expect(
      /profile/i.test(contract),
      'The administrative repository interface mentions a profile. The interface is where a ' +
        'capability becomes available to the client, so an absence asserted over `apps/admin` ' +
        'alone would be one refactor away from being false.',
    ).toBe(false)
  })
})
