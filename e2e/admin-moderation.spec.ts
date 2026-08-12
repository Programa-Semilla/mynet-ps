import { expect, test, type Page } from '@playwright/test'

import { ADA, ALAN, GRACE, SEED_PASSWORD, signIn, useConference } from './support/attendees.js'
import { ADMIN_ORIGIN } from './support/env.js'
import { seedQuestionReport, signInAsOperator } from './support/operators.js'

/**
 * T104 (011) — **a removed question is gone for every attendee at that conference** (FR-950,
 * FR-951, FR-952, SC-903).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THREE BROWSER PROFILES, BECAUSE "GONE FOR EVERYBODY" IS NOT A PROPERTY ONE SESSION CAN
 * SHOW.**
 *
 * The integration suite already proves the row and its votes are deleted, which is the mechanism.
 * What it cannot show is the outcome an attendee experiences: that the question disappears for a
 * reader who never reported anything, on their next look, with nothing left where it was and no
 * word about who removed it or why (FR-952).
 *
 * The three are the author, an uninvolved co-attendee, and the operator:
 *
 *   - **Grace** asked it. She must not be told it went, and must not find a tombstone.
 *   - **Ada** is the uninvolved reader, and she is the load-bearing one. **Alan, who reported
 *     it, would be the wrong witness**: reporting blocks in the same action (007), and a block
 *     filters audience questions from both sides (009) — so the question was already invisible
 *     to him the instant he reported it. A spec that used the reporter as its witness would
 *     pass with the removal route deleted entirely.
 *   - **The operator** performs the removal, from the report, which is the only place it is
 *     offered (FR-953).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **ALAN IS THE REPORTER SPECIFICALLY SO THAT THE BLOCK LANDS ON HIM, AND THAT IS NOT AN
 * AESTHETIC CHOICE.**
 *
 * Reporting blocks, the block is written to the database, and **the end-to-end suite seeds once
 * for the whole run** — so a block created here outlives this file. `network.spec.ts` and
 * `responsive.spec.ts` both depend on the Ada–Grace relationship (Grace holds Ada's card and
 * proposes a meeting with her), and blocking severs a card both ways and prevents scheduling
 * (008). With Grace reporting Ada, this spec would break both — and it runs *before* them, since
 * Playwright orders files alphabetically.
 *
 * Alan is at the shared conference and is used by no other spec, so a Grace–Alan block costs
 * nothing. If a later spec starts using him, this pairing has to be reconsidered rather than
 * the failure explained away.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **"Within one refresh" is asserted as a reload, not as a poll.** Nothing in this feature polls
 * and nothing pushes — 009's questions are read when the panel opens — so the guarantee is about
 * the next read, and `expect.toPass` around a reload would quietly convert a missing invalidation
 * into a slow pass.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const CONFERENCE = 'Product & Design Summit'

/**
 * Opens the session the seeded question was asked on, **by its own address**.
 *
 * Addressed rather than clicked because the panel is a nested address on Agenda (standing
 * decision 6) and because "the first session in the list" is a different thing after a reload
 * than it was before — which would make the after-removal check quietly assert about a session
 * the question was never on.
 */
const openSession = async (page: Page, sessionId: string): Promise<void> => {
  await page.goto(`/agenda/${sessionId}`)
  await expect(
    page.getByRole('dialog'),
    'the session detail panel did not open at its own address',
  ).toBeVisible()
}

test.describe('administrative moderation', () => {
  test('a removed question is gone for every attendee within one refresh (SC-903)', async ({
    browser,
  }) => {
    // Three contexts and a fixture built over the API. Deliberately the slowest kind of spec in
    // this suite, for the reason the header gives.
    test.slow()

    const seeded = await seedQuestionReport(
      { email: GRACE.email, password: SEED_PASSWORD },
      { email: ALAN.email, password: SEED_PASSWORD },
      CONFERENCE,
    )

    const graceContext = await browser.newContext()
    const adaContext = await browser.newContext()
    const operatorContext = await browser.newContext()

    try {
      const grace = await graceContext.newPage()
      const ada = await adaContext.newPage()
      const operator = await operatorContext.newPage()

      // ── Before: both attendees can see it.
      await grace.goto('/')
      await signIn(grace, GRACE)
      await useConference(grace, CONFERENCE)
      await openSession(grace, seeded.sessionId)
      await expect(
        grace.getByRole('dialog').getByText(seeded.body, { exact: true }),
        'the author cannot see her own question before it is removed — the fixture is wrong',
      ).toBeVisible()

      await ada.goto('/')
      await signIn(ada, ADA)
      await useConference(ada, CONFERENCE)
      await openSession(ada, seeded.sessionId)
      await expect(
        ada.getByRole('dialog').getByText(seeded.body, { exact: true }),
        'the uninvolved co-attendee cannot see the question before it is removed — the fixture ' +
          'is wrong, and every assertion after this would pass vacuously',
      ).toBeVisible()

      // ── The operator removes it, from the report and nowhere else (FR-953).
      await signInAsOperator(operator)
      await operator.goto(`${ADMIN_ORIGIN}/reports`)

      await operator
        .getByRole('link', { name: new RegExp(`reported ${GRACE.displayName}`, 'i') })
        .first()
        .click()

      // The reported content is disclosed to the platform tier — decision 38, the third recorded
      // Principle VIII exception — so the operator can see what they are acting on.
      //
      // **Not `exact`**, unlike the attendee-side assertions: the reported item and its removal
      // control share one list item, so no element's text equals the body on its own. The body
      // carries a per-run timestamp, so a substring match is still unambiguous.
      await expect(
        operator.getByText(seeded.body),
        'the report did not disclose the reported question (FR-940)',
      ).toBeVisible()

      await operator.getByRole('button', { name: /remove this question/i }).click()

      const confirmation = operator.getByRole('dialog')
      await expect(confirmation.getByText(/remove this question\?/i)).toBeVisible()
      await confirmation.getByRole('button', { name: /^remove$/i }).click()

      await expect(
        operator.getByRole('button', { name: /remove this question/i }),
        'the removal control is still offered after the question was removed',
      ).toBeHidden()

      // ── After: one refresh each, and it is gone for both.
      for (const [page, who] of [
        [grace, 'its author'],
        [ada, 'an uninvolved co-attendee'],
      ] as const) {
        await page.reload()
        await openSession(page, seeded.sessionId)

        const panel = page.getByRole('dialog')
        await expect(panel).toBeVisible()

        // ─────────────────────────────────────────────────────────────────────────────────────
        // **WAIT FOR THE LIST TO EXIST BEFORE ASSERTING SOMETHING IS ABSENT FROM IT.**
        //
        // `toBeHidden()` and `toHaveCount(0)` both pass instantly against zero matching elements
        // — which is precisely the panel's state while `PanelQuestions` is still rendering
        // "Loading questions…". The dialog becomes visible before its questions are fetched, so
        // without this anchor the load-bearing assertion of SC-903 could settle before the list
        // rendered and would pass even if the removal had done nothing.
        //
        // The pre-removal half of this test is safe because it waits for the body to be
        // *visible*; absence needs the anchor stated explicitly. Same defect as the one fixed in
        // `messages-journey.spec.ts` during this feature.
        // ─────────────────────────────────────────────────────────────────────────────────────
        await expect(panel.getByText(/loading questions/i)).toHaveCount(0)
        await expect(
          panel.getByRole('heading', { name: /questions/i }),
          'the Q&A section never rendered, so an absence assertion below would be vacuous',
        ).toBeVisible()

        await expect(
          panel.getByText(seeded.body, { exact: true }),
          `the removed question is still visible to ${who} after a refresh (FR-952, SC-903)`,
        ).toBeHidden()

        // ─────────────────────────────────────────────────────────────────────────────────────
        // **Nothing stands where it was.** FR-952 says the author is not told who removed it or
        // why — and the natural half-implementation is a tombstone that says exactly that. It
        // would satisfy the assertion above and violate the requirement.
        // ─────────────────────────────────────────────────────────────────────────────────────
        await expect(
          panel.getByText(/removed|moderat|deleted by|violat|withdrawn by/i),
          `${who} is shown a tombstone where the question was. Nothing survives a removal — no ` +
            'placeholder, no "removed by an operator", no reason (FR-952).',
        ).toHaveCount(0)
      }
    } finally {
      await graceContext.close()
      await adaContext.close()
      await operatorContext.close()
    }
  })
})
