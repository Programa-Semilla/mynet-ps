import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { getDb } from '../../src/db/client.js'
import { cookieHeader, resetDatabase, setupTestApp, teardown } from './helpers.js'
import {
  ADA,
  ADA_ONLY_EVENT,
  ALAN,
  eventIdNamed,
  GRACE,
  GRACE_ONLY_EVENT,
  listHeld,
  readHeld,
  shareCard,
  signIn,
  switchTo,
  type Actor,
  type HeldCardBody,
} from './network-fixtures.js'

/**
 * T065–T068 (008) — **a relationship that outlives the conference** (FR-611–FR-614, SC-602,
 * SC-603).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE ASSERTS THREE ABSENCES, WHICH IS WHY IT EXISTS AT ALL.**
 *
 * The resolution rule in `queries/cards.ts` is *no discoverability condition, no verification
 * condition, no registration join*. Every one of those looks, in the source, exactly like
 * somebody forgetting a `WHERE` — and the neighbouring directory query has all three. A future
 * reader "fixing" any of them would break the feature's whole purpose and no other test in the
 * suite would notice, because every other test shares a conference and keeps everybody visible.
 *
 * `quickstart.md` scenario 2 puts it plainly: *if B's contact goes blank here, the standing
 * consent rule has been lost and the feature's whole purpose with it.*
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('a held card outlives the conference it was shared at', () => {
  let app: FastifyInstance
  let ada: Actor
  let grace: Actor

  beforeAll(async () => {
    app = await setupTestApp()
    await resetDatabase()
    ada = await signIn(app, ADA)
    grace = await signIn(app, GRACE)

    // Ada gives Grace her card at the conference they share.
    const shared = await shareCard(app, ada, grace.id)
    expect(shared.statusCode).toBe(201)
  })

  afterAll(async () => {
    await teardown(app)
  })

  /**
   * T065 — **the reader switches to a conference the sharer has never attended** (FR-614).
   *
   * `Systems & Scale` is Grace's alone; Ada is not registered for it and never has been. If the
   * held-card query carried the registration join the directory has, this would return nothing —
   * which is the disappearing-contacts failure the whole model exists to prevent.
   */
  it('T065 — resolves after the holder switches to a conference the sharer is not in (FR-614)', async () => {
    const gracesOwn = await eventIdNamed(app, grace, GRACE_ONLY_EVENT)
    const switched = await switchTo(app, grace, gracesOwn)
    expect(switched.statusCode).toBeLessThan(300)

    const contacts = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }

    expect(
      contacts.cards.map((card) => card.attendeeId),
      'The contact vanished when the holder switched conference. A held card is cross-event ' +
        '(FR-614, standing decision 7) — if the query has acquired a registration join, the ' +
        "feature's whole purpose has gone with it.",
    ).toEqual([ada.id])

    // It still names the conference the exchange **happened at**, which is a historical fact and
    // not the conference the reader is now in (FR-615).
    expect(contacts.cards[0]?.eventName).toBe('Product & Design Summit')

    // And it is correctly **not** schedulable here: Ada is not at this conference, so the client
    // offers no meeting action rather than offering one and refusing afterwards (FR-639a).
    expect(contacts.cards[0]?.atActiveEvent).toBe(false)
  })

  it('marks the contact schedulable again once the reader returns to a shared conference', async () => {
    // The other half of `atActiveEvent`: it is a *display* input that changes with the active
    // conference, and it must never have become a filter — the card resolved in both states.
    const shared = await eventIdNamed(app, grace, 'Product & Design Summit')
    await switchTo(app, grace, shared)

    const contacts = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    expect(contacts.cards[0]?.atActiveEvent).toBe(true)
  })

  /**
   * T066 — **discoverability governs being found, not being remembered** (FR-612, SC-602).
   *
   * The sharer turns themselves off. They vanish from Discover for everybody — which the same
   * assertion checks, so this cannot pass by the toggle simply not working — and they remain a
   * fully resolvable contact for the person holding their card.
   */
  it('T066 — the sharer going undiscoverable removes them from Discover and NOT from Network (FR-612, SC-602)', async () => {
    const shared = await eventIdNamed(app, ada, 'Product & Design Summit')

    const hidden = await app.inject({
      method: 'PUT',
      url: '/profile/discoverability',
      headers: { cookie: cookieHeader(ada.cookie) },
      payload: { discoverable: false },
    })
    expect(hidden.statusCode).toBeLessThan(300)

    // The control half: Ada really is gone from the directory.
    const directory = await app.inject({
      method: 'GET',
      url: `/events/${shared}/attendees`,
      headers: { cookie: cookieHeader(grace.cookie) },
    })
    const listed = (directory.json() as { attendees: { attendeeId: string }[] }).attendees
    expect(
      listed.map((entry) => entry.attendeeId),
      'Ada is still in the directory after turning discoverability off, so this test would ' +
        'have proved nothing about the contact surviving.',
    ).not.toContain(ada.id)

    // The assertion: her card still resolves for the person she gave it to.
    const contacts = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    expect(
      contacts.cards.map((card) => card.attendeeId),
      'The contact disappeared when the sharer turned discoverability off. Discoverability ' +
        'governs being FOUND, not being REMEMBERED (FR-612, constitution v3.2.0 N2) — a global ' +
        'directory setting is not a retraction of an individual gift.',
    ).toEqual([ada.id])

    // The single read is subject to the same rule, and is checked separately: a list and a
    // single read that disagreed would leave one surface honest and the other not.
    const single = await readHeld(app, grace, ada.id)
    expect(single.statusCode).toBe(200)

    // Restored, so later tests in this file are not written against a hidden Ada.
    await app.inject({
      method: 'PUT',
      url: '/profile/discoverability',
      headers: { cookie: cookieHeader(ada.cookie) },
      payload: { discoverable: true },
    })
  })

  /**
   * T067 — **the profile resolves live** (FR-611, SC-603).
   *
   * The holder does nothing at all. If the model had stored a snapshot at share time, this would
   * still show the old company — and would go on showing it after the person had left that job,
   * to everybody who had ever met them.
   */
  it('T067 — an edit by the sharer reaches the holder with no action by the holder (FR-611, SC-603)', async () => {
    const edited = await app.inject({
      method: 'PUT',
      url: '/profile',
      headers: { cookie: cookieHeader(ada.cookie) },
      payload: { company: 'Difference Engines', role: 'Principal Engineer' },
    })
    expect(edited.statusCode).toBeLessThan(300)

    const contacts = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }

    expect(contacts.cards[0]).toMatchObject({
      company: 'Difference Engines',
      role: 'Principal Engineer',
    })
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * T068 — **verification state is never consulted, asserted by INSPECTION** (FR-613).
   *
   * This one cannot be tested behaviourally, and the reason is worth writing down rather than
   * working around: **no action in the product un-verifies an account.** A profile that can be
   * shared already carries a verified address, so a query that *did* consult
   * `email_verified_at` would behave identically to one that does not, forever — right up until
   * some later feature introduced a way to lose verification, at which point every contact of
   * that attendee would silently blank.
   *
   * So the assertion is over the source. It is not a stylistic check: the constitution's
   * standing invariant is that **verification gates exactly one thing — discoverability — and
   * no feature may use it for anything else**, and this is the file where a second use would
   * most plausibly be added in good faith, by somebody copying the directory's `WHERE`.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('T068 — the resolution path never consults verification state (FR-613)', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../../src/db/queries/cards.ts', import.meta.url)),
      'utf8',
    )

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Scoped to `heldCardSelect`, not to the whole file, and the narrowing is the point.**
    //
    // `shareCard` legitimately checks **both** conditions: you may only share with somebody you
    // could have *found*, so the insert carries the directory's `discoverable` and
    // `email_verified_at` predicates. Asserting over the file would therefore be asserting the
    // opposite of what the feature requires.
    //
    // The two rules are not in tension and the split is exactly where they differ:
    // discoverability governs whether a relationship can **start**, and standing consent governs
    // whether it **continues**. `heldCardSelect` is the fragment every read shares, so it is the
    // whole of the continuing half.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const start = source.indexOf('const heldCardSelect')
    const end = source.indexOf('type HeldRow', start)
    expect(
      start >= 0 && end > start,
      'The `heldCardSelect` fragment could not be located, so this test would have checked ' +
        'nothing. If the query was renamed or restructured, point this at the new resolution ' +
        'path — do not delete the assertion.',
    ).toBe(true)

    const fragment = source.slice(start, end)

    // Comments explaining the absence are expected and welcome — the fragment argues at length
    // about why the conditions are missing. What must not appear is a column in executable SQL.
    const executable = fragment
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')

    expect(
      /email_verified_at/.test(executable),
      'The card resolution path references `email_verified_at`. Verification gates exactly one ' +
        'thing in this product — discoverability — and no feature may use it for anything else ' +
        '(FR-613, constitution). A card that can be held was shared by a verified account; ' +
        'consulting it here would only ever matter on the day verification could be lost, and ' +
        'then every contact of that attendee would silently blank.',
    ).toBe(false)

    expect(
      /\bdiscoverable\b/.test(executable),
      "The card resolution path references `discoverable`. That is the directory's condition, " +
        'and applying it here would make a global "do not list me" setting silently cancel an ' +
        'individual decision to hand somebody a card (FR-612).',
    ).toBe(false)
  })

  /**
   * The database's own view of the same three absences, so the assertion above cannot be
   * satisfied by a query that reads correctly and a schema that has quietly acquired a
   * constraint doing the same job.
   */
  it('holds the card row itself independent of both parties’ visibility (FR-612, FR-613)', async () => {
    const rows = await getDb().execute<{ count: number }>(sql`
      SELECT count(*)::int AS count
      FROM shared_cards c
      JOIN attendees s ON s.id = c.sharer_id
      WHERE c.recipient_id = ${grace.id}::uuid
        AND c.sharer_id = ${ada.id}::uuid
    `)

    expect(rows[0]?.count).toBe(1)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **A CARD YOU DO NOT HOLD IS INDISTINGUISHABLE FROM ONE THAT DOES NOT EXIST** (FR-616,
   * FR-642).
   *
   * The equivalent guarantee for *sharing* is tested carefully — bodies compared, four causes —
   * and the read route had no counterpart. `card-audit.test.ts` exercises the brand check by
   * calling `assertVerifiedCard` with a forged scope, which proves the runtime guard and says
   * nothing about what an enumeration attacker actually observes: the response.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────
   * **T042 (016) — THE FIXTURE MOVED, THE GUARANTEE DID NOT.**
   *
   * This used to read a card from **Grace**, on the stated ground that *"Ada holds nothing from
   * Grace at this point in the file (only Grace holds Ada's card)"*. Constitution v5.0.0 (C1)
   * makes exchange mutual, so that premise is now false in one direction and the case answered
   * 200 — a genuine held card, not a leak.
   *
   * Alan is the honest "not held" pair: he is unverified and takes part in no exchange, so no
   * row exists in either direction. **The requirement is unchanged** — it is the fixture that
   * had to move, and swapping it is what keeps the enumeration guarantee under test rather than
   * quietly satisfied.
   * ─────────────────────────────────────────────────────────────────────────────────────
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('refuses a card not held identically to one that does not exist (FR-616, FR-642)', async () => {
    const alan = await signIn(app, ALAN)

    const notHeld = await readHeld(app, ada, alan.id)
    const nonexistent = await readHeld(app, ada, '00000000-0000-4000-8000-000000000000')
    const malformed = await readHeld(app, ada, 'not-a-uuid')

    for (const response of [notHeld, nonexistent, malformed]) {
      expect(response.statusCode).toBe(404)
    }

    expect(
      [notHeld.body, malformed.body],
      'These refusals differ. A caller who can tell "you do not hold this card" from "no such ' +
        'card" learns that two specific people exchanged, holding nothing but an identifier ' +
        '(FR-642).',
    ).toEqual([nonexistent.body, nonexistent.body])
  })

  it('resolves a card shared at a conference the READER has since left entirely', async () => {
    // The sharpest form of FR-614: Ada switches to a conference Grace is not in either, so
    // neither party's active conference has anything to do with the exchange.
    const adasOwn = await eventIdNamed(app, ada, ADA_ONLY_EVENT)
    await switchTo(app, ada, adasOwn)

    const contacts = (await listHeld(app, grace)).json() as { cards: HeldCardBody[] }
    expect(contacts.cards.map((card) => card.attendeeId)).toEqual([ada.id])
  })
})
