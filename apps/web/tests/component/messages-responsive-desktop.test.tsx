import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aConversation, renderMessages } from '../support/messages.js'

/**
 * T053 (007) — the tablet and desktop layout: a **two-pane workspace** (FR-580, FR-586).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SAME LIMIT APPLIES HERE AS AT MOBILE, AND IT IS WORTH RESTATING.**
 *
 * jsdom computes no layout, so nothing here measures a column. What it can assert is the
 * *structure* the two-pane workspace is made of: that both panes exist in the tree at once, that
 * the grid declares two tracks from `tablet` up and one below, and that neither track is free to
 * grow past its container.
 *
 * `e2e/responsive.spec.ts` measures the rest at real widths.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Desktop and tablet layouts remain UNVALIDATED DESIGN, and this file does not change that.**
 *
 * The approved prototype is a fixed 390×844 phone frame — register entry 4. A two-pane
 * conversation workspace is therefore further unreviewed desktop design, which 007's spec records
 * rather than resolves. These assertions protect the structure that was built; they are not
 * evidence that the design is right.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

const THREAD = '/messages/33333333-3333-4333-8333-333333333333'

describe('Messages as a two-pane workspace', () => {
  it('declares one column below tablet and two from tablet up', async () => {
    renderMessages({ conversations: [aConversation()] })

    const row = await screen.findByRole('link', { name: /sofía muñoz/i })
    const grid = row.closest('ul')?.closest('div')?.parentElement?.parentElement

    expect(grid?.className).toMatch(/\bgrid\b/)
    expect(
      grid?.className,
      'Two tracks from tablet up: a bounded list column and a thread filling the remainder.',
    ).toMatch(/tablet:grid-cols-\[minmax\(0,18rem\)_minmax\(0,1fr\)\]/)
  })

  it('BOTH tracks are `minmax(0, …)`, which is what stops the grid overflowing (FR-586)', async () => {
    // ───────────────────────────────────────────────────────────────────────────────────────
    // The single most common cause of horizontal scrolling in a CSS grid, and one that only
    // appears with real content in it: a track's default minimum is `auto`, meaning its
    // min-content width — so one unbroken URL in a message, or a long company name in a preview,
    // widens the whole grid past the viewport rather than being truncated or wrapped.
    //
    // `minmax(0, …)` on both tracks is the fix, and it is invisible unless somebody knows to
    // look for it. Hence a test that names it.
    // ───────────────────────────────────────────────────────────────────────────────────────
    renderMessages({ conversations: [aConversation()] })

    const row = await screen.findByRole('link', { name: /sofía muñoz/i })
    const grid = row.closest('ul')?.closest('div')?.parentElement?.parentElement

    const tracks = /grid-cols-\[minmax\(0,18rem\)_minmax\(0,1fr\)\]/
    expect(grid?.className).toMatch(tracks)
  })

  it('keeps the list mounted BESIDE the thread, so opening one is a navigation not a remount', async () => {
    renderMessages({ at: THREAD, conversations: [aConversation()] })

    // Both present in the tree at once. On mobile the list pane carries `hidden`; from tablet up
    // it does not, and that is the whole difference between the two layouts.
    expect(await screen.findByRole('link', { name: /sofía muñoz/i })).toBeInTheDocument()
    // Awaited rather than read synchronously: the list resolves as soon as its read lands, while
    // the nested thread route is still inside the harness's Suspense boundary for one tick.
    expect(await screen.findByRole('textbox', { name: /message/i })).toBeInTheDocument()
  })

  it('invites the reader to choose a conversation when no thread is open', async () => {
    renderMessages({ conversations: [aConversation()] })

    // The empty right-hand pane says something rather than sitting blank — and it is declared
    // `hidden` below tablet, because at phone widths there is no second pane to fill.
    const prompt = await screen.findByText(/choose a conversation to read it/i)
    expect(prompt.className).toMatch(/\bhidden\b/)
    expect(prompt.className).toMatch(/tablet:block/)
  })

  it('gives the thread its own labelled region, so the two panes are distinguishable', async () => {
    renderMessages({ at: THREAD, conversations: [aConversation()] })

    // A screen-reader user working through a two-pane layout needs to know which region they are
    // in. The thread is a `<section>` with its own heading rather than a bare column.
    const heading = await screen.findByRole('heading', { name: 'Conversation', level: 2 })
    const region = heading.closest('section')

    expect(region).not.toBeNull()
    expect(region).toHaveAttribute('aria-labelledby', heading.id)
  })

  it('the destination heading stays a single h1 above both panes', async () => {
    renderMessages({ at: THREAD, conversations: [aConversation()] })

    await screen.findByRole('link', { name: /sofía muñoz/i })
    const headings = screen.getAllByRole('heading', { level: 1 })

    expect(headings.map((heading) => heading.textContent)).toEqual(['Messages'])
  })
})
