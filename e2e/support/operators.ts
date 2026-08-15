import { expect, type Page } from '@playwright/test'

import { API_ORIGIN, ADMIN_ORIGIN } from './env.js'

/**
 * 011 — the seeded operators, and the administrative sign-in every admin spec starts from.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **A SEEDED OPERATOR HAS NO CREDENTIAL, SO THE HARNESS HAS TO BOOTSTRAP ONE** (FR-990, FR-991).
 *
 * This is the whole shape of the feature showing up in the test harness: `db/seed/operators.ts`
 * creates identities with a **null** `password_hash`, because this repository is public and a
 * committed administrative password would be a published credential for the tier that reads the
 * abuse-report queue.
 *
 * So there is no "sign in as the seeded operator" the way there is for the seeded attendees. The
 * harness sets a credential by hand, exactly as `pnpm admin:bootstrap` does, and then replaces it
 * — because FR-992 refuses every other administrative address until the initial one is replaced.
 *
 * That two-step is not harness friction to be engineered away. It is the product's opening
 * interaction, and a helper that skipped it would leave the forced replacement untested end to
 * end.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

export const SEED_OPERATOR_EMAIL = 'operator@mynet.invalid'

/** What the harness bootstraps, and what it replaces that with. */
const INITIAL_PASSWORD = 'e2e-bootstrapped-operator-pass'
export const OPERATOR_PASSWORD = 'e2e-operator-chosen-password'

/**
 * Signs in to the administrative site, replacing the initial credential on the way through.
 *
 * Idempotent across specs in one run: if a previous spec already replaced the credential, the
 * first sign-in with `OPERATOR_PASSWORD` succeeds and the replacement step is skipped.
 */
export const signInAsOperator = async (page: Page): Promise<void> => {
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **THIS HELPER TOUCHES THE DATABASE NOT AT ALL, AND THAT IS THE FIX FOR A TEST IT WAS
  // BREAKING.**
  //
  // It used to run `pnpm db:seed` before bootstrapping, so that FR-993 — which forbids resetting
  // a credential an operator has chosen — could not leave a re-run with no usable password. The
  // reasoning was right and the placement was catastrophic: **`db:seed` deletes every attendee
  // and re-inserts them**, so calling it from inside a test destroyed any MyNet session that
  // test had already established.
  //
  // The test it broke is the one that exists to prove the two sessions are independent: it signs
  // Ada into MyNet, then signs in here, then checks Ada is still signed in. The helper deleted
  // her account in between, and the failure read as *"signing out of administration signed the
  // attendee out of MyNet"* — a decision-37 violation that was never happening.
  //
  // Seeding and bootstrapping now happen **once, in global setup**, before any test runs. See
  // `bootstrapOperatorCredential` below.
  // ═══════════════════════════════════════════════════════════════════════════════════════════

  // Either password may be the live one, depending on whether an earlier spec in this run has
  // been through the replacement. Both are tried, and **the outcome is read rather than assumed**.
  const accepted =
    (await attemptSignIn(page, INITIAL_PASSWORD)) || (await attemptSignIn(page, OPERATOR_PASSWORD))

  expect(
    accepted,
    'neither the bootstrapped nor the chosen administrative password was accepted. If this ' +
      'database has a credential from some other source, re-seed it: FR-993 means the bootstrap ' +
      'can never reset one an operator has replaced.',
  ).toBe(true)

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **WHICH SCREEN FOLLOWS IS A FACT ABOUT `credential_is_initial`, NOT ABOUT WHICH PASSWORD
  // WORKED — so it is observed rather than inferred.**
  //
  // An earlier version branched on the password: "signed in with the bootstrapped one, therefore
  // the replacement screen". That is wrong whenever a previous run has been through the flow, and
  // it produced a failure that read as a product defect ("did not force a replacement") when the
  // product was doing exactly the right thing.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const replacement = page.getByRole('heading', { name: /choose your password/i })
  const shell = page.getByText(/signed in as/i)

  await expect(async () => {
    expect((await replacement.isVisible()) || (await shell.isVisible())).toBe(true)
  }).toPass()

  if (await replacement.isVisible()) {
    await replaceCredential(page)
    return
  }

  await expect(shell).toBeVisible()
}

/**
 * Submits the sign-in form and reports whether it was accepted.
 *
 * Waits for one of the two settled outcomes rather than for a fixed time: either the form is
 * gone (accepted) or an alert is present (refused). A `waitForTimeout` here would be a flake
 * generator, and asserting only on the happy path would make a refusal look like a slow render.
 */
const attemptSignIn = async (page: Page, password: string): Promise<boolean> => {
  await page.goto(`${ADMIN_ORIGIN}/`)

  const email = page.getByLabel(/email/i)
  await expect(email, 'the administrative sign-in screen did not render').toBeVisible()

  await email.fill(SEED_OPERATOR_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(password)

  // ═══════════════════════════════════════════════════════════════════════════════════════════
  // **THE OUTCOME IS READ FROM THE RESPONSE, NOT INFERRED FROM THE DOM — AND THE WAIT IS ARMED
  // BEFORE THE CLICK.**
  //
  // Two earlier versions each inferred it from the submit control, and each was wrong in the
  // same direction — reporting "accepted" for a refusal, so the caller then waited three minutes
  // for a screen that was never coming and the failure named the wrong thing entirely:
  //
  //   1. Watching for `^sign in$` to stop matching. It stops the instant the label becomes
  //      "Signing in…", which is *before* the server has answered.
  //   2. Watching for "Signing in…" to reach count 0. If the assertion runs before React has
  //      rendered the in-flight label, the count is **already** 0 and it passes immediately —
  //      the same bug one frame earlier, and the one that made this intermittent.
  //
  // A response is not a render, so it cannot race one. `waitForResponse` is created before the
  // click because the request can complete faster than the next `await` resumes.
  // ═══════════════════════════════════════════════════════════════════════════════════════════
  const answered = page.waitForResponse(
    (response) =>
      response.url().includes('/admin/session') && response.request().method() === 'POST',
    { timeout: 20_000 },
  )

  await page.getByRole('button', { name: /sign in/i }).click()
  const response = await answered

  // 204 is the only acceptance. Every refusal — including all four indistinguishable sign-in
  // causes (FR-915) — is a non-2xx, and the helper's caller decides what to do about it.
  return response.status() === 204
}

/** The forced replacement, which is the only route an initial credential may reach (FR-992). */
const replaceCredential = async (page: Page): Promise<void> => {
  // The current password is whichever one got us here — the bootstrap sets INITIAL, and the
  // replacement screen is only ever reached while `credential_is_initial` is true.
  await page.getByLabel(/current password/i).fill(INITIAL_PASSWORD)
  await page.getByLabel(/^new password/i).fill(OPERATOR_PASSWORD)
  await page.getByLabel(/confirm new password/i).fill(OPERATOR_PASSWORD)
  await page.getByRole('button', { name: /save and continue/i }).click()

  await expect(
    page.getByText(/signed in as/i),
    'replacing the credential did not reach the administrative shell',
  ).toBeVisible()
}

/**
 * Sets the initial credential, the way `pnpm admin:bootstrap` does. **Called once, from global
 * setup, immediately after `db:seed` and before any test runs.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * **IT MUST FOLLOW A SEED, AND FR-993 IS EXACTLY WHY.**
 *
 * `pnpm admin:bootstrap` sets a credential on an operator who has none and **refuses one that has
 * been replaced**. After a run has been through the forced replacement, the live password is
 * whatever that run chose; a later run knows neither it nor a way to reset it. So the bootstrap
 * only works against operators a seed has just returned to their null-`password_hash` state
 * (FR-990).
 *
 * That is not a flaw to engineer around in the product. It is the guarantee working: a bootstrap
 * that *could* reset a replaced credential would be a credential reset triggered by an environment
 * variable that sits on the host forever.
 *
 * **There is deliberately no route for this** (FR-902): neither administrative tier is reachable
 * by self sign-up, and a route that set a credential would be one. So the harness runs the same
 * command the operator would.
 *
 * **Global setup is the only correct place for it.** Called from a test, the `db:seed` it depends
 * on deletes every attendee mid-run — which is precisely the defect described in
 * `signInAsOperator` above.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
export const bootstrapOperatorCredential = async (): Promise<void> => {
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const run = promisify(execFile)

  await run('pnpm', ['admin:bootstrap'], {
    env: {
      ...process.env,
      ADMIN_BOOTSTRAP_EMAIL: SEED_OPERATOR_EMAIL,
      ADMIN_BOOTSTRAP_PASSWORD: INITIAL_PASSWORD,
    },
  })
}

/**
 * A question, asked and then reported, so an administrative spec has something to act on.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **BUILT THROUGH THE API, WITH AN ISOLATED CONTEXT PER ACTOR.**
 *
 * The *asking* and *reporting* journeys belong to 009 and 007 and are driven through the
 * interface there. What 011's specs are about is what an operator can then do with the result,
 * so the fixture is set up the shortest honest way.
 *
 * **A context each, rather than one shared one.** `APIRequestContext` carries a cookie jar, so
 * signing the reporter in on the asker's context would replace the asker's session — and, if a
 * page's context were reused, sign that page out mid-test. That is the same class of mistake as
 * the `db:seed` call this module used to make from inside a test.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export interface SeededQuestionReport {
  readonly eventId: string
  readonly sessionId: string
  readonly questionId: string
  /** The question's text, unique per run so a spec can find exactly this one. */
  readonly body: string
  /** Who asked it, and therefore who was reported. */
  readonly authorId: string
}

export const seedQuestionReport = async (
  asker: { readonly email: string; readonly password: string },
  reporter: { readonly email: string; readonly password: string },
  eventName: string,
): Promise<SeededQuestionReport> => {
  const { request } = await import('@playwright/test')

  const askerApi = await request.newContext({ baseURL: API_ORIGIN })
  const reporterApi = await request.newContext({ baseURL: API_ORIGIN })

  try {
    const signedIn = await askerApi.post('/auth/sign-in', { data: asker })
    expect(signedIn.ok(), 'the asking attendee could not sign in').toBe(true)

    const me = (await (await askerApi.get('/auth/me')).json()) as { id: string }

    const events = (await (await askerApi.get('/events')).json()) as { id: string; name: string }[]
    const event = events.find((candidate) => candidate.name === eventName)
    expect(event, `the asking attendee is not registered for "${eventName}"`).toBeDefined()

    const sessions = (await (await askerApi.get(`/events/${event!.id}/sessions`)).json()) as {
      id: string
    }[]
    expect(sessions.length, `"${eventName}" has no programme to ask about`).toBeGreaterThan(0)
    const sessionId = sessions[0]!.id

    // Unique per run, so the spec can name this question rather than "the first one" — which is
    // ordered by votes and would move under it.
    const body = `Reported by the end-to-end harness ${Date.now()}`
    const asked = await askerApi.post(`/events/${event!.id}/sessions/${sessionId}/questions`, {
      data: { body },
    })
    expect(asked.ok(), 'asking the question failed').toBe(true)

    // Every write returns the full re-ordered list (009), so this is the response rather than a
    // second read.
    const { questions } = (await asked.json()) as { questions: { id: string; body: string }[] }
    const question = questions.find((candidate) => candidate.body === body)
    expect(
      question,
      'the question that was just asked is not in the list it returned',
    ).toBeDefined()

    const reporterSignedIn = await reporterApi.post('/auth/sign-in', { data: reporter })
    expect(reporterSignedIn.ok(), 'the reporting attendee could not sign in').toBe(true)

    const filed = await reporterApi.post('/reports', {
      data: {
        attendeeId: me.id,
        reason: 'Reported from the end-to-end harness.',
        messageIds: [],
        questionIds: [question!.id],
      },
    })
    expect(filed.ok(), 'filing the report failed').toBe(true)

    return { eventId: event!.id, sessionId, questionId: question!.id, body, authorId: me.id }
  } finally {
    await askerApi.dispose()
    await reporterApi.dispose()
  }
}

/**
 * Files a report as an attendee, through the API, so an admin spec has something in the queue.
 *
 * Driven through the API rather than the interface because the *reporting* journey is 007's and
 * 009's to test; what these specs are about is what an operator can then do with it.
 */
export const fileQuestionReport = async (
  page: Page,
  input: {
    attendeeEmail: string
    password: string
    reportedAttendeeId: string
    questionId: string
  },
): Promise<void> => {
  const signIn = await page.request.post(`${API_ORIGIN}/auth/sign-in`, {
    data: { email: input.attendeeEmail, password: input.password },
  })
  expect(signIn.ok(), 'the reporting attendee could not sign in').toBe(true)

  const filed = await page.request.post(`${API_ORIGIN}/reports`, {
    data: {
      attendeeId: input.reportedAttendeeId,
      reason: 'Reported from the end-to-end harness.',
      messageIds: [],
      questionIds: [input.questionId],
    },
  })
  expect(filed.ok(), 'filing the report failed').toBe(true)
}
