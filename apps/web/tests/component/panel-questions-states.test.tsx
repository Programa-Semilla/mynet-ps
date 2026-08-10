import { OfflineError } from '@mynet/data'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { aQuestion, openQuestionPanel, refusal } from '../support/questions.js'

/**
 * The Q&A section's **read** states (FR-728, FR-729, SC-715).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **ADDED AT DEEP REVIEW: THREE OF THE SECTION'S FOUR STATES WERE UNREACHABLE FROM ANY TEST.**
 *
 * The questions double resolved its `list` immediately from a fixed array, so nothing could
 * render the loading state, either failure wording, or the retry control. `panel-questions-
 * errors.test.tsx` looked like it covered the failure path and does not: it rejects **writes**,
 * which by design leave `status: 'ready'` and the list on screen. A read failure is a different
 * branch entirely, and it was the one carrying FR-728's two distinct explanations.
 *
 * SC-715 was in the same position — asserted nowhere. It is the requirement that keeps a broken
 * Q&A section from taking the rest of the panel down with it, which is Home's composed-card rule
 * applied one level in.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
describe('the Q&A section while its list is loading', () => {
  it('says so, and shows neither the empty state nor a failure (FR-728)', async () => {
    const { questions } = await openQuestionPanel([], { held: true })

    expect(screen.getByText(/loading questions/i)).toBeInTheDocument()
    // The empty state is a claim that nobody has asked anything. During a load it is not known.
    expect(screen.queryByText(/no questions yet/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    questions.resolveRead([aQuestion()])

    await waitFor(() =>
      expect(screen.getByText('How did you decide what to migrate first?')).toBeInTheDocument(),
    )
    expect(screen.queryByText(/loading questions/i)).not.toBeInTheDocument()
  })

  it('still offers the composer, so the panel is usable while the list arrives', async () => {
    await openQuestionPanel([], { held: true })

    // Asking does not depend on having read the list. Hiding the composer during the load would
    // make a slow connection look like a section that cannot be used.
    expect(screen.getByRole('textbox', { name: /ask a question/i })).toBeInTheDocument()
  })
})

describe('the Q&A section when its list cannot be read', () => {
  it('distinguishes no-connection from a fault on our side (FR-728)', async () => {
    await openQuestionPanel([], { fails: new OfflineError('Questions') })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/need a connection/i)
    // ───────────────────────────────────────────────────────────────────────────────────────
    // Nothing is cached for Q&A (FR-754), and the wording says so rather than implying that
    // something might appear later. It must not blame the attendee's account either.
    // ───────────────────────────────────────────────────────────────────────────────────────
    expect(alert).toHaveTextContent(/nothing is cached/i)
    expect(alert).not.toHaveTextContent(/problem on our side/i)
  })

  it('names a server fault as ours, not the attendee’s (FR-728)', async () => {
    await openQuestionPanel([], { fails: refusal('internal_error', 'boom') })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/problem on our side, not with your account/i)
    expect(alert).not.toHaveTextContent(/connection/i)
  })

  it('offers a retry that actually re-reads (FR-729)', async () => {
    const user = userEvent.setup()
    const { questions } = await openQuestionPanel([], {
      fails: refusal('internal_error', 'boom'),
    })

    await screen.findByRole('alert')
    expect(questions.reads()).toBe(1)

    await user.click(screen.getByRole('button', { name: /try again/i }))

    // The assertion that matters: a second call reached the repository. A retry control that
    // only cleared the message would look identical on screen and fix nothing.
    await waitFor(() => expect(questions.reads()).toBe(2))
  })
})

describe('a failed Q&A read and the rest of the panel (SC-715)', () => {
  it('leaves Overview, Speakers and Notes rendered and interactive', async () => {
    const user = userEvent.setup()
    await openQuestionPanel([], { fails: refusal('internal_error', 'boom') })

    await screen.findByRole('alert')

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **The three neighbouring sections are untouched.** Q&A is one section of four, and it is
    // the only one that depends on this repository — so a failure here must be contained to it,
    // exactly as Home's cards contain their own failures (standing decision 9, one level down).
    // ═══════════════════════════════════════════════════════════════════════════════════════
    expect(screen.getByRole('heading', { name: /your notes/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /audience questions/i })).toBeInTheDocument()

    // Interactive, not merely present: the notes editor still accepts typing.
    const notes = screen.getByRole('textbox', { name: /private notes/i })
    await user.type(notes, 'Still usable.')
    expect(notes).toHaveValue('Still usable.')

    // And the panel itself still closes, which is the failure mode that would trap a reader.
    expect(screen.getByRole('button', { name: /close session details/i })).toBeEnabled()
  })
})

describe('switching sessions with the panel open (FR-751)', () => {
  it('carries no Q&A state from one session into another', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // The whole mechanism is one `key` on `PanelQuestions` in `SessionPanel.tsx`. Removing it
    // is invisible to every other test while carrying a typed-but-unposted question — **public
    // content, addressed to a room the reader has now left** — into the next session's composer.
    // 005 has the equivalent guard for the notes editor; this is Q&A's.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const user = userEvent.setup()
    const { questions } = await openQuestionPanel([aQuestion()])

    await user.click(screen.getByRole('textbox', { name: /ask a question/i }))
    await user.paste('A draft meant for the keynote.')
    expect(screen.getByRole('textbox', { name: /ask a question/i })).toHaveValue(
      'A draft meant for the keynote.',
    )

    const readsBefore = questions.reads()

    // Leave, and open a different session's panel.
    await user.click(screen.getByRole('button', { name: /close session details/i }))
    await user.click(await screen.findByRole('link', { name: 'Open Studio' }))
    await screen.findByRole('heading', { level: 2, name: 'Open Studio' })

    expect(
      screen.getByRole('textbox', { name: /ask a question/i }),
      "the previous session's draft question followed the reader into another session",
    ).toHaveValue('')

    // …and the list was read again for the new session rather than reused.
    await waitFor(() => expect(questions.reads()).toBeGreaterThan(readsBefore))
  })
})
