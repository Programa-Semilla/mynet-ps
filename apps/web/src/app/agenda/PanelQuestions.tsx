import type { QuestionListItem } from '@mynet/data'
import { ArrowUp, Flag, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'

import { useAuth } from '../../auth/useAuth.js'
import { Loading } from '../AsyncState.js'
import { ConfirmDialog } from '../profile/ConfirmDialog.js'
import { ReportDialog } from '../safety/ReportDialog.js'
import { useSessionQuestions } from './useSessionQuestions.js'

/**
 * T034, T040–T043, T048–T050, T055–T057 (009) — audience questions, as the panel's **fourth**
 * section (FR-701–FR-732, FR-748–FR-752, FR-774–FR-780).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A FOURTH SECTION BESIDE OVERVIEW, SPEAKERS AND NOTES — AND THE PANEL IS DELIBERATELY NOT A
 * REGISTRY** (research R3).
 *
 * 005 left this section shaped for exactly this: `PanelNotes` says in its own header that it is
 * the third "so 009 can add audience questions as a fourth without editing any of them". The one
 * line in `SessionPanel.tsx` is the whole composition. Converting the panel to a
 * `home/registry.ts`-style extension point would be a *larger* edit to 005's file than adding the
 * line, in service of a future contributor the roadmap says does not exist — 009 is the last
 * feature. Recorded so 010 can revisit it if a fifth section ever arrives.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **THIS SECTION IS PUBLIC AND ITS NEIGHBOUR IS PRIVATE, AND NOTHING BUT THE HEADINGS SAYS SO.**
 *
 * `PanelNotes` directly above renders "Only you can see these." into its placeholder. This one
 * publishes to a whole conference under a real name with **no opt-out** — the exception
 * constitution v3.3.0 records. An attendee who has just used the notes field and moves down to
 * this one is the person FR-739 is about, which is why the consequence is stated at the point of
 * asking rather than in a heading, a tooltip, or afterwards.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** The limit, matching the route schema and the column's CHECK. Stated once per layer. */
const QUESTION_MAX_LENGTH = 500

/**
 * When the remaining allowance starts being shown (FR-706).
 *
 * A fifth of the budget, where `PanelNotes` uses a twentieth — the proportion that matters is how
 * much warning it gives, and 100 characters is roughly a sentence: enough to finish a thought and
 * stop. The attendee must learn of the limit **before** a rejected write, which is why this is
 * presentation of a rule enforced twice over on the server rather than the rule itself.
 */
const REMAINING_VISIBLE_AT = 100

export const PanelQuestions = ({ eventId, sessionId }: { eventId: string; sessionId: string }) => {
  const questions = useSessionQuestions(eventId, sessionId)
  const headingId = useId()

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Who the reader is, read from the signed-in session and compared against `authorId`.**
   *
   * Deliberately NOT a field on the response. The interface carries `votedByMe` and
   * `canWithdraw` because both are facts the *server* computes and the client must not
   * recompute — but "is this mine" is a comparison of two values the client already holds, and
   * adding an `isMine` alongside them would be a third piece of reader-specific state on a
   * payload that is otherwise the same for everybody.
   *
   * It decides presentation only. The server refuses a self-upvote regardless (FR-722), which
   * is why a null attendee here degrades to *showing* the control rather than hiding it: an
   * unauthenticated reader cannot reach this panel at all, and if one ever did, the refusal
   * they would meet is the correct behaviour rather than a control silently missing.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  const self = useAuth().attendee?.id ?? null

  return (
    <section aria-labelledby={headingId} className="mt-6">
      <h3 id={headingId} className="mb-2 font-display text-sm font-medium text-text-primary">
        Audience questions
      </h3>

      <QuestionComposer questions={questions} />
      <QuestionList questions={questions} self={self} />
    </section>
  )
}

/**
 * The ask form (FR-701–FR-707, FR-739).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE POST CONTROL IS DISABLED WHILE THE FIELD IS EMPTY OR WHITESPACE — NEVER AN ERROR
 * AFTERWARDS** (FR-704).
 *
 * `requirements.md` names this treatment for the empty meeting topic and the empty message, and a
 * question is the same shape of field. The server refuses a blank body too, and the column's
 * `CHECK` refuses it a third time with `length(trim(body)) > 0` — because client-side
 * presentation of a rule is never the enforcement of it. Trimmed here so whitespace is not a
 * question, matching what the server stores.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const QuestionComposer = ({ questions }: { questions: ReturnType<typeof useSessionQuestions> }) => {
  const fieldId = useId()
  const noticeId = useId()
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  const trimmed = body.trim()
  const remaining = QUESTION_MAX_LENGTH - body.length

  const post = (): void => {
    if (trimmed.length === 0 || posting) return

    // What is on screen at the moment of submission, so the clear below can tell "the field
    // still holds what I posted" from "the attendee has started typing something else".
    const posted = body

    setPosting(true)
    void questions
      .ask(trimmed)
      .then((accepted) => {
        // ───────────────────────────────────────────────────────────────────────────────────
        // **Cleared only on success, and the outcome comes from the CALL rather than from
        // `questions.error`** (FR-707, FR-759, SC-712).
        //
        // Reading `questions.error` here was a defect and its own test caught it: this handler
        // closes over the `error` value from the render that created it, which is `null` because
        // the write had not failed yet. Every outcome therefore looked like success and the
        // field was cleared on refusal too — losing the attendee's question while the message
        // beneath it said nothing had been sent.
        // ───────────────────────────────────────────────────────────────────────────────────
        // ═══════════════════════════════════════════════════════════════════════════════
        // **CLEARED ONLY IF THE FIELD STILL HOLDS WHAT WAS POSTED** (FR-707, SC-712).
        //
        // The clear lands whenever the response does, which may be a second later. An attendee
        // who starts typing their next question while the first is in flight — entirely normal
        // at a keynote — would otherwise have that text **wiped by the previous request's
        // success**, with nothing on screen to explain where it went.
        //
        // Found by an end-to-end test that asked two questions in quick succession and then sat
        // on a permanently disabled post control: the second question had been typed, cleared
        // by the first response, and the button was correctly disabled for an empty field.
        //
        // The functional form is what makes the comparison sound — it reads the current value
        // rather than the one this closure captured, which is the same staleness that made
        // reading `questions.error` here wrong.
        // ═══════════════════════════════════════════════════════════════════════════════
        if (accepted) setBody((current) => (current === posted ? '' : current))
      })
      .finally(() => setPosting(false))
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        post()
      }}
      className="mb-4"
    >
      <label htmlFor={fieldId} className="sr-only">
        Ask a question about this session
      </label>
      <textarea
        id={fieldId}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        maxLength={QUESTION_MAX_LENGTH}
        aria-describedby={noticeId}
        placeholder="Ask the room a question…"
        className="focus-ring w-full rounded-sm border border-border-subtle bg-surface px-3 py-2 text-sm text-text-body"
      />

      {/*
        ═══════════════════════════════════════════════════════════════════════════════════════
        **T043 — FR-739, AT THE POINT OF ASKING AND NOT AFTERWARDS.**

        Bound to the field with `aria-describedby`, so a screen reader meets it on reaching the
        textarea rather than having to go looking. It is the one consequence of this feature an
        attendee cannot undo once a vote arrives, and the one they would otherwise discover by
        seeing their own name on a public list.
        ═══════════════════════════════════════════════════════════════════════════════════════
      */}
      <p id={noticeId} className="mt-2 text-xs text-text-muted">
        Your question is shown to everyone at this conference with your name on it. You can take it
        back until somebody upvotes it.
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <button
          type="submit"
          // FR-704 — disabled, never a post-submit error. `trimmed` rather than `body`, so a
          // field of spaces is refused here exactly as the column refuses it.
          disabled={trimmed.length === 0 || posting}
          className="focus-ring min-h-11 rounded-sm bg-accent-strong px-4 py-2 text-sm font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50"
        >
          {posting ? 'Posting…' : 'Post question'}
        </button>

        {/* FR-706 — the limit, communicated as it is approached rather than by a rejection. */}
        {remaining <= REMAINING_VISIBLE_AT && (
          <p className="text-xs text-text-muted">
            {remaining} character{remaining === 1 ? '' : 's'} left
          </p>
        )}
      </div>

      {/*
        ═══════════════════════════════════════════════════════════════════════════════════════
        A write's refusal, shown **without touching the list** — the read succeeded, only the
        action failed. `role="alert"` because a question the attendee believes they posted and
        has not is exactly the case that must interrupt.

        The message is the server's own sentence, reached by `error.code` classification in the
        hook (FR-745). Both of this feature's explained refusals arrive here intact.

        **Suppressed while the read itself failed**, which is not a nicety: the hook carries one
        `error`, so a failed *list* set it too and the same sentence rendered twice in two
        separate alert regions — announced twice by a screen reader, once beside a composer that
        had nothing to do with it. `QuestionList` owns the read failure; this owns the write.
        ═══════════════════════════════════════════════════════════════════════════════════════
      */}
      {questions.error && questions.status !== 'failed' && (
        <p role="alert" className="mt-2 text-xs text-danger-700">
          {questions.error.message}
        </p>
      )}
    </form>
  )
}

/** The list, and its three states (FR-727, FR-728, FR-729). */
const QuestionList = ({
  questions,
  self,
}: {
  questions: ReturnType<typeof useSessionQuestions>
  self: string | null
}) => {
  if (questions.status === 'loading') return <Loading label="Loading questions…" />

  if (questions.status === 'failed') {
    return (
      <div role="alert" className="text-sm text-text-body">
        <p>
          {/*
            FR-728 — an absence of connection and a fault on our side are different facts and are
            worded differently. `offline` is carried by the hook rather than re-derived here,
            which is 005's rule: a second guess about the cause would be invented information.
          */}
          {questions.offline
            ? 'Questions need a connection, and there is not one right now. Nothing is cached for them on this device.'
            : 'Questions could not be loaded. This is a problem on our side, not with your account.'}
        </p>
        <button
          type="button"
          onClick={questions.retry}
          className="focus-ring mt-2 min-h-11 rounded-sm border border-border-subtle px-3 py-1 text-sm font-medium text-text-primary"
        >
          Try again
        </button>
      </div>
    )
  }

  // FR-727 — an empty list is a valid answer, and it invites rather than reporting nothing.
  if (questions.questions.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No questions yet. Ask the first one — everyone at this session will see it.
      </p>
    )
  }

  return (
    /*
      Labelled, so a screen-reader user landing in the list is told what it is and how it is
      ordered. The ordering is not otherwise perceivable without reading every count — and the
      order is the whole point of upvoting.
    */
    <ul aria-label="Questions, most upvoted first" className="flex flex-col gap-3">
      {questions.questions.map((question) => (
        /*
          ═══════════════════════════════════════════════════════════════════════════════════
          **T049 — KEYED ON THE QUESTION ID, WHICH IS WHAT KEEPS FOCUS ON A MOVING ROW**
          (FR-780, research R5).

          Focus is lost when the focused node is **unmounted**, not when it is moved. With a
          stable key React reorders the existing DOM nodes as a question rises past its
          neighbours, and the upvote control the reader just activated stays focused underneath
          their finger. Keying on the array index instead would unmount and remount every row
          past the one that moved — the control would lose focus at the exact moment it was
          used, and no component test could see it.
          ═══════════════════════════════════════════════════════════════════════════════════
        */
        <QuestionRow key={question.id} question={question} questions={questions} self={self} />
      ))}
    </ul>
  )
}

const QuestionRow = ({
  question,
  questions,
  self,
}: {
  question: QuestionListItem
  questions: ReturnType<typeof useSessionQuestions>
  self: string | null
}) => {
  const bodyId = useId()
  const voteLabelId = useId()
  const [withdrawing, setWithdrawing] = useState(false)
  const [reporting, setReporting] = useState(false)
  const withdrawOpener = useRef<HTMLButtonElement>(null)
  const reportOpener = useRef<HTMLButtonElement>(null)

  const mine = question.authorId === self

  return (
    <li className="rounded-md border border-border-subtle bg-surface p-3">
      <div className="flex items-start gap-3">
        {/*
          T048, T050 — the upvote, or nothing at all on the reader's own question.

          **Omitted rather than disabled** on their own question, matching the server's refusal
          (FR-722): a disabled control invites the reader to work out why, and the answer is
          something they already know. The server still refuses it, because the interface is
          never the enforcement.
        */}
        {mine ? (
          <VoteCount votes={question.votes} />
        ) : (
          <button
            type="button"
            onClick={() => void questions.toggleVote(question.id, question.votedByMe)}
            /*
              FR-720, FR-776 — the pressed state conveyed to assistive technology, and a label
              that names *which* question this votes for.

              `aria-labelledby` composes the two elements rather than duplicating the question
              text into an `aria-label` string: a 500-character label built by hand is a second
              copy of the body that can drift from the one on screen, and this cannot.
            */
            aria-pressed={question.votedByMe}
            aria-labelledby={`${voteLabelId} ${bodyId}`}
            className={`focus-ring flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-sm border px-2 py-1 ${
              question.votedByMe
                ? 'border-accent-strong bg-accent-soft text-accent-strong'
                : 'border-border-subtle text-text-muted'
            }`}
          >
            <ArrowUp aria-hidden="true" className="size-4" />
            <span className="text-xs font-medium tabular-nums">{question.votes}</span>
            <span id={voteLabelId} className="sr-only">
              {question.votedByMe ? 'Remove your upvote from' : 'Upvote'}
            </span>
          </button>
        )}

        <div className="min-w-0 flex-1">
          {/* FR-775 — a long question wraps rather than forcing the panel to scroll sideways. */}
          <p id={bodyId} className="break-words text-sm text-text-body">
            {question.body}
          </p>

          {/*
            FR-702, FR-734 — the author's display name, on **every** question. Rendered as plain
            text and not as a link: FR-736 keeps the name attribution rather than a route into a
            profile, so an author who is not discoverable is named here and still refuses to open.
          */}
          <p className="mt-1 text-xs text-text-muted">{question.authorDisplayName}</p>

          {/*
            T055 — FR-713. Present only while the server says it is possible, and the server is
            still the enforcement: `canWithdraw` is `author === reader && votes === 0`, computed
            in the list query so the control's absence and the refusal cannot disagree.
          */}
          <div className="flex flex-wrap items-center gap-3">
            {question.canWithdraw && (
              <button
                ref={withdrawOpener}
                type="button"
                onClick={() => setWithdrawing(true)}
                className="focus-ring mt-2 inline-flex min-h-11 items-center gap-1 rounded-sm px-1 text-xs font-medium text-text-muted"
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
                Withdraw
              </button>
            )}

            {/*
              ═══════════════════════════════════════════════════════════════════════════════
              **T073 — FR-781: REPORTABLE FROM THE QUESTION, WITHOUT OPENING A CONVERSATION.**

              This is what makes the product's first unmoderated many-to-many surface
              survivable. Before it, the only way to report somebody was from a thread — so an
              attendee facing an abusive *question* would have had to message its author first,
              which is contact with the very person they want to stop.

              Not offered on the reader's own question: reporting yourself is refused by the
              route with a 400, and offering a control whose only outcome is that refusal is
              worse than omitting it. The same reasoning as hiding the upvote.
              ═══════════════════════════════════════════════════════════════════════════════
            */}
            {!mine && (
              <button
                ref={reportOpener}
                type="button"
                onClick={() => setReporting(true)}
                aria-label={`Report this question by ${question.authorDisplayName}`}
                className="focus-ring mt-2 inline-flex min-h-11 items-center gap-1 rounded-sm px-1 text-xs font-medium text-text-muted"
              >
                <Flag aria-hidden="true" className="size-3.5" />
                Report
              </button>
            )}
          </div>
        </div>
      </div>

      {/*
        ═══════════════════════════════════════════════════════════════════════════════════════
        **T056, T057 — A SECOND `<dialog>` OPENING INSIDE AN ALREADY-MODAL PANEL** (research R2).

        The top layer is a **stack**, not a slot: `showModal()` pushes onto it, the browser
        renders it above the panel, and **Escape dismisses the topmost dialog only**. So Escape
        closes this confirmation and leaves the panel open, with its address unchanged — the
        platform guarantee, not something this file implements.

        Two consequences are handled rather than assumed, and both are 005's lessons one level
        down. The panel is **inert** while this is open, so focus restoration to the opener must
        happen **after** closing — `ConfirmDialog` does exactly that, in that order, and reusing
        it rather than opening a hand-written dialog is what keeps the ordering in one place.
        And the panel's own `onCancel` must not fire for this Escape; it will not, because the
        event targets the topmost dialog, which `e2e/session-qa.spec.ts` asserts rather
        than trusting — the panel's handler navigates, so if it were ever wrong the address would
        change when the attendee meant to dismiss a confirmation.

        **No centring class here.** `theme/tokens.css` restores `margin: auto` for every modal
        dialog; adding `m-auto` locally is what that rule exists to stop, and two dialogs have
        already shipped in the top-left corner by doing it the other way.
        ═══════════════════════════════════════════════════════════════════════════════════════
      */}
      {withdrawing && (
        <ConfirmDialog
          title="Withdraw this question?"
          confirmLabel="Withdraw"
          confirming={false}
          destructive
          onConfirm={() => {
            void questions.withdraw(question.id)
            setWithdrawing(false)
          }}
          onDismiss={() => setWithdrawing(false)}
          returnFocusTo={withdrawOpener}
        >
          <p>
            It will be removed for everyone at this session. You cannot withdraw a question once
            somebody has upvoted it.
          </p>
        </ConfirmDialog>
      )}

      {/*
        T073 — the moved dialog, opened **inside** the session panel with the same focus ordering
        as the withdrawal confirmation above (research R2, R4).

        It is `ConfirmDialog` underneath, so the inert-panel ordering, Escape and the disabled
        confirmation while the reason is blank (FR-546, T074) are all inherited rather than
        reimplemented — which is the whole reason 007's dialog was moved instead of copied.

        `questionIds` carries this one question; `messageIds` is deliberately left empty, because
        nothing about this report concerns a conversation and inventing one would put a thread
        identifier into a record about a public list.
      */}
      {reporting && (
        <ReportDialog
          attendeeId={question.authorId}
          displayName={question.authorDisplayName}
          questionIds={[question.id]}
          returnFocusTo={reportOpener}
          onReported={() => {
            setReporting(false)
            // ─────────────────────────────────────────────────────────────────────────────
            // **SC-711a's second half.** Reporting blocks the author server-side, and the
            // block filter lives in the list query — so without a re-read the reported
            // question, and every other question by that author, stays on screen until the
            // panel is closed and reopened. The report would have worked and looked as though
            // it had not, which is the outcome "the first without the second files paperwork
            // and changes nothing on screen" names exactly.
            //
            // `refresh` rather than `retry`: nothing failed, so there is nothing to show a
            // spinner for.
            // ─────────────────────────────────────────────────────────────────────────────
            void questions.refresh()
          }}
          onDismiss={() => setReporting(false)}
        />
      )}
    </li>
  )
}

/**
 * The count where the reader's own question is, so a row does not lose its leading column.
 *
 * Not a disabled button: a control that cannot be operated but looks like one is worse than a
 * number, and there is nothing here for assistive technology to announce as actionable.
 */
const VoteCount = ({ votes }: { votes: number }) => (
  <div className="flex min-h-11 min-w-11 shrink-0 flex-col items-center justify-center rounded-sm border border-transparent px-2 py-1 text-text-muted">
    <span className="text-xs font-medium tabular-nums">{votes}</span>
    <span className="sr-only">
      {votes} upvote{votes === 1 ? '' : 's'} on your question
    </span>
  </div>
)
