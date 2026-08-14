import { readFile } from 'node:fs/promises'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import * as catalogQueries from '../../src/db/queries/catalog.js'

/**
 * T084 (005) — **the catalog is read-only, in perpetuity** (FR-191, FR-132, FR-134,
 * Principle III).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHY THIS TEST EXISTS AT ALL, WHEN NOTHING IS CURRENTLY WRONG.**
 *
 * A catalog write is organizer administration, which Principle III places out of *product*
 * scope rather than out of the architecture. Nothing in the codebase would object to a
 * `saveSession` appearing on `CatalogRepository` one day — it would type-check, it would lint,
 * and it would look like the natural home for it. 005 is the feature that makes that mistake
 * plausible for the first time, because it adds exactly such a method *somewhere else*.
 *
 * The route audit already asserts no write **route** exists against conference content. This
 * asserts the layer beneath: no write **function**, in the query layer or on the interface.
 * A future contributor reaching for the obvious place is what this catches, and the failure
 * message is written for them rather than for whoever is reading now.
 *
 * Asserted **by name-shape over the exported surface**, not by a hand-maintained list, so a
 * differently-named write is caught too.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T015 (014) — ITS SUBJECT IS THE ATTENDEE READ PATH SPECIFICALLY, AND NOT ONE ASSERTION
 * BELOW CHANGES.**
 *
 * CLAUDE.md names this among the five guards enforcing the reversed organizer-administration
 * prohibition, each of which "must be amended deliberately, never weakened until it stops
 * checking anything". 014 gives an organizer a write path into the catalog, so a reader would
 * reasonably expect this file to be the casualty. **It is not**, and research R1 explains why in
 * one sentence: this guard's two subjects are the **attendee-scoped query module** and the
 * **client-facing repository interface**, and the write path is neither.
 *
 * `db/queries/admin-catalog.ts` serves a different principal under a different authority model —
 * a `ConferenceAuthorityScope`, not an `EventScope` — and `apps/admin` reaches it through
 * `AdministrationRepository`, not through `CatalogRepository`. So both assertions stay true and
 * stay valuable:
 *
 *   - **The query layer here exports reads only.** Widening it would make one module answer to
 *     an attendee and an operator at once, and this assertion would have to become a list of
 *     permitted write names — which is the failure mode the paragraph above names.
 *   - **`CatalogRepository` declares no write method.** That is now the stronger of the two:
 *     adding one would put an authoring capability in the **attendee bundle** whether or not any
 *     component called it, and FR-1003 forbids MyNet gaining an authoring surface at all.
 *
 * **What changed is one sentence of justification, in the two files this test reads.** "A catalog
 * write is organizer administration, which Principle III places out of scope" was true until
 * v4.0.0 and is now false; the rule it was offered in support of is unchanged. FR-191's
 * "read-only in perpetuity" survives **literally**, rather than by reinterpreting "in perpetuity"
 * to mean "until 014".
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

/** Verbs that would make a function a write, however it is spelled. */
const WRITE_VERBS =
  /^(create|insert|add|save|update|edit|set|put|patch|upsert|delete|remove|destroy|import|seed|sync|publish|archive)/i

describe('the session catalog query layer', () => {
  it('exports READS ONLY — no create, update or delete (FR-191)', () => {
    const writes = Object.keys(catalogQueries).filter((name) => WRITE_VERBS.test(name))

    expect(
      writes,
      'A write function has appeared in the catalog query layer. Creating, editing or importing ' +
        'a conference programme is organizer administration, which Principle III places out of ' +
        'product scope and which the constitution separately forbids without an amendment.\n\n' +
        'If you are adding attendee state ABOUT a session — a save, a note, a question — it does ' +
        'not belong here. It belongs in its own repository, as `queries/agenda.ts` does: the ' +
        'catalog is seeded conference content, and the attendee owns their own state about it.',
    ).toEqual([])
  })

  it('exports something, or the assertion above is vacuous', () => {
    const reads = Object.keys(catalogQueries).filter(
      (name) => typeof catalogQueries[name as keyof typeof catalogQueries] === 'function',
    )

    expect(reads.length).toBeGreaterThan(0)
  })
})

describe('the CatalogRepository interface', () => {
  /**
   * Read as source rather than imported, because the interface is a **type**: it is erased at
   * runtime, so there is no object to inspect. A structural check would need a value that
   * implements it, and the thing being guarded against is a method being *added to the
   * declaration* — which only the source can show.
   */
  const interfaceSource = async (): Promise<string> =>
    readFile(
      fileURLToPath(
        new URL('../../../../packages/data/src/interfaces/catalog.ts', import.meta.url),
      ),
      'utf8',
    )

  it('declares no write method (FR-191)', async () => {
    const source = await interfaceSource()

    const body = source.slice(source.indexOf('export interface CatalogRepository'))
    // Method declarations inside the interface body: `name(args): Return`.
    const methods = [...body.matchAll(/^\s{2}(\w+)\s*\(/gm)].map((match) => match[1] ?? '')

    expect(methods.length, 'no methods found — the parse has stopped working').toBeGreaterThan(0)
    expect(
      methods.filter((name) => WRITE_VERBS.test(name)),
      'A write method has been declared on CatalogRepository. See the query-layer assertion ' +
        'above for where attendee state about a session belongs instead.',
    ).toEqual([])
  })

  it('still says so in its own source, so the rule is discoverable where it is broken', async () => {
    const source = await interfaceSource()

    // The rule is stated in the file a contributor is editing when they would break it. A
    // comment is not enforcement — that is what the assertions above are — but a contributor
    // who reads it never reaches them.
    expect(source).toMatch(/no method creates, updates or deletes anything/i)
  })
})
