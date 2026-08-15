import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

import { ALAN, signIn, useConference } from './support/attendees.js'
import { ADMIN_ORIGIN, API_ORIGIN, WEB_ORIGIN } from './support/env.js'
import { signInAsOperator } from './support/operators.js'

/**
 * T202 (014 tranche 2) — quickstart scenarios 10–13: places are finite, full and closed are
 * different sentences, enrolment replaces saving, and a held place is notified where a deleted
 * one is deliberately not (US5, US6, FR-1063–FR-1079, SC-1013, SC-1015, SC-1025).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE CONFERENCE IS CREATED BY THIS SPEC, FOR `authoring.spec.ts`'s REASON.** The end-to-end
 * database is seeded once for the whole run, so enrolling into — and above all DELETING from —
 * a seeded programme would break later specs three files away. Everything here happens inside a
 * conference this file makes itself.
 *
 * **Alan is the browser-side attendee**, again for authoring's reason: a conference appearing
 * in his switcher changes no other spec's assertions. The three *racing* attendees are created
 * fresh through the API — scenario 10 needs three people who want the same two places, and the
 * seeded attendees' registrations are load-bearing elsewhere.
 *
 * **The race itself is run through the API, not through three browsers.** The property under
 * test is the server's critical section — one place never becomes two rows, in every ordering —
 * and three `PUT`s issued from one `Promise.all` reach the server closer together than three
 * browser automations ever would, which makes the test *stronger* where it matters. What the
 * browser is for is the sentences: the attendee-visible difference between "full" and "closed"
 * (SC-1015) is asserted in the rendered product, on top of the API-level assertion that the
 * server wrote them to be different.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const CONFERENCE = 'Enrolment Spec Conference'

/** All four sessions are optional except where a scenario says otherwise. */
const CONTESTED = 'Contested Places Workshop' // capacity 2, raced by three attendees
const CLOSED = 'Closed Enrolment Clinic' // closing offset already passed
const DOOMED = 'Doomed Optional Session' // places held, then deleted
const ENROLABLE = 'Enrolable Fireside' // Alan's own commitment journey

/**
 * The server's two refusal sentences, verbatim (FR-1069, FR-1069a). Asserted as *exact* strings
 * because the guarantee is that a reader can tell which happened without a second request — two
 * sentences that drifted into one would keep every weaker assertion green.
 */
const FULL_SENTENCE =
  'This session is full — every place is taken. If somebody releases one, it becomes available immediately.'
const CLOSED_SENTENCE =
  'Enrolment for this session has closed. Places are settled ahead of time so the organizer can prepare for the people attending.'

/**
 * Dates are computed from "now", which IS load-bearing here twice over and cannot be far-future
 * the way authoring's are: a closing offset is measured back from the session's start, so an
 * already-closed session needs a start near enough that the largest permitted offset (8760
 * hours) lies in the past — and the Home card this spec asserts composes the attendee's
 * programme for the venue's TODAY, so the sessions must fall on it while still being ahead of
 * the clock.
 *
 * The venue timezone is therefore CHOSEN at runtime rather than fixed: a fixed-offset zone in
 * which the venue-local clock currently reads ~05:00, leaving the whole venue day ahead of
 * "now" for sessions at local afternoon times. `Etc/GMT±N` names are IANA fixed-offset zones
 * with the sign inverted (Etc/GMT-9 is UTC+9).
 */
const utcHour = new Date().getUTCHours()
let shift = 5 - utcHour
if (shift < -12) shift += 24
const TIMEZONE = shift === 0 ? 'UTC' : shift > 0 ? `Etc/GMT-${shift}` : `Etc/GMT+${-shift}`

/** A calendar date, in the venue's clock, `days` venue-days from now. */
const venueDay = (days: number): string =>
  new Date(Date.now() + shift * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10)
const FIRST_DAY = venueDay(0)
const SESSION_DAY = FIRST_DAY
const LAST_DAY = venueDay(2)

/** Creates the conference through the administrative UI and returns its join code. */
const createConference = async (page: Page): Promise<string> => {
  await page.goto(`${ADMIN_ORIGIN}/conferences`)
  await page.getByRole('button', { name: /create a conference/i }).click()

  await page.getByLabel('Name').fill(CONFERENCE)
  await page.getByLabel('Location').fill('A Contested Venue')
  await page.getByLabel('First day').fill(FIRST_DAY)
  await page.getByLabel('Last day').fill(LAST_DAY)
  await page.getByLabel('Venue timezone').fill(TIMEZONE)
  // Required at creation, with no safe default (FR-1059b).
  await page.getByLabel('Modality').selectOption('in-person')

  await page.getByRole('button', { name: 'Create', exact: true }).click()

  const code = page.locator('.font-mono').first()
  await expect(code).toBeVisible()
  const joinCode = ((await code.textContent()) ?? '').trim()
  expect(joinCode, 'no join code was displayed after creating a conference').toMatch(
    /^[A-Z0-9]{8}$/,
  )

  await page.getByRole('button', { name: 'Done' }).click()
  return joinCode
}

/** Adds one optional session through the session form, with its capacity and closing offset. */
const addOptionalSession = async (
  page: Page,
  input: { title: string; starts: string; ends: string; capacity: number; offsetHours: number },
): Promise<void> => {
  await page.getByRole('button', { name: /add a session/i }).click()

  const form = page.getByRole('region', { name: 'Sessions' })
  await form.getByLabel('Title').fill(input.title)
  await form.getByLabel(/^Starts \(/).fill(input.starts)
  await form.getByLabel(/^Ends \(/).fill(input.ends)
  await form.getByLabel('Track').selectOption({ label: 'Enrolment Track' })
  await form.getByLabel('Room').selectOption({ label: 'Enrolment Room' })

  // The optional-session fields render only once the kind says so (FR-1061).
  await form.getByLabel('Kind').selectOption('optional')
  await form.getByLabel('Maximum places').fill(String(input.capacity))
  await form.getByLabel('Enrolment closes (hours before start)').fill(String(input.offsetHours))

  await form.getByRole('button', { name: 'Add session' }).click()
  await expect(page.getByText(input.title)).toBeVisible()
}

/** A fresh attendee: signed up and joined through the API, holding their own cookie jar. */
const signUpAndJoin = async (
  api: APIRequestContext,
  displayName: string,
  joinCode: string,
): Promise<string> => {
  const email = `${displayName.toLowerCase().replaceAll(' ', '-')}-${Date.now()}@example.com`
  const signedUp = await api.post('/auth/sign-up', {
    data: { email, displayName, password: 'a-long-enough-racing-password' },
  })
  expect(signedUp.status(), `${displayName} could not sign up`).toBe(204)

  const joined = await api.post('/events/join', { data: { joinCode } })
  expect(joined.ok(), `${displayName} could not join by the minted code`).toBe(true)
  const { event } = (await joined.json()) as { event: { id: string } }
  return event.id
}

test.describe('optional sessions and enrolment, end to end', () => {
  test('places are contested, sentences differ, enrolment replaces saving, deletion is silent', async ({
    browser,
  }) => {
    // Two products, five sign-ins, four session creations, a race and two reload loops.
    test.slow()

    const admin = await browser.newContext()
    const attendee = await browser.newContext()
    const adminPage = await admin.newPage()
    const attendeePage = await attendee.newPage()

    // The three racers. A context each: an `APIRequestContext` carries one cookie jar, so
    // sharing one would sign each racer out as the next signed in.
    const { request } = await import('@playwright/test')
    const racers = await Promise.all(
      [1, 2, 3].map(() => request.newContext({ baseURL: API_ORIGIN })),
    )
    const racerNames = ['Racing Attendee One', 'Racing Attendee Two', 'Racing Attendee Three']

    try {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // Setup: the conference, its programme, and the four attendees.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await signInAsOperator(adminPage)
      const joinCode = await createConference(adminPage)

      await adminPage.getByRole('link', { name: CONFERENCE }).click()
      await expect(adminPage.getByRole('heading', { name: CONFERENCE })).toBeVisible()

      await adminPage.getByLabel('Track name').fill('Enrolment Track')
      await adminPage.getByRole('button', { name: 'Add track' }).click()
      await expect(adminPage.getByText('Enrolment Track', { exact: true })).toBeVisible()

      await adminPage.getByLabel('Room name').fill('Enrolment Room')
      await adminPage.getByRole('button', { name: 'Add room' }).click()
      await expect(adminPage.getByText('Enrolment Room', { exact: true })).toBeVisible()

      await adminPage.getByLabel('Room name').fill('Moved Room')
      await adminPage.getByRole('button', { name: 'Add room' }).click()
      await expect(adminPage.getByText('Moved Room', { exact: true })).toBeVisible()

      await addOptionalSession(adminPage, {
        title: CONTESTED,
        starts: `${SESSION_DAY}T09:00`,
        ends: `${SESSION_DAY}T10:00`,
        capacity: 2,
        offsetHours: 0,
      })
      // 8760 hours — the largest offset the contract permits — before a start two days out
      // is a closing instant a year in the past, which is what "closed" needs to mean here.
      await addOptionalSession(adminPage, {
        title: CLOSED,
        starts: `${SESSION_DAY}T10:30`,
        ends: `${SESSION_DAY}T11:30`,
        capacity: 5,
        offsetHours: 8760,
      })
      await addOptionalSession(adminPage, {
        title: DOOMED,
        starts: `${SESSION_DAY}T13:00`,
        ends: `${SESSION_DAY}T14:00`,
        capacity: 3,
        offsetHours: 0,
      })
      await addOptionalSession(adminPage, {
        title: ENROLABLE,
        starts: `${SESSION_DAY}T15:00`,
        ends: `${SESSION_DAY}T16:00`,
        capacity: 5,
        offsetHours: 0,
      })

      const eventIds = await Promise.all(
        racers.map((api, index) => signUpAndJoin(api, racerNames[index]!, joinCode)),
      )
      const eventId = eventIds[0]!

      const listed = await racers[0]!.get(`/events/${eventId}/sessions`)
      expect(listed.ok()).toBe(true)
      const sessions = (await listed.json()) as { id: string; title: string }[]
      const idOf = (title: string): string => {
        const found = sessions.find((session) => session.title === title)
        expect(found, `"${title}" is missing from the attendee-visible programme`).toBeDefined()
        return found!.id
      }
      const contestedId = idOf(CONTESTED)
      const closedId = idOf(CLOSED)
      const doomedId = idOf(DOOMED)
      const enrolableId = idOf(ENROLABLE)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // Scenario 10 — three people, two places, one moment (FR-1068).
      //
      // `Promise.all` puts the three writes on the wire together, which is as close to "the
      // same moment" as anything outside the server can arrange. The assertion is exhaustive
      // over orderings because it counts outcomes rather than assuming who wins.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const raced = await Promise.all(
        racers.map((api) => api.put(`/events/${eventId}/agenda/places/${contestedId}`)),
      )
      const statuses = raced.map((response) => response.status())
      expect(
        statuses.filter((status) => status === 204),
        `two of three concurrent enrolments must land; got ${statuses.join(', ')}`,
      ).toHaveLength(2)

      const refusedIndex = statuses.findIndex((status) => status === 409)
      expect(
        refusedIndex,
        `exactly one racer must be refused; got ${statuses.join(', ')}`,
      ).toBeGreaterThanOrEqual(0)
      const refusedBody = (await raced[refusedIndex]!.json()) as { code: string; message: string }
      // The failure says the session is full — not that something went wrong.
      expect(refusedBody.code).toBe('session_full')
      expect(refusedBody.message).toBe(FULL_SENTENCE)

      // No place exists beyond the capacity: the live figure agrees…
      const places = await racers[0]!.get(`/events/${eventId}/sessions/${contestedId}/places`)
      expect((await places.json()) as { remaining: number; open: boolean }).toEqual({
        remaining: 0,
        open: true,
      })

      // …and so does the organizer's roster, by name (FR-1073): exactly the two winners.
      const winners = racerNames.filter((_, index) => statuses[index] === 204)
      await adminPage.reload()
      await expect(adminPage.getByText('Optional · 2 of 2 places held')).toBeVisible()
      await adminPage
        .getByRole('listitem')
        .filter({ hasText: CONTESTED })
        .getByRole('button', { name: 'Roster', exact: true })
        .click()
      await expect(adminPage.getByRole('heading', { name: 'Who holds a place' })).toBeVisible()
      await expect(adminPage.getByText('2 of 2 places held · 0 left')).toBeVisible()
      for (const winner of winners) {
        await expect(adminPage.getByText(winner)).toBeVisible()
      }
      const loser = racers[statuses.findIndex((status) => status === 409)]!

      // ─────────────────────────────────────────────────────────────────────────────────────
      // Scenario 11 — full and closed are different sentences (FR-1069, FR-1069a, SC-1015).
      // ─────────────────────────────────────────────────────────────────────────────────────
      const closedAttempt = await loser.put(`/events/${eventId}/agenda/places/${closedId}`)
      expect(closedAttempt.status()).toBe(409)
      const closedBody = (await closedAttempt.json()) as { code: string; message: string }
      expect(closedBody.code).toBe('enrolment_closed')
      expect(closedBody.message).toBe(CLOSED_SENTENCE)

      // Different from each other — the property `instanceof` classification destroys, and the
      // reason both sentences are pinned verbatim above.
      expect(closedBody.code).not.toBe(refusedBody.code)
      expect(closedBody.message).not.toBe(refusedBody.message)

      // ─────────────────────────────────────────────────────────────────────────────────────
      // The browser half of scenarios 10 and 11: a reader can tell which happened WITHOUT a
      // second request — the figure beside the control already says so (FR-1070).
      // ─────────────────────────────────────────────────────────────────────────────────────
      await attendeePage.goto(WEB_ORIGIN)
      await signIn(attendeePage, ALAN)
      await attendeePage.goto(`${WEB_ORIGIN}/join`)
      await attendeePage.getByLabel('Join code').fill(joinCode)
      await attendeePage.getByRole('button', { name: /join conference/i }).click()
      await expect(
        attendeePage,
        'joining by the minted code did not take the attendee to Home (FR-315)',
      ).toHaveURL(`${WEB_ORIGIN}/`)

      await attendeePage.goto(`${WEB_ORIGIN}/agenda`)
      await useConference(attendeePage, CONFERENCE)

      // The panel is a modal <dialog>; the pre-enrolment confirmation is another one nested
      // inside it, so locators are scoped by each dialog's own text.
      const panel = attendeePage.getByRole('dialog').filter({ hasText: 'Your commitment' })

      await attendeePage.getByRole('link', { name: CONTESTED }).click()
      await expect(panel.getByText('Session full')).toBeVisible()

      // Attempting anyway meets the full sentence in the product, beside the control (FR-1069).
      await panel.getByRole('button', { name: `Take a place in ${CONTESTED}` }).click()
      const confirm = attendeePage
        .getByRole('dialog')
        .filter({ hasText: 'Before you take a place' })
      await expect(
        confirm.getByText(/your name on this session’s enrolment list/),
        'the FR-1074 roster disclosure must be shown before enrolment, not after',
      ).toBeVisible()
      await confirm.getByRole('button', { name: 'Take a place', exact: true }).click()
      // `.first()`: the refusal renders both as a panel-level banner and beside the control.
      await expect(attendeePage.getByText(FULL_SENTENCE).first()).toBeVisible()

      await attendeePage.goto(`${WEB_ORIGIN}/agenda`)
      await attendeePage.getByRole('link', { name: CLOSED }).click()
      await expect(panel.getByText('Enrolment closed')).toBeVisible()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // Scenario 12 — enrolment replaces saving (FR-1063, FR-1064, FR-1066).
      // ─────────────────────────────────────────────────────────────────────────────────────
      // Exactly one commitment control, and it is not a save: no surface anywhere offers to
      // save an optional session.
      await expect(
        attendeePage.getByRole('button', { name: `Save ${ENROLABLE} to your agenda` }),
      ).toHaveCount(0)

      await attendeePage.goto(`${WEB_ORIGIN}/agenda`)
      await attendeePage.getByRole('link', { name: ENROLABLE }).click()
      await expect(panel.getByText('This session takes enrolment')).toBeVisible()
      await expect(
        panel.getByRole('button', { name: `Save ${ENROLABLE} to your agenda` }),
      ).toHaveCount(0)

      await panel.getByRole('button', { name: `Take a place in ${ENROLABLE}` }).click()
      await confirm.getByRole('button', { name: 'Take a place', exact: true }).click()
      await expect(panel.getByText('You hold a place in this session')).toBeVisible()
      await expect(panel.getByText('4 places left')).toBeVisible()

      // No route to save it: the server refuses with its own sentence, not a generic shape.
      const saveAttempt = await attendeePage.request.put(
        `${API_ORIGIN}/events/${eventId}/agenda/saved/${enrolableId}`,
      )
      expect(saveAttempt.status()).toBe(409)
      expect(((await saveAttempt.json()) as { code: string }).code).toBe('not_saveable')

      // The place puts the session on the attendee's own agenda…
      await attendeePage.goto(`${WEB_ORIGIN}/agenda`)
      await attendeePage.getByRole('radio', { name: 'My agenda' }).check()
      await expect(attendeePage.getByRole('link', { name: ENROLABLE })).toBeVisible()
      // …and the refused race left NO "saved but no place" residue (FR-1064).
      await expect(attendeePage.getByRole('link', { name: CONTESTED })).toHaveCount(0)

      // …and on the Home card that composes the attendee's own programme (FR-1066).
      await attendeePage.goto(`${WEB_ORIGIN}/`)
      await expect(
        attendeePage.getByRole('region', { name: 'Next on your programme' }).getByText(ENROLABLE),
      ).toBeVisible()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // Scenario 13 — a held place is notified of a change; a deleted session tells nobody
      // (FR-1079, FR-1077a, SC-1025).
      // ─────────────────────────────────────────────────────────────────────────────────────
      // The organizer moves the room of the session Alan holds a place in.
      await adminPage
        .getByRole('listitem')
        .filter({ hasText: ENROLABLE })
        .getByRole('button', { name: 'Edit', exact: true })
        .click()
      const editForm = adminPage.getByRole('region', { name: 'Sessions' })
      await editForm.getByLabel('Room').selectOption({ label: 'Moved Room' })
      // The outcome is read from the response, armed before the click (operators.ts's rule) —
      // this is the wait that caught the API's CORS list missing PATCH entirely, which every
      // route-level test walked past because `fastify.inject()` performs no preflight.
      const saved = adminPage.waitForResponse(
        (response) =>
          response.url().includes('/sessions/') && response.request().method() === 'PATCH',
        { timeout: 20_000 },
      )
      await editForm.getByRole('button', { name: 'Save changes' }).click()
      expect((await saved).status(), 'the room change was refused or never reached the API').toBe(
        200,
      )

      // The holder is told on the next read — nothing in this product polls the programme.
      await attendeePage.goto(`${WEB_ORIGIN}/agenda`)
      await expect(async () => {
        await attendeePage.reload()
        await expect(attendeePage.getByText('Changed').first()).toBeVisible({ timeout: 5_000 })
      }).toPass({ timeout: 55_000 })

      // Now the deletion: the loser — who holds nothing else — takes a place in the doomed
      // session, so their agenda afterwards is exactly empty if and only if nothing survived.
      const doomedEnrol = await loser.put(`/events/${eventId}/agenda/places/${doomedId}`)
      expect(doomedEnrol.status()).toBe(204)

      await adminPage.reload()
      await adminPage
        .getByRole('listitem')
        .filter({ hasText: DOOMED })
        .getByRole('button', { name: /cancel or delete/i })
        .click()

      // The organizer is shown the number held and told those attendees will not be notified
      // (FR-1077a, FR-1077c) — and deleting IS offered, because an enrolment is deliberately
      // not engagement (v5.3.0 O2).
      await expect(adminPage.getByText(/1 attendee holds a place in this session/)).toBeVisible()
      await expect(
        adminPage.getByText('will not be notified and their rows will carry no marker'),
      ).toBeVisible()
      await adminPage.getByRole('button', { name: 'Delete it permanently' }).click()
      await expect(adminPage.getByText(DOOMED)).toHaveCount(0)

      // Nothing reaches the person who held the place: no session, no row, no marker —
      // their commitment set is empty, not annotated (FR-1077a).
      const after = await loser.get(`/events/${eventId}/agenda/saved`)
      expect(after.ok()).toBe(true)
      expect(
        (await after.json()) as { sessions: unknown[] },
        'a deleted session must leave no row and no marker behind for the place it destroyed',
      ).toEqual({ sessions: [] })

      // And the programme itself no longer carries it, for anybody.
      await attendeePage.goto(`${WEB_ORIGIN}/agenda`)
      await expect(attendeePage.getByRole('link', { name: DOOMED })).toHaveCount(0)
    } finally {
      await Promise.all(racers.map((api) => api.dispose()))
      await admin.close()
      await attendee.close()
    }
  })
})
