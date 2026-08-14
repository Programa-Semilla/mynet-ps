import { expect, test, type Page } from '@playwright/test'

import { ALAN, signIn, useConference } from './support/attendees.js'
import { ADMIN_ORIGIN, WEB_ORIGIN } from './support/env.js'
import { signInAsOperator } from './support/operators.js'

/**
 * T095, T078 (014) — **an organizer authors, and an attendee in another browser sees it**
 * (SC-1001, SC-1002, SC-1004, SC-1011).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **TWO PRODUCTS, TWO ORIGINS, TWO BROWSER CONTEXTS — WHICH IS THE ONLY PLACE THIS FEATURE'S
 * CLAIM CAN ACTUALLY BE OBSERVED.**
 *
 * Everything below is asserted somewhere else at a lower layer: the integration suite proves the
 * writes and the fan-out, the component tests prove each rendering. What no layer below this can
 * show is the sentence the feature exists to make true — *a person authors a programme in one
 * product and a different person, signed in elsewhere, is told about it.*
 *
 * Two contexts rather than two pages, because they need separate cookie jars: the administrative
 * session is host-only on `admin.<host>` by decision 37, and sharing a jar would prove nothing
 * about two people.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE CONFERENCE IS CREATED BY THIS SPEC, AND THAT IS A SAFETY REQUIREMENT RATHER THAN A
 * DEMONSTRATION OF US4.**
 *
 * The end-to-end database is **seeded once for the whole run** and Playwright runs these files
 * serially in alphabetical order. Cancelling a seeded session here would break every later spec
 * that reads the seeded programme — `first-viewport`, `responsive`, `session-panel`,
 * `session-qa` — and the failure would appear three files away with no obvious cause.
 *
 * So this spec authors into a conference it makes itself, which touches nothing anybody else
 * depends on. That it also exercises US4 end to end is a genuine bonus rather than the reason.
 *
 * **Alan is the attendee** for the same class of reason: he is the seeded third party used by
 * one earlier spec (`admin-moderation`, which sorts before this one) and by nothing after it, so
 * a conference appearing in his switcher changes no other assertion. Using Ada or Grace would
 * add a conference to a switcher that `discover`, `agenda-saved-scoping` and
 * `messages-conference-switch` all read.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **T078 — SC-1004 IS MEASURED AS WHEN THE CHANGE REACHES THE ATTENDEE'S PRODUCT, NOT AS WHEN A
 * PUSH PAYLOAD IS RECORDED.**
 *
 * The task words it as *"measured against the sink adapter"*. The sink is an in-process object
 * inside the API, and nothing exposes it over HTTP — deliberately, since a route that read it
 * would be a test-only endpoint in production code, and this project has refused those
 * consistently. Adding one to time an assertion would be a worse trade than the assertion is
 * worth.
 *
 * What is observable here is the thing SC-1004 is actually about: within a minute of the
 * organizer acting, an attendee who looks sees the change. The **dispatch** itself is asserted
 * against the sink where the sink lives — `dispatch-coalescing`, `dispatch-no-savers`,
 * `dispatch-excludes-actor` and `dispatch-failure-isolation` all read it directly in the
 * integration suite. Recorded in `deviations.md`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const CONFERENCE = 'Authoring Spec Conference'
const SESSION = 'A Session Authored End To End'
const TRACK = 'Authoring Track'
const ROOM = 'Authoring Room'

/** Dates far from any seeded conference, so nothing about "today" is load-bearing. */
const FIRST_DAY = '2029-04-02'
const LAST_DAY = '2029-04-04'

/** Creates the conference through the administrative UI and returns its join code. */
const createConference = async (page: Page): Promise<string> => {
  await page.goto(`${ADMIN_ORIGIN}/conferences`)
  await page.getByRole('button', { name: /create a conference/i }).click()

  await page.getByLabel('Name').fill(CONFERENCE)
  await page.getByLabel('Location').fill('A Test Venue')
  await page.getByLabel('First day').fill(FIRST_DAY)
  await page.getByLabel('Last day').fill(LAST_DAY)
  await page.getByLabel('Venue timezone').fill('UTC')

  // `exact` because the list's own "Create a conference" button is still in the accessibility
  // tree behind the dialog, and a substring match resolves to both.
  await page.getByRole('button', { name: 'Create', exact: true }).click()

  // The code is presented once, here — 015 owns viewing it later, so this is the moment.
  const code = page.locator('.font-mono').first()
  await expect(code).toBeVisible()
  const joinCode = ((await code.textContent()) ?? '').trim()
  expect(joinCode, 'no join code was displayed after creating a conference').toMatch(
    /^[A-Z0-9]{8}$/,
  )

  await page.getByRole('button', { name: 'Done' }).click()
  return joinCode
}

test.describe('conference content authoring, end to end', () => {
  test('an organizer authors a programme and an attendee sees, saves and is marked', async ({
    browser,
  }) => {
    // Two products, four sign-ins, a create, three writes and two reloads. The default budget is
    // for a single journey on one origin.
    test.slow()

    const admin = await browser.newContext()
    const attendee = await browser.newContext()
    const adminPage = await admin.newPage()
    const attendeePage = await attendee.newPage()

    try {
      // ─────────────────────────────────────────────────────────────────────────────────────
      // 1. The organizer's side: a conference, a track, a room and a session.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await signInAsOperator(adminPage)
      const joinCode = await createConference(adminPage)

      await adminPage.getByRole('link', { name: CONFERENCE }).click()
      await expect(adminPage.getByRole('heading', { name: CONFERENCE })).toBeVisible()

      // The empty state is the first screen of every new conference, and it says out loud that
      // there is no draft to publish from (decision 43).
      await expect(adminPage.getByText(/no sessions yet/i)).toBeVisible()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // `exact: true`, because each row now carries an **"Edit <name>"** control beside the name.
      //
      // FR-1001's update verb had no surface until the deep review — `updateTrack`, `updateRoom`
      // and `updateSpeaker` were routed, tested and callable by nothing — so a mistyped room name
      // was uncorrectable, FR-1017 refusing deletion while any session referenced it. The
      // `InlineEdit` control that closed that gap labels its buttons with the subject, which a
      // list of them otherwise reads as "Edit, Edit, Edit" to a screen reader.
      //
      // So a substring match on the name now resolves to two elements, and Playwright's strict
      // mode says so rather than silently picking one. The accessible name is what disambiguates,
      // which is the same reason the session form below is scoped to its region.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await adminPage.getByLabel('Track name').fill(TRACK)
      await adminPage.getByRole('button', { name: 'Add track' }).click()
      await expect(adminPage.getByText(TRACK, { exact: true })).toBeVisible()

      await adminPage.getByLabel('Room name').fill(ROOM)
      await adminPage.getByRole('button', { name: 'Add room' }).click()
      await expect(adminPage.getByText(ROOM, { exact: true })).toBeVisible()

      await adminPage.getByRole('button', { name: /add a session/i }).click()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // Scoped to the Sessions region, because **the Speakers section also has a `Title`
      // field** — a speaker's job title — and an unscoped label match resolves to both.
      //
      // That the two coexist is correct: they are different things that happen to share an
      // English word. The region is the disambiguator the accessibility tree already provides,
      // which is why each section is a labelled `<section>` in the first place.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const sessionForm = adminPage.getByRole('region', { name: 'Sessions' })
      await sessionForm.getByLabel('Title').fill(SESSION)
      // The time fields are labelled with the venue's zone — `Starts (UTC)` — because a naked
      // "Starts" beside an absolute instant is the ambiguity FR-1012 turns into a refusal.
      await sessionForm.getByLabel(/^Starts \(/).fill(`${FIRST_DAY}T09:00`)
      await sessionForm.getByLabel(/^Ends \(/).fill(`${FIRST_DAY}T10:00`)
      await sessionForm.getByRole('button', { name: 'Add session' }).click()

      await expect(adminPage.getByText(SESSION)).toBeVisible()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // 2. The attendee's side: join by the minted code, and the programme is simply there.
      //
      // SC-1011, and the strongest form of decision 34's "one class of conference": nothing was
      // seeded, migrated or published between the organizer typing and the attendee reading.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await attendeePage.goto(WEB_ORIGIN)
      await signIn(attendeePage, ALAN)

      await attendeePage.goto(`${WEB_ORIGIN}/join`)
      await attendeePage.getByLabel('Join code').fill(joinCode)
      await attendeePage.getByRole('button', { name: /join conference/i }).click()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // **Wait for the join to LAND before navigating, and assert that it did.**
      //
      // `click()` resolves once the event is dispatched, not once the request it starts has
      // finished — so going straight to `/agenda` tore the page down with the join POST still in
      // flight and cancelled it. The attendee stayed registered for one conference, and the
      // failure surfaced eighty lines later as "the conference switcher is not visible", which
      // is true and says nothing about why.
      //
      // `JoinConference` navigates to `/` on success (FR-315: the conference just joined becomes
      // the active one by derivation), so the redirect is the signal. Asserting it here also
      // closes a real gap: nothing in this journey checked that joining worked, and a refused
      // join would have been reported as a missing control on a later screen.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await expect(
        attendeePage,
        'joining by the minted code did not take the attendee to Home, so the join was refused ' +
          'or never completed (FR-315)',
      ).toHaveURL(`${WEB_ORIGIN}/`)

      await attendeePage.goto(`${WEB_ORIGIN}/agenda`)
      await useConference(attendeePage, CONFERENCE)
      await expect(
        attendeePage.getByRole('link', { name: SESSION }),
        'the authored session did not reach the attendee’s Agenda (SC-1001)',
      ).toBeVisible()

      // 3. Saved, which is what makes the attendee a subscriber to changes (v4.2.0 N1).
      await attendeePage
        .getByRole('button', { name: new RegExp(`Save ${SESSION} to your agenda`, 'i') })
        .click()
      await expect(
        attendeePage.getByRole('button', { name: new RegExp(`Remove ${SESSION}`, 'i') }),
      ).toBeVisible()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // 4. The organizer cancels it, and the clock starts.
      // ─────────────────────────────────────────────────────────────────────────────────────
      const changedAt = Date.now()

      await adminPage.getByRole('button', { name: /cancel or delete/i }).click()
      // "Cancel the session" rather than "Delete it permanently": one attendee has saved it, so
      // the delete control is not offered at all (FR-1018) — the screen teaches the rule instead
      // of the organizer learning it from a 409.
      await adminPage.getByRole('button', { name: 'Cancel the session' }).click()
      await expect(adminPage.getByText('Cancelled')).toBeVisible()

      // ─────────────────────────────────────────────────────────────────────────────────────
      // 5. The attendee sees it. **On the next read** — nothing in this product polls the
      //    programme, so `expect.toPass` around a reload is the honest shape: it measures how
      //    long until a look succeeds rather than converting a missing write into a slow pass.
      // ─────────────────────────────────────────────────────────────────────────────────────
      await expect(async () => {
        await attendeePage.reload()
        await expect(attendeePage.getByText('Cancelled').first()).toBeVisible({ timeout: 5_000 })
      }).toPass({ timeout: 55_000 })

      const elapsed = Date.now() - changedAt
      expect(
        elapsed,
        `A material change took ${Math.round(elapsed / 1000)}s to reach the attendee. SC-1004 ` +
          'bounds it at one minute — an attendee who is told their session moved after it was ' +
          'due to start has been told nothing.',
      ).toBeLessThan(60_000)

      // The marker, on the row, in text (FR-1030) — and it is the half that survives a refused
      // notification permission, which is why it is asserted here rather than assumed.
      await expect(
        attendeePage.getByText('Changed').first().or(attendeePage.getByText('Cancelled').first()),
      ).toBeVisible()

      // 6. Nothing anybody wrote was destroyed, and the session is still removable (FR-1023).
      await expect(
        attendeePage.getByRole('button', { name: new RegExp(`Remove ${SESSION}`, 'i') }),
        'a cancelled session must stay removable from the attendee’s own agenda (FR-1023)',
      ).toBeVisible()
    } finally {
      await admin.close()
      await attendee.close()
    }
  })
})
