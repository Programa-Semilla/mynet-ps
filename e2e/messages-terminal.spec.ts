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
 * both: the push read is now gated on granted permission (`packages/platform`), and every poll
 * tick is raced against `READ_DEADLINE_MS` in `Messages.tsx`, so a stalled read settles into
 * the ordinary failure path instead of standing forever.
 *
 * **The accepted terminal states are the two `ready` renders and nothing else** — conversations,
 * or "No conversations yet". The component's `offline` and `failed` states are terminal too, but
 * this suite always runs against the live webServer its config starts, where reaching either
 * could only mean the engine failed to talk to a demonstrably-up server — the exact defect class
 * FR-1145 exists to catch. (An earlier draft accepted them disjunctively, which would have let a
 * regressed engine pass by rendering its failure banner; the deep review narrowed it.)
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
     * The states this suite accepts are NARROWER than the list pane's full set, deliberately
     * (deep-review tightening). Against the live webServer this config always starts, the only
     * legitimate outcomes are the two `ready` renders — conversations, or "No conversations
     * yet". `offline` and `failed` are terminal states of the COMPONENT, but here they could
     * only mean the engine failed to reach a server that is demonstrably up, which is exactly
     * the defect class FR-1145 exists to catch; accepting them would let a regressed engine
     * pass by rendering its failure banner instead of its content.
     */
    const terminal = page
      .getByRole('link', { name: /./ })
      .and(page.locator('[href^="/messages/"]'))
      .or(page.getByText('No conversations yet'))

    /*
     * The bound is derived, not chosen: the transport aborts a stalled request at 20 seconds and
     * `READ_DEADLINE_MS` bounds the tick at 25, so 40 covers the slowest honest path to a
     * terminal state with margin for a loaded CI host. Before the fix, WebKit failed here by
     * timeout — the page's main thread was wedged and nothing would ever have appeared.
     */
    await expect(terminal.first()).toBeVisible({ timeout: 40_000 })

    // And said terminal state has actually replaced the spinner, rather than joining it: the
    // loading treatment and an outcome are mutually exclusive renders in `Messages.tsx`.
    await expect(page.getByText('Loading your conversations…')).toHaveCount(0)
  })
})
