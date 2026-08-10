import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { aQuestion, openQuestionPanel, READER_ID } from '../support/questions.js'

/**
 * T047, T054 (009) — the upvote and withdrawal controls
 * (FR-713, FR-720, FR-721, FR-724, SC-706).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE CONTROLS ARE ABSENT WHERE THE SERVER WOULD REFUSE, NOT PRESENT AND FAILING** (FR-713).
 *
 * An attendee's own question offers no upvote, and a question with a vote on it offers no
 * withdrawal. Both are presentation of a rule the server enforces independently — the interface
 * is never the enforcement — but a disabled or failing control would hand the reader a dead end
 * they have to work out, in place of an absence that says the answer already.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the upvote control', () => {
  const THEIRS = aQuestion({ id: 'q-theirs', body: "Somebody else's question.", votes: 3 })

  const MINE = aQuestion({
    id: 'q-mine',
    body: 'My own question.',
    authorId: READER_ID,
    authorDisplayName: 'Ada Lovelace',
    votes: 2,
  })

  it('names the question it votes for, and conveys pressed state (FR-720, FR-724, SC-706)', async () => {
    await openQuestionPanel([THEIRS])

    const upvote = screen.getByRole('button', { name: /upvote/i })

    // ───────────────────────────────────────────────────────────────────────────────────────
    // **The label has to name the question**, or a screen-reader user working down a list hears
    // "Upvote, Upvote, Upvote" with nothing to distinguish them. Composed from the question's
    // own text node rather than duplicated into an `aria-label` string, so the label and the
    // body cannot drift apart.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(upvote).toHaveAccessibleName(/upvote/i)
    expect(upvote).toHaveAccessibleName(/somebody else's question/i)

    // Pressed state conveyed to assistive technology, not by colour alone.
    expect(upvote).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders the voted state as pressed (FR-720)', async () => {
    await openQuestionPanel([aQuestion({ ...THEIRS, votedByMe: true })])

    const upvote = screen.getByRole('button', { name: /remove your upvote/i })
    expect(upvote).toHaveAttribute('aria-pressed', 'true')
  })

  it('sends an un-vote when the question is already voted, and a vote when it is not', async () => {
    const user = userEvent.setup()
    const { questions } = await openQuestionPanel([aQuestion({ ...THEIRS, votedByMe: true })])

    await user.click(screen.getByRole('button', { name: /remove your upvote/i }))

    // ───────────────────────────────────────────────────────────────────────────────────────
    // The direction is chosen from the state the row rendered, not from a desired state passed
    // in by each call site. Three call sites computing `voted ? unvote : vote` would be three
    // places for the sense to be inverted, and an inverted vote is invisible until somebody
    // counts.
    // ───────────────────────────────────────────────────────────────────────────────────────
    await waitFor(() => expect(questions.writes).toHaveLength(1))
    expect(questions.writes[0]).toEqual({ kind: 'unvote', value: 'q-theirs' })
  })

  it('offers NO upvote on the reader’s own question (FR-722)', async () => {
    await openQuestionPanel([MINE])

    // Matching the server, which refuses a self-upvote outright. Absent rather than disabled:
    // a disabled control invites the reader to work out why, and the answer is a thing they
    // already know.
    expect(screen.queryByRole('button', { name: /upvote/i })).not.toBeInTheDocument()

    // The count is still shown — a row must not lose its leading column just because the reader
    // wrote it.
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('renders the author name as text, never as a link into their profile (FR-736)', async () => {
    await openQuestionPanel([THEIRS])

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **The client half of FR-736.** Attribution is unconditional — a non-discoverable author is
    // still named — and that is only defensible because the name is not a route: their profile
    // refuses to open, which `questions-ask.test.ts` asserts server-side.
    //
    // Wrapping this name in a `<Link to={`/discover/${authorId}`}>` is the single most likely
    // "improvement" a later reader makes to this surface, and it would pass every other test in
    // the feature — `getByText` matches a link exactly as it matches a paragraph.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const name = screen.getByText('Grace Hopper')

    expect(
      name.closest('a'),
      "the author's name is a link. FR-736 keeps it attribution rather than a route into a " +
        'profile the directory may deliberately be withholding.',
    ).toBeNull()
    expect(name.closest('button')).toBeNull()
  })

  it('names no other voter anywhere on the surface (FR-721, FR-769)', async () => {
    await openQuestionPanel([aQuestion({ ...THEIRS, votes: 3, votedByMe: true })])

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Three votes, one of them the reader's. The surface may say "3" and may say that *this
    // reader* voted; it must not name or hint at the other two. Asserted over the rendered text
    // because the leak this guards against is a helpful addition nobody thought to forbid —
    // "you and 2 others", an avatar stack, a tooltip.
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Read from the open panel rather than from a render container, because the panel is a
    // `<dialog>` in the top layer — the harness returns the Agenda render, and the section under
    // test lives inside the dialog it opened.
    const panel = screen.getByRole('dialog', { name: /opening keynote/i })
    const text = panel.textContent ?? ''

    expect(text).not.toMatch(/others?\b/i)
    expect(text).not.toMatch(/voted by|voters/i)
  })
})

describe('the withdrawal control', () => {
  const WITHDRAWABLE = aQuestion({
    id: 'q-fresh',
    body: 'Mine, and nobody has backed it.',
    authorId: READER_ID,
    authorDisplayName: 'Ada Lovelace',
    canWithdraw: true,
  })

  const BACKED = aQuestion({
    id: 'q-backed',
    body: 'Mine, but somebody has backed it.',
    authorId: READER_ID,
    authorDisplayName: 'Ada Lovelace',
    votes: 1,
    canWithdraw: false,
  })

  it('is offered while the question has no votes (FR-713)', async () => {
    await openQuestionPanel([WITHDRAWABLE])
    expect(screen.getByRole('button', { name: /withdraw/i })).toBeInTheDocument()
  })

  it('is ABSENT once somebody has upvoted, rather than present and failing (FR-713)', async () => {
    await openQuestionPanel([BACKED])

    // ───────────────────────────────────────────────────────────────────────────────────────
    // Driven by the server's `canWithdraw` — `author === reader && votes === 0`, computed in the
    // list query — so the control's absence and the server's refusal cannot disagree. The client
    // does not recompute it, which is what stops the two drifting when the rule changes.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(screen.queryByRole('button', { name: /withdraw/i })).not.toBeInTheDocument()

    // …and the question is still there, unmistakably the reader's own.
    expect(screen.getByText('Mine, but somebody has backed it.')).toBeInTheDocument()
  })

  it('confirms before withdrawing, and sends nothing if dismissed (FR-712, FR-752)', async () => {
    const user = userEvent.setup()
    const { questions } = await openQuestionPanel([WITHDRAWABLE])

    await user.click(screen.getByRole('button', { name: /withdraw/i }))

    const dialog = await screen.findByRole('dialog', { name: /withdraw this question/i })
    // The consequence is stated before the attendee commits: it is removed for everybody, and
    // the possibility ends the moment somebody upvotes.
    expect(within(dialog).getByText(/removed for everyone/i)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(questions.writes, 'a dismissed confirmation still withdrew the question').toHaveLength(0)
  })

  it('adds no local centring class to the confirmation (T057)', async () => {
    const user = userEvent.setup()
    await openQuestionPanel([WITHDRAWABLE])

    await user.click(screen.getByRole('button', { name: /withdraw/i }))
    const dialog = await screen.findByRole('dialog', { name: /withdraw this question/i })

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **`theme/tokens.css` restores `margin: auto` for every modal dialog, and re-patching it
    // per dialog is what that base rule exists to stop.**
    //
    // 005 and 006 each rediscovered Tailwind Preflight's `margin: 0` and patched it locally with
    // `m-auto`; 004's `ConfirmDialog` and 008's `ScheduleDialog` did not, and both shipped in
    // the top-left corner. This asserts the class is not being reintroduced here — the *visual*
    // half is `e2e/responsive.spec.ts`, because jsdom applies no user-agent stylesheet and
    // cannot see position at all.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    expect(dialog.className).not.toMatch(/\bm-auto\b/)
    expect(dialog.className).not.toMatch(/\bmx-auto\b/)
  })
})
