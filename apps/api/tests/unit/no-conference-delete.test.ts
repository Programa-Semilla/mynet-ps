import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T082 (014) — **no conference is deleted, at any tier** (FR-1011).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS FR-1019's REASONING ONE LEVEL UP, AND THE CONSEQUENCES ARE STRICTLY WORSE.**
 *
 * Decision 44 forbids deleting a *session* anybody has engaged with, because
 * `saved_sessions`, `session_notes`, `session_questions` and `question_votes` each cascade from
 * `sessions.id` — so one delete would destroy other people's private writing with no confirmation
 * and no record. A conference contains **every** session, so deleting one is that same cascade
 * multiplied by the whole programme, plus the registrations.
 *
 * The refusal is therefore **unconditional rather than engagement-dependent**: there is no
 * "delete an empty conference" affordance, because the state that makes it safe today is one
 * attendee away from not being safe, and the control would be right there when it stopped being.
 * A conference that should not have existed is left alone; it is reachable only by its join code
 * (decision 48), so an unwanted one is already invisible to everybody who does not hold it.
 *
 * **Not the same rule as the cascades being wrong.** They stay exactly as they are — correct for
 * the case deletion is still permitted (an untouched session). The protection is the absence of
 * the route, which is why it needs asserting: nothing in the schema prevents it.
 *
 * Asserted at the **route table** rather than only in source, because a path is a promise. The
 * source patterns then catch the layer below, where somebody would build the capability before
 * exposing it.
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

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

describe('014 — a conference is never deleted (FR-1011)', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found routes to audit — a gate that cannot fail is not a gate', () => {
    expect(routes.length).toBeGreaterThan(5)
    // And the conference routes it is about genuinely exist, so this is auditing something.
    expect(routes.filter((route) => /\/conferences/.test(route.url)).length).toBeGreaterThan(2)
  })

  it('registers no DELETE on a conference at any tier (FR-1011)', () => {
    const deleting = routes
      .filter((route) => methodsOf(route).includes('DELETE'))
      .filter((route) => /\/conferences\/[:{][^/]+$/.test(route.url))
      .flatMap((route) => methodsOf(route).map((method) => `${method} ${route.url}`))

    expect(
      deleting,
      'A route deletes a conference. Every session cascades from it, and each session cascades ' +
        'to saved sessions, notes, questions and votes — so one request would destroy the ' +
        'private writing of everybody at the conference, which is decision 49’s reasoning ' +
        'multiplied by the whole programme (FR-1011).',
    ).toEqual([])
  })

  it('registers no delete-shaped POST either, whatever it is called (FR-1011)', () => {
    // A `POST …/conferences/:id/delete` or `/archive` satisfies the assertion above and does the
    // same thing. Matched on the verb rather than on the method.
    const deleting = routes
      .filter((route) => /\/conferences\//.test(route.url))
      .filter((route) => /\/(delete|remove|destroy|archive|purge)$/i.test(route.url))
      .flatMap((route) => methodsOf(route).map((method) => `${method} ${route.url}`))

    expect(
      deleting,
      'A conference can be deleted through a differently-named route. The absence is of the ' +
        'CAPABILITY, not of one HTTP method (FR-1011).',
    ).toEqual([])
  })

  it('exposes no deletion in the administrative query layer (FR-1011)', () => {
    // The layer below the route, where the capability would be built before being exposed. The
    // fixture teardown deletes conferences and is test code, not `src`.
    const deleting = sourceFiles(join(apiSrc, 'db', 'queries'))
      .filter((path) => /admin-/.test(path))
      .filter((path) => {
        const code = codeOnly(path)
        return (
          /\.delete\(\s*events\s*\)/.test(code) ||
          /DELETE\s+FROM\s+\$\{events\}/i.test(code) ||
          /deleteConference/.test(code)
        )
      })
      .map(label)

    expect(
      deleting,
      'The administrative query layer can delete a conference. Even unexposed, that function is ' +
        'one route registration away from FR-1011 ending — and the registration would look like ' +
        'plumbing rather than like a governance change.',
    ).toEqual([])
  })

  /**
   * **The seed is the exception, and it is not administrative.**
   *
   * `pnpm db:seed` clears and rebuilds the fixture conferences, which is a reviewed development
   * act rather than a capability the product offers. Asserting where deletion IS permitted is
   * what stops the rule above being read as "nothing may ever delete an event" and then quietly
   * weakened when the seed needs to run.
   */
  it('permits it only in the seed, which is a development fixture rather than a capability', () => {
    const seedFiles = sourceFiles(join(apiSrc, 'db', 'seed'))
    const clearing = seedFiles.filter((path) => /delete|DELETE/.test(codeOnly(path)))

    expect(
      clearing.length,
      'The seed no longer clears conferences. That is where deletion is legitimate — a reviewed ' +
        'development fixture — and if it moved, FR-1011’s rule above may have been widened to ' +
        'accommodate it.',
    ).toBeGreaterThan(0)
  })

  /**
   * **`PATCH` exists and must keep existing**, which is the positive half.
   *
   * FR-1011 forbids deletion; it does not forbid correction. A conference created with the wrong
   * dates must be fixable, or the absence of deletion becomes a trap rather than a protection.
   */
  it('leaves a conference correctable, so the absence of deletion is not a trap (FR-1014)', () => {
    const patching = routes
      .filter((route) => methodsOf(route).includes('PATCH'))
      .filter((route) => /^\/admin\/conferences\/[:{][^/]+$/.test(route.url))

    expect(
      patching,
      'A conference cannot be corrected. FR-1011 forbids DELETION, not correction — without a ' +
        'PATCH, a conference created with the wrong dates is permanent, and the refusal to ' +
        'delete becomes a trap rather than a protection.',
    ).toHaveLength(1)
  })
})
