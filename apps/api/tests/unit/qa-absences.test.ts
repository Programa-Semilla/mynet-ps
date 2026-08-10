import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

import type { RouteOptions } from 'fastify'
import { beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'

/**
 * T085–T090c (009) — **the requirements whose implementation is nothing at all.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **AN ABSENCE THAT NOBODY ASSERTED IS AN ABSENCE THE NEXT FEATURE DELETES.**
 *
 * Eleven of this feature's requirements are satisfied by *not building something*, which is the
 * highest count of any feature in this product. Every one of them looks, to a later reader,
 * exactly like a gap somebody ran out of time for — and each would be filled in perfectly good
 * faith by somebody trying to help:
 *
 *   - **FR-709, FR-770** — no edit route and no `PATCH`. Looks like a missing convenience; is the
 *     position that a question published to a room cannot be quietly rewritten under the votes
 *     it already attracted. Withdrawal is the only retraction.
 *   - **FR-723, FR-771** — no downvote and no reaction. Looks like an incomplete voting model; is
 *     a decision about what a conference's question list is *for*.
 *   - **FR-721, FR-769** — no route reveals who voted. Looks like a missing field; is the whole
 *     reason upvoting is safe to offer at all.
 *   - **FR-768** — no answer, no `answered` flag, no pin, no moderation route. Every one of them
 *     is an **organizer** act, and Principle III excludes that actor by construction.
 *   - **FR-753, FR-773** — no Home card and no navigation destination. Looks like an oversight in
 *     a feature that adds a surface; is the panel being the right and only home for it.
 *   - **FR-773b** — no de-duplication and no "you already asked that" refusal.
 *   - **FR-731** — nothing polls.
 *   - **FR-740, v3.2.0 N1** — no contact is derived from a question or a vote.
 *   - **FR-767, FR-738** — no notification bell, no notification centre, no column on the
 *     attendee record.
 *
 * 007 established this discipline with `no-message-mutation-routes.test.ts`, and 008 gathered
 * its own into `network-absences.test.ts`. This is 009's, in one file because the absences share
 * one justification: **they are all decisions.**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const apiSrc = fileURLToPath(new URL('../../src/', import.meta.url))
const webSrc = fileURLToPath(new URL('../../../web/src/', import.meta.url))

const methodsOf = (route: RouteOptions): string[] =>
  Array.isArray(route.method) ? route.method : [route.method]

/** Every `.ts`/`.tsx` file under a root, read as text — 007's source-level audit shape. */
const sourceFiles = (directory: string): string[] => {
  const entries = readdirSync(directory, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(entry.name) ? [path] : []
  })
}

/**
 * Source with **every comment stripped**, so these guards read code rather than prose.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS NOT A CONVENIENCE — WITHOUT IT THE GUARDS ARE BOTH WRONG WAYS AT ONCE.**
 *
 * Each assertion below searches for a word that would betray a forbidden mechanism: `answered`,
 * `moderat`, `shared_cards`, `question`. Those words also appear, unavoidably and by design, in
 * the comments **explaining why the mechanism is absent** — `schema/questions.ts` cites 008's
 * `shared_cards` re-seed trap, `attendees.ts` says it holds no "security question", and this
 * feature's files say "no moderator by construction" repeatedly.
 *
 * Matching raw text therefore fails on a correct implementation, and the natural repair is to
 * weaken the pattern until it passes — at which point the guard no longer catches the thing it
 * was written for. Stripping comments keeps the pattern strict *and* true.
 *
 * The stripper is deliberately simple: it does not attempt to preserve string literals
 * containing `//`, because a false *negative* here would require somebody to hide a column name
 * inside a string, which no ORM declaration does.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const codeOnly = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/^\s*--.*$/gm, ' ')

/** The routes this feature registers, by path. */
const QUESTION_ROUTE = /\bquestions?\b/

describe('009 — the absences that are requirements', () => {
  let routes: RouteOptions[]

  beforeAll(async () => {
    routes = []
    const app = await buildApp({ onRoute: (route) => routes.push(route) })
    await app.close()
  })

  it('found routes to audit', () => {
    // A gate that cannot fail is not a gate. Every assertion below is over a filtered list, and
    // an empty route table would satisfy all of them while checking nothing.
    expect(routes.length).toBeGreaterThan(5)
    expect(routes.filter((route) => QUESTION_ROUTE.test(route.url)).length).toBeGreaterThan(0)
  })

  /**
   * T085 — **no edit route and no `PATCH`, and no column to hold a revision** (FR-709, FR-770).
   *
   * Withdrawal is the only retraction. A question is published to a whole conference under a
   * real name; letting its author rewrite it under the votes it already attracted would make
   * every upvote a vote for something that may no longer exist.
   */
  it('exposes no way to edit a question (FR-709, FR-770)', () => {
    const edits = routes
      .filter((route) => QUESTION_ROUTE.test(route.url))
      .filter((route) => methodsOf(route).some((method) => ['PATCH', 'PUT'].includes(method)))
      .map((route) => `${methodsOf(route).join('/')} ${route.url}`)

    expect(
      edits,
      'A question edit route exists. Withdrawal is the only retraction (FR-709): an edited ' +
        'question would carry upvotes cast for what it used to say.',
    ).toEqual([])

    // …and no column could hold one either, which is what makes the absence structural rather
    // than a route somebody forgot to register.
    const schema = codeOnly(join(apiSrc, 'db/schema/questions.ts'))
    expect(schema).not.toMatch(/edited_at|editedAt|revision|previous_body/i)
  })

  /**
   * T086 — **no downvote and no reaction** (FR-723, FR-771).
   *
   * The vote routes express exactly one thing: add or remove *the caller's own* upvote. There is
   * no direction parameter, no reaction type, and no column that could carry either.
   */
  it('exposes no downvote and no reaction (FR-723, FR-771)', () => {
    const suspicious = routes
      .map((route) => route.url)
      .filter((url) => /downvote|reaction|emoji|sentiment|dislike/i.test(url))

    expect(suspicious).toEqual([])

    const schema = codeOnly(join(apiSrc, 'db/schema/questions.ts'))
    expect(schema).not.toMatch(/direction|reaction|weight|score\b/i)

    // The vote routes take **no body at all** — there is nowhere to put a direction even if
    // somebody wanted to, which is stronger than the routes merely not reading one today.
    for (const route of routes.filter((candidate) => /\/vote$/.test(candidate.url))) {
      const schema = route.schema as { body?: unknown } | undefined
      expect(
        schema?.body,
        `${route.url} accepts a body, which a vote does not need`,
      ).toBeUndefined()
    }
  })

  /**
   * T087 — **no route or repository method reveals who voted** (FR-721, FR-769).
   *
   * This is what makes upvoting safe to offer. A reader learns the count and their own state,
   * and nothing else — so an unpopular question cannot be traced back to the people who backed
   * it, in a product where everybody is under a real name.
   */
  it('reveals no voter, in any route response schema (FR-721, FR-769)', () => {
    for (const route of routes.filter((candidate) => QUESTION_ROUTE.test(candidate.url))) {
      const serialised = JSON.stringify(route.schema ?? {})

      expect(serialised, `${route.url} names a voter in its schema`).not.toMatch(
        /"(voters|votedBy|voterIds|votedByAttendee)"/,
      )
    }

    // The query layer has no such projection either. `votedByMe` is an EXISTS over the reader
    // alone, which is the only vote fact the whole feature can express.
    const query = codeOnly(join(apiSrc, 'db/queries/questions.ts'))
    expect(query).not.toMatch(/voter_id|voters|array_agg\(v\./i)
  })

  /**
   * T088 — **no answer, no `answered` flag, no pin, no moderation route** (FR-768).
   *
   * Each of these is an **organizer** act. Answering from the stage is a thing that happens in
   * the room, not in the product; pinning and moderating need somebody with authority over other
   * people's questions, and Principle III excludes that actor by construction. A report is not
   * moderation — it removes and protects for *one reader* and sends the matter out of the
   * product to a human.
   */
  it('exposes no organizer act on a question (FR-768)', () => {
    const organizer = routes
      .map((route) => route.url)
      .filter((url) => /answer|pin\b|moderat|approve|feature|highlight|dismiss/i.test(url))

    expect(
      organizer,
      'A route that answers, pins, approves or moderates a question exists. Each is an ' +
        'organizer act, and Principle III excludes that actor from this product by construction.',
    ).toEqual([])

    const schema = codeOnly(join(apiSrc, 'db/schema/questions.ts'))
    expect(schema).not.toMatch(/answered|answer_text|pinned|approved|hidden|moderat/i)
  })

  /**
   * T090 — **no de-duplication and no "you already asked that" refusal** (FR-773b).
   *
   * Two people asking the same question is information — it is how a room signals what it most
   * wants answered, and upvoting is the mechanism for consolidating it. A server that refused a
   * near-duplicate would be making an editorial judgement, which is the organizer act FR-768
   * excludes wearing a different hat.
   */
  it('refuses nothing for being similar to an existing question (FR-773b)', () => {
    const query = codeOnly(join(apiSrc, 'db/queries/questions.ts'))
    const route = codeOnly(join(apiSrc, 'routes/events/questions.ts'))

    for (const source of [query, route]) {
      expect(source).not.toMatch(/duplicate|similar|already_asked|alreadyAsked|levenshtein/i)
    }

    // And no unique constraint on the body could impose one accidentally.
    const schema = codeOnly(join(apiSrc, 'db/schema/questions.ts'))
    expect(schema).not.toMatch(/unique\(.*body|uniqueIndex/i)
  })

  /**
   * T090b — **no contact, connection or relationship is derived from a question or a vote**
   * (FR-740, constitution v3.2.0 N1).
   *
   * A contact is somebody whose card you hold, and nothing else. 007's open send already made a
   * conversation unilateral, which is why v3.2.0 forbids deriving contacts from one; a question
   * is **more** unilateral still — it reaches everybody at the conference at once, so deriving
   * contacts from it would let one attendee insert themselves into a whole room's Network by
   * asking a single question.
   */
  it('derives no contact from a question or a vote (FR-740, v3.2.0 N1)', () => {
    const feature = [
      join(apiSrc, 'db/queries/questions.ts'),
      join(apiSrc, 'routes/events/questions.ts'),
      join(apiSrc, 'db/schema/questions.ts'),
    ]

    for (const path of feature) {
      const source = codeOnly(path)

      // Reading `shared_cards` from Q&A would be the shape of the mistake: a join that turns
      // "asked a question here" into "is a contact".
      expect(source, `${path} touches shared_cards`).not.toMatch(/shared_cards|sharedCards/)
      expect(source, `${path} writes a contact`).not.toMatch(/insert into shared_cards/i)
    }

    // The converse direction too: nothing in the card layer reads questions to build its list.
    const cards = codeOnly(join(apiSrc, 'db/queries/cards.ts'))
    expect(cards).not.toMatch(/session_questions|question_votes/)
  })

  /**
   * T090c — **no notification bell, no in-app notification centre, and no column on the attendee
   * record** (FR-767, FR-738).
   *
   * The bell has been forbidden since 1.0.0 and stayed forbidden through v3.1.0, which brought
   * *delivery* into scope for a received message and nothing else. This feature dispatches no
   * notification at all, so it has no reason to want one — but a Q&A surface is exactly where
   * somebody would reach for it next.
   */
  it('adds no column to the attendee record (FR-738)', () => {
    const attendeesSchema = codeOnly(join(apiSrc, 'db/schema/attendees.ts'))

    // The shapes a Q&A feature would plausibly add: a preference, a mute, a counter.
    expect(attendeesSchema).not.toMatch(/question|qa_|upvote/i)
  })

  it('introduces no notification bell and no notification centre (FR-767)', () => {
    const client = sourceFiles(webSrc)

    const bells = client.filter((path) => /bell|notification-cent|NotificationCent/i.test(path))
    expect(bells, 'a notification bell or centre appeared in the client').toEqual([])

    // 007's `NotificationPrompt` is the only notification surface, and it renders nothing once
    // answered — asserted by name so this does not become a test that passes because nothing
    // matched a pattern that no longer describes anything.
    const prompts = client.filter((path) => /NotificationPrompt/.test(path))
    expect(
      prompts,
      "007's permission prompt is missing — has the pattern gone stale?",
    ).toHaveLength(1)
  })
})
