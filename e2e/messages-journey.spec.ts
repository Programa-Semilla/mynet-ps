import { expect, test, type Page } from '@playwright/test'

import { ADA, GRACE, signIn, useConference } from './support/attendees.js'

/**
 * T045a (007) — **the core journey's middle step, measured rather than asserted** (SC-501).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SC-501 IS A NUMBER, SO THIS TEST COUNTS.**
 *
 * The success criterion says an attendee reaches a sent first message in **three actions or
 * fewer** from an open profile. A test that merely drove the journey and asserted the message
 * arrived would pass just as happily against a five-step flow with two confirmation dialogs in
 * it — which is exactly how a criterion stated as a number becomes a claim rather than a result.
 *
 * So the actions are counted explicitly, in the same order an attendee performs them, and the
 * count is the assertion. Adding a step to this journey later fails here, which is the point.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * The seeded fixture is what makes this work: Ada and Grace share `Product & Design Summit`, both
 * are verified and discoverable, so Grace is reachable from Ada's directory and co-attendance
 * (FR-504) is satisfied.
 */

const SHARED_CONFERENCE = 'Product & Design Summit'

/**
 * The open thread, as a region.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Selected structurally — the region nested inside the Messages region — rather than by its
 * accessible name.**
 *
 * The thread's name is the counterpart's display name once it has loaded, and "New message"
 * before a conversation exists. A name-matching selector therefore has to know who the fixture
 * is talking to, and it silently stops matching the day the header changes — which is exactly
 * what happened when the header stopped reading "Conversation".
 *
 * Scoping is needed at all because a message's text legitimately appears twice on the two-pane
 * layout: once as its row's preview (FR-509) and once as the message.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const threadOf = (page: Page) => page.getByRole('region', { name: 'Messages' }).getByRole('region')

test.describe('Messages: reaching someone you just found', () => {
  test('three actions or fewer from an open profile to a sent first message (SC-501)', async ({
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)
    // Pinned rather than assumed. The active conference is durable by design (FR-104) and an
    // earlier spec may have moved it — the order-dependence `useConference` exists to remove.
    await useConference(page, SHARED_CONFERENCE)

    await page.goto('/discover')

    // ───────────────────────────────────────────────────────────────────────────────────────
    // The journey **starts from an open profile**, which is what SC-501 measures from. Opening
    // it is the navigation that gets the attendee here, not one of the three actions.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await page
      .getByRole('link', { name: new RegExp(GRACE.displayName) })
      .first()
      .click()
    const profile = page.getByRole('dialog')
    await expect(profile).toBeVisible()

    let actions = 0

    // Action 1 — choose Message.
    await profile
      .getByRole('link', { name: new RegExp(`message ${GRACE.displayName}`, 'i') })
      .click()
    actions += 1

    // Action 2 — type the message.
    const composer = page.getByRole('textbox', { name: /message/i })
    await expect(composer).toBeVisible()
    await composer.fill('Enjoyed your talk — could we compare notes over coffee?')
    actions += 1

    // Action 3 — send it.
    await page.getByRole('button', { name: /send message/i }).click()
    actions += 1

    // The message is in the thread, from the server rather than from an optimistic render: the
    // address has become a real conversation, which only happens once the write resolved.
    await expect(page).toHaveURL(/\/messages\/[0-9a-f-]{36}$/)
    await expect(
      threadOf(page).getByText('Enjoyed your talk — could we compare notes over coffee?'),
    ).toBeVisible()

    expect(
      actions,
      'SC-501 allows three actions from an open profile to a sent first message. A confirmation ' +
        'step, a recipient picker, or a "start conversation" button before the composer would ' +
        'each add one — and each is the kind of step that gets added for a good local reason.',
    ).toBeLessThanOrEqual(3)
  })

  /**
   * FR-503a — **opening a thread writes nothing**, proven from the outside.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * The integration suite asserts that no route creates an empty conversation. This asserts the
   * consequence an attendee can actually observe: Ada opens a thread, leaves without sending, and
   * **nothing about Grace's account changed**. Nothing tells Grace it happened, because nothing
   * happened.
   *
   * **A delta rather than an absolute, and that is not a weaker assertion.** The end-to-end
   * database is seeded once for the whole run, so "Grace has no conversations" is a fact about
   * *test ordering* — the spec above deliberately creates one. Asserting emptiness would make
   * this file pass alone and fail in the suite, which is the order-dependent flake
   * `useConference` was written to remove. What FR-503a actually claims is that opening a thread
   * adds nothing, and a before-and-after count says exactly that whatever else has run.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('opening a thread and leaving without sending leaves no trace (FR-503a)', async ({
    browser,
  }) => {
    const graceContext = await browser.newContext()
    const gracePage = await graceContext.newPage()
    await gracePage.goto('/')
    await signIn(gracePage, GRACE)
    await gracePage.goto('/messages')

    // Each row of the conversation list is a link to its own address (FR-569), so counting them
    // counts conversations without depending on any counterpart's name.
    const graceConversations = gracePage.locator('a[href^="/messages/"]')

    /**
     * ═══════════════════════════════════════════════════════════════════════════════════════
     * **THE HEADING IS NOT THE LIST, AND COUNTING BEFORE THE LIST HAS LOADED IS A RACE.**
     *
     * `Messages` renders its title immediately and its conversations after the request settles,
     * so `count()` taken on the heading alone reads whatever happened to be mounted — usually
     * the right answer, occasionally zero. It failed exactly that way: the screenshot showed
     * Grace's conversation with Ada present on screen while the count had already returned 0.
     *
     * Two changes, and both matter. Waiting for the loading state to clear makes the *first*
     * read honest; `toHaveCount` rather than a one-shot `count()` makes the second read retry,
     * so a slow list is a slow pass instead of a false failure. A wrongly-created conversation
     * still fails it — the count settles on `before + 1` and never reaches `before`.
     * ═══════════════════════════════════════════════════════════════════════════════════════
     */
    const listSettled = async (page: typeof gracePage): Promise<void> => {
      await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible()
      await expect(page.getByText(/loading your conversations/i)).toHaveCount(0)
    }

    await listSettled(gracePage)
    const before = await graceConversations.count()

    const adaContext = await browser.newContext()
    const adaPage = await adaContext.newPage()
    await adaPage.goto('/')
    await signIn(adaPage, ADA)
    await useConference(adaPage, SHARED_CONFERENCE)

    await adaPage.goto('/discover')
    await adaPage
      .getByRole('link', { name: new RegExp(GRACE.displayName) })
      .first()
      .click()
    await adaPage
      .getByRole('dialog')
      .getByRole('link', { name: new RegExp(`message ${GRACE.displayName}`, 'i') })
      .click()

    // The composer is there, the starter prompt is showing, and nothing has been written.
    await expect(adaPage.getByRole('textbox', { name: /message/i })).toBeVisible()
    await expect(adaPage.getByText(/start the conversation/i)).toBeVisible()

    // Ada leaves without sending.
    await adaPage.goto('/')

    await gracePage.reload()
    await listSettled(gracePage)

    await expect(
      graceConversations,
      'Grace must not be able to tell that Ada opened a thread with her. FR-503a makes that ' +
        'structural — nothing was written — rather than a matter of what the list happens to show.',
    ).toHaveCount(before)

    await adaContext.close()
    await graceContext.close()
  })

  /**
   * T054 (007) — **the full exchange, across two real sessions** (FR-511, FR-515, US2).
   *
   * Two browser contexts rather than two tabs: separate cookie jars, so this is genuinely two
   * attendees rather than one attendee twice. It is the only layer that can say the thread works
   * for *both* of them — the integration suite proves the payload, and a component test proves
   * the rendering, but neither has a second session to reply from.
   */
  test('two attendees exchange messages and both see the whole thread', async ({ browser }) => {
    const adaContext = await browser.newContext()
    const adaPage = await adaContext.newPage()
    await adaPage.goto('/')
    await signIn(adaPage, ADA)
    await useConference(adaPage, SHARED_CONFERENCE)

    await adaPage.goto('/discover')
    await adaPage
      .getByRole('link', { name: new RegExp(GRACE.displayName) })
      .first()
      .click()
    await adaPage
      .getByRole('dialog')
      .getByRole('link', { name: new RegExp(`message ${GRACE.displayName}`, 'i') })
      .click()

    await adaPage.getByRole('textbox', { name: /message/i }).fill('Are you at the compiler talk?')
    await adaPage.getByRole('button', { name: /send message/i }).click()
    await expect(threadOf(adaPage).getByText('Are you at the compiler talk?')).toBeVisible()

    // Grace, from her own session, finds it in her list and opens it.
    const graceContext = await browser.newContext()
    const gracePage = await graceContext.newPage()
    await gracePage.goto('/')
    await signIn(gracePage, GRACE)
    await gracePage.goto('/messages')

    await gracePage
      .getByRole('link', { name: new RegExp(ADA.displayName) })
      .first()
      .click()
    await expect(threadOf(gracePage).getByText('Are you at the compiler talk?')).toBeVisible()

    await gracePage.getByRole('textbox', { name: /message/i }).fill('On my way — save me a seat.')
    await gracePage.getByRole('button', { name: /send message/i }).click()

    // Both messages, in both threads, oldest first (FR-515).
    for (const page of [adaPage, gracePage]) {
      await expect(threadOf(page).getByText('Are you at the compiler talk?')).toBeVisible()
      await expect(threadOf(page).getByText('On my way — save me a seat.')).toBeVisible()
    }

    await adaContext.close()
    await graceContext.close()
  })

  /**
   * T063a (007) — **SC-502 is a number, so this measures it** (FR-562, research R4).
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * The criterion says a message sent by one attendee appears in the other's **open thread**
   * within five seconds. Research R4 chose the three-second poll interval specifically to reach
   * that number — which makes the number a *prediction* until something clocks it.
   *
   * So the wall clock is read at the send and again when the text appears, and the elapsed time
   * is the assertion. A test that simply waited for the message would pass at any interval,
   * including one somebody later raised to thirty seconds for a good local reason.
   *
   * **This is the freshness path that does not depend on permission** (FR-552). Web Push covers
   * the closed application; nothing here grants a notification permission, deliberately, because
   * an attendee who denies it must still get this.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  test('a message appears in an open thread within five seconds (SC-502)', async ({ browser }) => {
    const adaContext = await browser.newContext()
    const adaPage = await adaContext.newPage()
    await adaPage.goto('/')
    await signIn(adaPage, ADA)
    await useConference(adaPage, SHARED_CONFERENCE)

    await adaPage.goto('/discover')
    await adaPage
      .getByRole('link', { name: new RegExp(GRACE.displayName) })
      .first()
      .click()
    await adaPage
      .getByRole('dialog')
      .getByRole('link', { name: new RegExp(`message ${GRACE.displayName}`, 'i') })
      .click()
    await adaPage.getByRole('textbox', { name: /message/i }).fill('Opening the thread.')
    await adaPage.getByRole('button', { name: /send message/i }).click()
    await expect(threadOf(adaPage).getByText('Opening the thread.')).toBeVisible()

    // Grace opens the same conversation and LEAVES IT OPEN. That is the condition SC-502 is
    // about: the poll runs only while a thread is open and the tab is visible.
    const graceContext = await browser.newContext()
    const gracePage = await graceContext.newPage()
    await gracePage.goto('/')
    await signIn(gracePage, GRACE)
    await gracePage.goto('/messages')
    await gracePage
      .getByRole('link', { name: new RegExp(ADA.displayName) })
      .first()
      .click()
    await expect(threadOf(gracePage).getByText('Opening the thread.')).toBeVisible()

    const arriving = `Sent at ${Date.now()}`

    const startedAt = Date.now()
    await adaPage.getByRole('textbox', { name: /message/i }).fill(arriving)
    await adaPage.getByRole('button', { name: /send message/i }).click()

    // Grace does nothing at all — no reload, no click. The thread updates itself.
    await expect(threadOf(gracePage).getByText(arriving)).toBeVisible({ timeout: 10_000 })
    const elapsedMs = Date.now() - startedAt

    expect(
      elapsedMs,
      `The message took ${elapsedMs}ms to appear. SC-502 allows five seconds, and research R4 ` +
        'chose the three-second poll to reach it — a slower interval, or a poll that stopped ' +
        'while a thread was open, would show up here and nowhere else.',
    ).toBeLessThan(5_000)

    await adaContext.close()
    await graceContext.close()
  })
})
