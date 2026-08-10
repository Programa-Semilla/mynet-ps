import type { QuestionListItem } from '@mynet/data'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { renderAgenda, type RenderedAgenda } from './agenda.js'

/**
 * A questions repository whose **reads resolve and whose writes are held open** until the test
 * settles them (009).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * The same shape 005's `notesDouble` establishes, and for the same reason: every interesting
 * property of this feature lives in the interval between the reader acting and the server
 * answering. The post control must be disabled inside it, the typed text must survive a failure
 * inside it, and a refusal must render its own message rather than a generic one. A double that
 * resolved immediately would collapse that interval to nothing and the assertions would pass
 * vacuously.
 *
 * **The write settles with a whole list, not a single question** — research R5's decision
 * expressed in the fixture. A double that returned the created row would let an implementation
 * that patches state locally pass, which is exactly the implementation FR-726 and FR-780 forbid.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export interface QuestionsDouble {
  /** Every write attempted, in order, with what it was. */
  readonly writes: Array<{ kind: 'ask' | 'withdraw' | 'vote' | 'unvote'; value: string }>
  /** Settles the nth write with the list the server would answer with. */
  readonly resolveWrite: (index: number, questions: QuestionListItem[]) => void
  /** Settles the nth write with a refusal. Pass a `code` to exercise classification (FR-745). */
  readonly rejectWrite: (index: number, error: Error) => void
  /** Settles the pending `list` read. Only meaningful when the double was built to hold it. */
  readonly resolveRead: (questions: QuestionListItem[]) => void
  readonly rejectRead: (error: Error) => void
  /** How many times `list` has been called — the retry assertions read this. */
  readonly reads: () => number
  readonly repository: {
    list: (eventId: string, sessionId: string) => Promise<QuestionListItem[]>
    ask: (eventId: string, sessionId: string, body: string) => Promise<QuestionListItem[]>
    withdraw: (eventId: string, questionId: string) => Promise<QuestionListItem[]>
    vote: (eventId: string, questionId: string) => Promise<QuestionListItem[]>
    unvote: (eventId: string, questionId: string) => Promise<QuestionListItem[]>
  }
}

/**
 * A refusal in the shape the HTTP layer actually produces: an `Error` carrying a `code`.
 *
 * `ApiError extends RequestRefusedError`, so **every** non-2xx arrives as the same class and only
 * `code` distinguishes them (FR-745). Constructing the double's failures this way is what makes
 * the classification tests meaningful — a double that threw bare `Error`s could not tell a
 * correct implementation from the `instanceof` one 008 shipped.
 */
export const refusal = (code: string, message: string): Error =>
  Object.assign(new Error(message), { code })

/** The reader these fixtures are written from the point of view of. */
export const READER_ID = 'attendee-ada'

export const aQuestion = (overrides: Partial<QuestionListItem> = {}): QuestionListItem => ({
  id: 'question-1',
  body: 'How did you decide what to migrate first?',
  askedAt: '2026-09-14T09:05:00.000Z',
  authorId: 'attendee-grace',
  authorDisplayName: 'Grace Hopper',
  votes: 0,
  votedByMe: false,
  canWithdraw: false,
  ...overrides,
})

/**
 * How the double answers the initial `list` read.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Added because the section's loading and failure states were unreachable.** The double
 * resolved `list` immediately from a fixed array, so no test could render the spinner, either
 * failure wording, or the retry control — three branches of `PanelQuestions` and the whole of
 * FR-728, FR-729 and SC-715.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export interface ReadBehaviour {
  /** Hold the read open until the test settles it, so the loading state is observable. */
  readonly held?: boolean
  /** Reject the read with this, so the failure states are observable. */
  readonly fails?: Error
}

export const questionsDouble = (
  initial: QuestionListItem[] = [],
  read: ReadBehaviour = {},
): QuestionsDouble => {
  const writes: QuestionsDouble['writes'] = []
  const settlers: Array<{
    resolve: (value: QuestionListItem[]) => void
    reject: (error: Error) => void
  }> = []

  const held = (kind: QuestionsDouble['writes'][number]['kind'], value: string) => {
    writes.push({ kind, value })
    return new Promise<QuestionListItem[]>((resolve, reject) => {
      settlers.push({ resolve, reject })
    })
  }

  const settlerAt = (index: number) => {
    const settler = settlers[index]
    if (!settler) throw new Error(`No write at index ${index}; ${settlers.length} attempted.`)
    return settler
  }

  let readSettler:
    { resolve: (value: QuestionListItem[]) => void; reject: (error: Error) => void } | undefined
  let reads = 0

  return {
    writes,
    resolveWrite: (index, questions) => settlerAt(index).resolve(questions),
    rejectWrite: (index, error) => settlerAt(index).reject(error),
    resolveRead: (questions) => {
      if (!readSettler)
        throw new Error('No held read to resolve; build the double with { held: true }.')
      readSettler.resolve(questions)
    },
    rejectRead: (error) => {
      if (!readSettler)
        throw new Error('No held read to reject; build the double with { held: true }.')
      readSettler.reject(error)
    },
    reads: () => reads,
    repository: {
      list: async () => {
        reads += 1
        if (read.fails) throw read.fails
        if (!read.held) return initial
        return new Promise<QuestionListItem[]>((resolve, reject) => {
          readSettler = { resolve, reject }
        })
      },
      ask: async (_eventId, _sessionId, body) => held('ask', body),
      withdraw: async (_eventId, questionId) => held('withdraw', questionId),
      vote: async (_eventId, questionId) => held('vote', questionId),
      unvote: async (_eventId, questionId) => held('unvote', questionId),
    },
  }
}

export interface OpenedQuestionPanel extends RenderedAgenda {
  readonly questions: QuestionsDouble
}

/**
 * Renders Agenda, opens the first session's panel, and returns the questions double.
 *
 * The panel is opened by clicking the session title, exactly as an attendee reaches it — not by
 * rendering `PanelQuestions` directly. 005 records why for the notes editor and it is more
 * important here: this section opens **a second dialog inside an already-modal panel**, and a
 * test that mounted the section standalone could not see the nesting at all.
 */
export const openQuestionPanel = async (
  initial: QuestionListItem[] = [],
  read: ReadBehaviour = {},
): Promise<OpenedQuestionPanel> => {
  const questions = questionsDouble(initial, read)
  const user = userEvent.setup()

  const rendered = renderAgenda({ overrides: { questions: questions.repository } })

  await user.click(await screen.findByRole('link', { name: 'Opening Keynote' }))
  await screen.findByRole('heading', { level: 2, name: 'Opening Keynote' })

  return { ...rendered, questions }
}
