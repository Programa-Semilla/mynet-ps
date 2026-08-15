import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
// Imported from its own module rather than through the schema barrel: the barrel re-exports
// `storedObjects`, and the storage-boundary lint rule refuses a namespace import of it — a
// namespace import cannot be narrowed, so the rule cannot tell this apart from reaching for the
// storage table. Naming the module is both narrower and clearer about what is under test.
import { messages } from '../../src/db/schema/messages.js'

/**
 * T050a (007) — **a sent message cannot be edited or deleted, and the implementation of that is
 * nothing at all** (FR-516).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **AN ABSENCE WITH NO TEST IS A GAP SOMEBODY EVENTUALLY FILLS IN GOOD FAITH.**
 *
 * That is the whole reason this file exists, and it is the same reasoning
 * `no-report-read-surface.test.ts` uses for FR-548. Every other requirement in this feature is
 * satisfied by code somebody wrote, so removing it breaks something visible. FR-516 is satisfied
 * by code nobody wrote — and the natural way it erodes is a later feature adding "unsend", or a
 * moderation path adding a delete, each with a perfectly good local reason and nothing to fail.
 *
 * Deletion happens **only** through account deletion (FR-570), where it is the `messages.author_id`
 * cascade and takes every message the account wrote from every conversation at once. That is a
 * different act from editing history, and it is the erasure right rather than a product feature.
 *
 * `participation-audit.test.ts` asserts the same absence from the route table, deliberately.
 * Two guards for one absence is not redundancy: this one also covers the *schema*, which is where
 * an edit capability would have to leave a trace first.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

describe('no route mutates an individual message (FR-516)', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    // The real application, with every plugin and every route the server registers.
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found routes to audit', () => {
    // A gate that cannot fail is not a gate. If the observer ever stopped receiving routes, every
    // assertion below would pass vacuously.
    expect(routes.length).toBeGreaterThan(5)
  })

  it('the send route exists, so the absences below are about mutation and not about messages', () => {
    const sends = routes.filter(
      (route) => /\/messages$/.test(route.url) && methodsOf(route).includes('POST'),
    )
    expect(sends.length, 'a message can be sent — that is the capability this bounds').toBe(1)
  })

  it('exposes no PUT, PATCH or DELETE anywhere under a message address', () => {
    const mutating = routes
      .filter((route) => /\/messages(\/|$)/.test(route.url))
      .filter((route) =>
        methodsOf(route).some((method) => ['PUT', 'PATCH', 'DELETE'].includes(method)),
      )
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      mutating,
      'A message edit or delete route exists. FR-516 makes a sent message immutable, and its ' +
        'implementation is the absence of exactly this route. Deletion happens only through ' +
        'account deletion (FR-570), which is the erasure right rather than a product feature.',
    ).toEqual([])
  })

  it('exposes no route naming an individual message at all, by any method', () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Broader than the assertion above on purpose. A `POST /messages/:messageId/retract` is not a
    // PUT, PATCH or DELETE, and it is exactly the shape an "unsend" feature would take.
    //
    // `PUT /conversations/:conversationId/read` names a message in its *body*, not its address,
    // and it modifies the caller's own participant row rather than any message — so it is
    // correctly outside this pattern.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const naming = routes
      // Path shape, not parameter name — the same widening `participation-audit.test.ts` needed
      // and for the same reason: `POST /conversations/:conversationId/messages/:id/retract` names
      // a message, mutates it, and matched neither `:messageId` nor the method check above.
      .filter((route) => /\/messages\/[:{]|:messageId|\{messageId\}/.test(route.url))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(naming).toEqual([])
  })

  /**
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **The schema half.** An edit capability has to leave a trace in the data before it can leave
   * one in a route: an `edited_at`, a `deleted_at`, a `previous_body`, a revision table.
   *
   * `schema/messages.ts` names the omission explicitly — "no `edited_at`, no `read_at`, no
   * delivery status, no attachment, no reply-to and no reaction" — and Principle VIII's "collect
   * only what a requirement names" is the general rule. This is the assertion that keeps the
   * specific one true.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  it('the messages table carries no column that an edit or a soft delete would need', () => {
    const columns = Object.keys(messages)

    for (const forbidden of ['editedAt', 'deletedAt', 'previousBody', 'revision', 'redactedAt']) {
      expect(
        columns,
        `messages.${forbidden} would be the first half of an edit or a soft delete. FR-516 ` +
          'makes a sent message immutable and FR-365 forbids a tombstone.',
      ).not.toContain(forbidden)
    }
  })

  /**
   * The query-layer half, read from the source rather than from the route table.
   *
   * A route audit cannot see a function nobody has routed yet. `queries/messages.ts` is where an
   * `editMessage` or `deleteMessage` would appear first — written "for later", exported, and
   * routed by somebody else six months on.
   */
  it('the message query layer exports nothing that edits or deletes one', () => {
    const directory = join(import.meta.dirname, '../../src/db/queries')
    const source = readdirSync(directory)
      .filter((name) => name === 'messages.ts' || name === 'conversations.ts')
      .map((name) => readFileSync(join(directory, name), 'utf8'))
      .join('\n')

    const exported = [...source.matchAll(/export const (\w+)/g)].map((match) => match[1] as string)
    const offending = exported.filter((name) =>
      /^(edit|update|delete|remove|redact)Message/i.test(name),
    )

    expect(
      offending,
      'A message edit or delete function exists in the query layer. It has no route today, ' +
        'which is exactly how FR-516 erodes: the capability lands first and the route follows.',
    ).toEqual([])
  })
})
