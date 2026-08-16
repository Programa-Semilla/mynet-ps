import { expect, test } from '@playwright/test'

import { ADA, signIn } from './support/attendees.js'

/**
 * T018 (012) — **Messages always reaches a terminal state** (FR-1145).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE DEFECT THIS GUARDS AGAINST WAS AN INDEFINITE `Loading…`, AND ONLY WEBKIT PRODUCED IT.**
 *
 * Research R5 measured Safari users unable to open Messages at all: the destination sat at
 * `Loading…` forever with the shell rendered around it. The root cause was not the request —
 * `NotificationPrompt`'s reconcile called `pushManager.getSubscription()` on a WebKit build with
 * no push service behind it, which wedged the page's main thread, and the in-flight
 * `GET /conversations` response became undeliverable. Two things fixed it and this spec holds
 * both: the push read is now gated on granted permission (`packages/platform`), and a stalled
 * first load now falls to a failure state with a retry control instead of standing forever
 * (`FIRST_LOAD_DEADLINE_MS` in `Messages.tsx`).
 *
 * So the assertion is deliberately disjunctive: **content OR a declared failure state — never an
 * indefinite spinner.** A spec that demanded content would re-fail on any environment where the
 * list legitimately cannot load, and would miss the point: FR-1145's obligation is that the
 * attendee is never left with nothing to act on.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Repeat-safe by construction.** This spec signs in, reads, and writes nothing — no
 * conversation, no fixture mutation — so it holds on every pass against a database seeded once,
 * whatever the specs around it have created. It runs under every declared browser project, and
 * WebKit is the one it exists for.
 */

test.describe('Messages: the list reaches a terminal state (FR-1145)', () => {
  test('opening Messages ends in content or a declared failure, never indefinite loading', async ({
    page,
  }) => {
    await page.goto('/')
    await signIn(page, ADA)

    await page.goto('/messages')

    // The destination itself must render — this is the shell-level sanity the WebKit failures
    // still passed, which is why it is not the assertion that matters below.
    await expect(page.getByRole('heading', { name: 'Messages' })).toBeVisible()

    /*
     * Every state the list pane can end in, from `MessagesEmptyStates.tsx` and the list itself:
     *
     *   - ready with conversations — the list of links into threads
     *   - ready with none         — "No conversations yet"
     *   - offline                 — "You are offline…" with a retry control
     *   - failed                  — "…could not be loaded…" with a retry control
     *
     * Any one of them satisfies FR-1145. What none of them is, is `Loading…`.
     */
    const terminal = page
      .getByRole('link', { name: /./ })
      .and(page.locator('[href^="/messages/"]'))
      .or(page.getByText('No conversations yet'))
      .or(page.getByText(/You are offline/))
      .or(page.getByText(/could not be loaded/))

    /*
     * The bound is derived, not chosen: the transport aborts a stalled request at 20 seconds and
     * `FIRST_LOAD_DEADLINE_MS` declares failure at 25, so 40 covers the slowest honest path to a
     * terminal state with margin for a loaded CI host. Before the fix, WebKit failed here by
     * timeout — the page's main thread was wedged and nothing would ever have appeared.
     */
    await expect(terminal.first()).toBeVisible({ timeout: 40_000 })

    // And said terminal state has actually replaced the spinner, rather than joining it: the
    // loading treatment and an outcome are mutually exclusive renders in `Messages.tsx`.
    await expect(page.getByText('Loading your conversations…')).toHaveCount(0)
  })
})
