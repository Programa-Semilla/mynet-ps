import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { aQuestion, openQuestionPanel, READER_ID } from '../support/questions.js'

/**
 * T075, T076, T077, T079, T080 (009) — the Q&A section's layout and accessibility
 * (FR-774–FR-780, SC-713).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **WHAT A COMPONENT TEST CAN AND CANNOT SAY ABOUT LAYOUT — 005'S SPLIT, INHERITED.**
 *
 * jsdom applies no stylesheet and computes no layout. It cannot measure a width, cannot tell
 * whether a document scrolls horizontally, and cannot resolve a Tailwind class into a pixel. A
 * test here claiming "nothing scrolls sideways at 390px" would check nothing at all — and this
 * feature has the strongest possible reason to take that seriously, because **008's scheduling
 * dialog rendered in the top-left corner of the viewport having passed 135 e2e tests, five
 * review agents and CodeRabbit.** Every one of them checked behaviour; none looked at position.
 *
 * So the split is deliberate and the honest half is here:
 *
 *   - **Measured properties** — position, width, overflow, the centring of both dialogs this
 *     feature opens — are asserted in a real browser by `e2e/responsive.spec.ts`.
 *   - **Structural properties** are asserted here: that touch targets are declared at 44px, that
 *     the list is a single column of prose, that a long question is allowed to wrap, and that
 *     every control carries an accessible name and a focus ring.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the Q&A section, structurally', () => {
  const THEIRS = aQuestion({ id: 'q-1', body: "Somebody else's question." })

  const MINE = aQuestion({
    id: 'q-2',
    body: 'My own, withdrawable question.',
    authorId: READER_ID,
    authorDisplayName: 'Ada Lovelace',
    canWithdraw: true,
  })

  it('gives every control a 44px touch target (FR-777)', async () => {
    await openQuestionPanel([THEIRS, MINE])

    // `min-h-11` / `size-11` / `min-w-11` are 44px at this project's 4px base — declared on each
    // control's own box rather than on the row, so the target is real without padding the row
    // out of shape. Mobile is the width where a question list is actually read (FR-776).
    const controls = [
      screen.getByRole('button', { name: /post question/i }),
      screen.getByRole('button', { name: /upvote/i }),
      screen.getByRole('button', { name: /withdraw/i }),
      ...screen.getAllByRole('button', { name: /report this question/i }),
    ]

    for (const control of controls) {
      expect(
        control.className,
        control.textContent ?? control.getAttribute('aria-label') ?? '',
      ).toMatch(/min-h-11|size-11/)
    }
  })

  it('renders the list as a single column (FR-776)', async () => {
    await openQuestionPanel([THEIRS, MINE])

    // Named rather than the only list on the page: Agenda's own programme is a list too, and
    // an unscoped query matches both.
    const list = screen.getByRole('list', { name: /questions, most upvoted first/i })

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **Single column at every width, tablet included.** Questions are prose, and a two-column
    // list of prose is harder to scan than one column of it — the reader is comparing sentences
    // rather than scanning cards. Declared as a flex column rather than any `grid-cols-*`, so
    // there is no breakpoint at which it can silently become two.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(list.className).toMatch(/flex-col/)
    expect(list.className).not.toMatch(/grid-cols-|columns-/)
  })

  it('lets a long question wrap rather than forcing a sideways scroll (FR-775)', async () => {
    const LONG = 'x'.repeat(400)
    await openQuestionPanel([aQuestion({ id: 'q-long', body: LONG })])

    const body = screen.getByText(LONG)

    // ───────────────────────────────────────────────────────────────────────────────────────
    // A 400-character question with no spaces is the worst case, and it is reachable: 500
    // characters of an unbroken URL is a perfectly ordinary thing for somebody to paste. Without
    // `break-words` it becomes one unbreakable box wider than the panel, and **no content or
    // primary action may require horizontal scrolling** at any supported width.
    //
    // The row also has to be allowed to shrink, or the flex parent hands it its content width
    // and the wrap never happens — `min-w-0` is the half that is easy to leave out.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(body.className).toMatch(/break-words/)
    expect(body.parentElement?.className).toMatch(/min-w-0/)
  })

  it('keeps the vote control from shrinking as the question grows', async () => {
    await openQuestionPanel([aQuestion({ id: 'q-long', body: 'x'.repeat(400) })])

    const upvote = screen.getByRole('button', { name: /upvote/i })
    // `shrink-0`, so a long question cannot squeeze the touch target below 44px — which is the
    // way a declared target silently stops being one.
    expect(upvote.className).toMatch(/shrink-0/)
  })

  it('gives every control a visible focus state (FR-777, SC-713)', async () => {
    await openQuestionPanel([THEIRS, MINE])

    // ───────────────────────────────────────────────────────────────────────────────────────
    // `focus-ring` is this project's shared utility. Asserted per control rather than trusted
    // to a global rule, because the register lists visible focus among the **settled
    // requirements the prototype failed to meet** — it is a known failure mode here, not a
    // hypothetical one.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const controls = [
      screen.getByRole('textbox', { name: /ask a question/i }),
      screen.getByRole('button', { name: /post question/i }),
      screen.getByRole('button', { name: /upvote/i }),
      screen.getByRole('button', { name: /withdraw/i }),
      ...screen.getAllByRole('button', { name: /report this question/i }),
    ]

    for (const control of controls) {
      expect(
        control.className,
        control.textContent ?? control.getAttribute('aria-label') ?? '',
      ).toMatch(/focus-ring/)
    }
  })

  it('names every control accessibly, including the ones that are only icons (FR-777)', async () => {
    await openQuestionPanel([THEIRS, MINE])

    for (const control of screen.getAllByRole('button')) {
      const name = control.textContent?.trim() || control.getAttribute('aria-label')
      expect(name, 'a control has no accessible name').toBeTruthy()
    }
  })

  it('gives the section a heading the panel can be navigated by', async () => {
    await openQuestionPanel([THEIRS])

    // A fourth section beside Overview, Speakers and Notes — each is a labelled region, which is
    // how a screen-reader user moves between them rather than reading the panel top to bottom.
    const heading = screen.getByRole('heading', { name: /audience questions/i })
    const section = heading.closest('section')

    expect(section?.getAttribute('aria-labelledby')).toBe(heading.getAttribute('id'))
  })

  it('sits beneath the three sections 005 built (FR-774)', async () => {
    await openQuestionPanel([THEIRS])

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Order matters on a desktop panel where all four are visible at once: Overview answers
    // "what is this", Speakers "who is giving it", Notes "what did I think" — and Q&A is what
    // the room is asking, which is the least personal and belongs last. Asserted by document
    // position so a re-ordering is a deliberate change rather than an import moved by a tool.
    // ───────────────────────────────────────────────────────────────────────────────────────
    const notes = screen.getByRole('heading', { name: /your notes/i })
    const questions = screen.getByRole('heading', { name: /audience questions/i })

    expect(
      notes.compareDocumentPosition(questions) & Node.DOCUMENT_POSITION_FOLLOWING,
      'the Q&A section is no longer the last of the four',
    ).toBeTruthy()
  })
})
