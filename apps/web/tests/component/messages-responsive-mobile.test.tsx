import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { A_COUNTERPART, aConversation, aMessage, renderMessages } from '../support/messages.js'

/**
 * T052 (007) — the mobile layout, at **320px** (FR-580, FR-586, SC-516).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHAT A COMPONENT TEST CAN AND CANNOT SAY ABOUT LAYOUT — READ BEFORE ADDING HERE.**
 *
 * jsdom applies no stylesheet and computes no layout. It cannot measure a width, cannot tell
 * whether a document scrolls horizontally, and cannot resolve a Tailwind class into a pixel. A
 * test here claiming to check "no horizontal scrolling at 320px" would be checking nothing at
 * all — the exact shape of green result 005 warned about and this file inherits.
 *
 * So the split is the one `agenda-responsive-mobile.test.tsx` established:
 *
 *   - **Measured properties** — document width, overflow, real boxes — belong to
 *     `e2e/responsive.spec.ts`, which walks 320px and every breakpoint in a real browser.
 *   - **Structural properties** are asserted here, because they are what the mobile layout is
 *     *made of* and they are decidable without a renderer.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THE ONE THING THIS FEATURE MUST NOT REPRODUCE IS THE PROTOTYPE'S CONVERSATION SWITCHER.**
 *
 * The prototype puts a horizontally-scrolling strip of avatars above the thread. FR-580 forbids
 * it outright, and the reason is not aesthetic: choosing which conversation to read is the
 * primary action of this destination, Principle IV's floor is that no primary action may require
 * horizontal scrolling, and a strip hides everything past the fourth conversation behind a
 * gesture with no keyboard equivalent and no announced affordance.
 *
 * That correction is a settled requirement rather than a judgement (Principle II), so it gets a
 * test that names it.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const THREAD = '/messages/33333333-3333-4333-8333-333333333333'

describe('Messages at the narrowest supported width', () => {
  it('lays the conversation list out VERTICALLY, never as a scrolling strip (FR-580)', async () => {
    renderMessages({ conversations: [aConversation()] })

    const row = await screen.findByRole('link', { name: /sofía muñoz/i })
    const list = row.closest('ul')

    expect(list?.className).toMatch(/flex-col/)
    // The three ways a strip is usually built. Each one is the defect FR-580 names.
    expect(list?.className).not.toMatch(/overflow-x|flex-row|whitespace-nowrap/)
  })

  it('gives every conversation row a 44px touch target', async () => {
    renderMessages({ conversations: [aConversation()] })

    const row = await screen.findByRole('link', { name: /sofía muñoz/i })
    // `min-h-11` is 44px at this project's 4px base, declared on the row's own box.
    expect(row.className).toMatch(/min-h-11/)
  })

  it('gives the composer and its send control 44px targets', async () => {
    renderMessages({ at: THREAD })

    expect((await screen.findByRole('textbox', { name: /message/i })).className).toMatch(/min-h-11/)
    expect(screen.getByRole('button', { name: /send message/i }).className).toMatch(/size-11/)
  })

  it('renders the LIST or the THREAD, never both, when a conversation is open', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Two full-width views with a back affordance, not two panes squeezed into 320px. The list
    // column is declared `hidden` until `tablet`, which is the structural half of that; the
    // measured half is the e2e suite's.
    // ───────────────────────────────────────────────────────────────────────────────────────
    renderMessages({ at: THREAD, conversations: [aConversation()] })

    const row = await screen.findByRole('link', { name: /sofía muñoz/i })
    const pane = row.closest('div')?.parentElement

    expect(pane?.className, 'the list pane is hidden below tablet while a thread is open').toMatch(
      /\bhidden\b/,
    )
    expect(pane?.className, '…and reappears from tablet up, beside the thread').toMatch(
      /tablet:block/,
    )
  })

  it('offers an explicit back affordance out of the thread', async () => {
    renderMessages({ at: THREAD })

    const back = await screen.findByRole('link', { name: /back to conversations/i })
    expect(back).toHaveAttribute('href', '/messages')
    expect(back.className, 'and it is a real touch target').toMatch(/size-11/)
  })

  it('lets a long message wrap rather than widening its column (FR-586)', async () => {
    // An unbroken URL is the one piece of attendee content that can push a column past the
    // viewport, and it is what a conference message most often contains.
    renderMessages({
      at: THREAD,
      pages: [
        {
          messages: [
            aMessage({ body: 'https://example.com/a-very-long-link-with-no-spaces-in-it' }),
          ],
          nextCursor: null,
          state: 'open',
          counterpart: A_COUNTERPART,
        },
      ],
    })

    const bubble = (await screen.findByText(/a-very-long-link/)).closest('div')
    expect(bubble?.className).toMatch(/break-words/)
    expect(bubble?.className, 'and it is bounded rather than free to grow').toMatch(/max-w-/)
  })

  it('bounds the list column with `min-w-0` so a long preview truncates', async () => {
    renderMessages({
      conversations: [
        aConversation({
          lastMessage: {
            body: 'A preview long enough to push a grid column past a 320px viewport if it were allowed to.',
            sentAt: '2026-09-14T09:00:00.000Z',
            mine: false,
          },
        }),
      ],
    })

    const row = await screen.findByRole('link', { name: /sofía muñoz/i })
    const preview = within(row).getByText(/A preview long enough/)

    expect(preview.className, 'truncated rather than wrapped, so the row keeps its height').toMatch(
      /truncate/,
    )
    // `min-w-0` on the flex child is what actually lets `truncate` work — without it the child's
    // min-content width wins and the row grows instead. Asserted on the *containing* column
    // rather than on the preview itself, which is where the constraint has to sit.
    expect(preview.parentElement?.className).toMatch(/min-w-0/)
  })
})
