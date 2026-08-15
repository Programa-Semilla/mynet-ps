import { MESSAGE_MAX_LENGTH, OfflineError } from '@mynet/data'
import { Send } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

/**
 * T044 (007) — where a message is written (FR-511, FR-512, FR-517, FR-565, FR-584).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SEND IS DISABLED WHILE THERE IS NOTHING TO SEND. IT IS NEVER AN ERROR AFTER THE FACT.**
 *
 * `requirements.md` lists "invalid empty message" among the required states and specifies the
 * treatment: a **disabled confirmation**, never a post-submit error. An attendee who presses send
 * on an empty composer and is told off has been handed a failure they could have been prevented
 * from reaching.
 *
 * The server refuses an empty or whitespace-only body too, and the column's `CHECK` refuses it
 * again — because client-side presentation of a limit is never the enforcement of it. This
 * component is the half an integration test cannot see.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **T008 (016) — IT GROWS TO A BOUND AND THEN STOPS, AND THE SEND CONTROL NEVER MOVES OUT OF
 * REACH** (FR-1001–FR-1005).
 *
 * This composer shipped with `resize-y`, no maximum, and no growth at all — a combination that
 * made a long message **unsendable on a phone**, which is the product's primary context. The
 * owner found it by using the product, and it is the most severe of the six items in 016 because
 * it removes a capability rather than degrading one.
 *
 * Three changes, and each closes a different half of it: the field now grows with its content,
 * that growth is capped at a **proportion of the visible viewport** (`COMPOSER_MAX_HEIGHT`), and
 * direct manipulation is gone so no drag can overrule the cap.
 *
 * **The reachability guarantee is structural, not arithmetic.** See the note on the flex row
 * below: the send control is a sibling of the bounded field, so no composer height can displace
 * it. That is why FR-1003 survives somebody changing the proportion.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **The message stays in the composer when a send fails, and is never queued** (FR-565).
 *
 * There is no write queue anywhere in this product and this is not the place to invent one. A
 * message the attendee believes was sent, delivered at an unpredictable later moment into a
 * conversation that may since have been blocked or closed, is worse than a refusal they can act
 * on. So a failure leaves the text exactly where it was, says what happened, and waits.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */

/** How close to the limit the counter appears. Earlier is noise on every message ever written. */
const COUNTER_THRESHOLD = Math.floor(MESSAGE_MAX_LENGTH * 0.9)

/**
 * T008/T009 (016) — **the composer's ceiling, as a proportion of the visible viewport**
 * (FR-1001, FR-1002).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE *KIND* OF RULE IS CONSTITUTIONAL; THE NUMBER IS A PLANNING DECISION.**
 *
 * FR-1002 fixes that the bound is a **proportion** and forbids a fixed height or a line count.
 * Both alternatives were considered and rejected in the specification's clarification round, and
 * the reason is one configuration: a short viewport with a tall on-screen keyboard. Six lines is
 * comfortable on a 6.7" phone and is the original defect returning under a different name on a
 * 4.7" one, because a line count does not know how much room is left.
 *
 * **30% is chosen against the narrowest supported viewport with a keyboard raised.** At 390×844
 * a keyboard takes roughly 45% of the height, leaving ~55dvh visible. A composer capped at 30dvh
 * is then a little over half of what remains, which keeps acceptance scenario 4's promise — the
 * thread above stays *partially visible* rather than being fully displaced — while still fitting
 * about ten lines of what is being written.
 *
 * **`dvh` rather than `vh`, and that is not interchangeable.** `vh` is the viewport with browser
 * chrome *retracted*, so on mobile Safari a `vh` bound is measured against a viewport taller than
 * the one the attendee is looking at — which would make the composer larger than its share
 * exactly when room is scarcest.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **This is what makes FR-1003 structural rather than a value somebody must keep true.** The send
 * control is a *sibling* of the bounded field, never inside it, so growth moves the field's own
 * bottom edge and nothing else. A composer that can never exceed 30% of the visible viewport
 * cannot displace a control that sits outside it, however the viewport shrinks — so the guarantee
 * survives a future change to this number, which a hand-tuned height would not.
 */
const COMPOSER_MAX_HEIGHT = 'max-h-[30dvh]'

export interface ComposerProps {
  /**
   * Resolves when the server has accepted the message. **Rejecting is a supported outcome** —
   * the composer keeps its text and explains, rather than clearing optimistically.
   */
  readonly onSend: (body: string) => Promise<void>
  /**
   * Rendered instead of the composer. Used for the three states in which sending is not
   * available: the counterpart has deleted their account (FR-574), this attendee blocks them
   * (FR-539), and there is no connection (FR-565).
   *
   * A prop rather than a `disabled` flag, because every one of those states owes the attendee an
   * explanation and an action — a greyed-out box with no words is the failure FR-539 names.
   */
  readonly unavailable?: ReactNode
}

export const Composer = ({ onSend, unavailable }: ComposerProps) => {
  const fieldId = useId()
  const counterId = useId()

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const fieldRef = useRef<HTMLTextAreaElement>(null)

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Growth is measured here; the ceiling is enforced in CSS** (FR-1001, FR-1004).
   *
   * A textarea does not grow with its content on its own — it scrolls — so FR-1001's "grows to
   * fit" has to be driven from the content's measured height. `max-height` then clamps it, which
   * is what keeps the *bound* declarative: this effect never compares against a number, so it
   * cannot disagree with `COMPOSER_MAX_HEIGHT`, and changing the proportion needs no change here.
   * Past the clamp the field's own `overflow-y-auto` takes over, which is FR-1004.
   *
   * **Reset to `auto` before measuring, or the composer can only ever get taller.** `scrollHeight`
   * includes the height already set, so measuring without clearing it first reports the current
   * height whenever content shrinks — deleting a long message would leave the box tall and empty.
   *
   * `field-sizing: content` expresses this in CSS alone and is deliberately not used: Safari does
   * not support it, and an iPhone is the viewport this whole story is about.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  useEffect(() => {
    const field = fieldRef.current
    if (!field) return

    field.style.height = 'auto'
    // jsdom lays nothing out and reports 0, which would collapse the field to nothing in the
    // component tests. A real browser never reports 0 for a rendered textarea.
    if (field.scrollHeight > 0) field.style.height = `${field.scrollHeight}px`
  }, [draft])

  if (unavailable) return <>{unavailable}</>

  // Trimmed, so whitespace is not a message. The server trims before insert for the same reason,
  // which is what makes the lower bound structural rather than a rule two layers both remember.
  const length = draft.trim().length
  // **Both bounds disable rather than one**, though FR-512 names only the lower one (FR-1006
  // restates it for 016, unchanged — this feature altered how the composer GROWS, never what it
  // accepts). An
  // over-length message refused after submission is the same defect the empty one would be, and
  // the counter below has already told the attendee why the control is off.
  const sendable = length > 0 && length <= MESSAGE_MAX_LENGTH && !sending

  const remaining = MESSAGE_MAX_LENGTH - length
  const showCounter = length >= COUNTER_THRESHOLD

  const send = async (): Promise<void> => {
    const body = draft.trim()
    if (body.length === 0 || sending) return

    setSending(true)
    setFailure(null)

    try {
      await onSend(body)
      // Cleared **only from a resolved write**, which is what keeps this non-optimistic — the
      // same property 005 recorded for note autosave. Clearing on the keystroke would incur the
      // optimistic-update decision the constitution requires be recorded separately.
      setDraft('')
    } catch (error: unknown) {
      setFailure(
        error instanceof OfflineError
          ? 'You are offline, so this could not be sent. It has not been saved or queued — it is still here, and you can send it when you are back.'
          : 'That message could not be sent. It is still here, so you can try again.',
      )
    } finally {
      setSending(false)
    }
  }

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault()
    void send()
  }

  /**
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Enter sends, Shift+Enter writes a new line** (FR-584).
   *
   * Overriding a textarea's Enter is a real choice and it is made deliberately: FR-584 requires
   * the thread to be operable by keyboard alone *including sending*, and the alternative —
   * tabbing from the field to the button on every message — makes the most frequent action in
   * the destination the slowest one.
   *
   * It goes through the same `send` the button does, so the disabled state cannot be bypassed by
   * pressing Enter on an empty composer. A keyboard path around a disabled control would defeat
   * FR-512 while leaving every click-driven test green.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void send()
  }

  return (
    <form onSubmit={onSubmit} className="border-t border-border-subtle bg-surface-raised p-3">
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-text-primary">
        Message
      </label>

      {/*
        ─────────────────────────────────────────────────────────────────────────────────────
        **The send control is a SIBLING of the bounded field, and that is the whole of FR-1003.**

        `COMPOSER_MAX_HEIGHT` is on the textarea alone, so growth moves that element's bottom
        edge and nothing else; the button is laid out beside it and cannot be pushed anywhere by
        it. Putting the control *inside* the bounded region — or making the bound a property of
        this row — would make reachability depend on the number staying correct, which is the
        arrangement FR-1002 exists to avoid.

        `items-end` keeps the control on the baseline of a grown field rather than centred
        against it, and `shrink-0` on the button stops a long first line squeezing it to nothing
        at 320px, which is the horizontal-overflow failure FR-586 forbids.
        ─────────────────────────────────────────────────────────────────────────────────────
      */}
      <div className="flex items-end gap-2">
        <textarea
          id={fieldId}
          ref={fieldRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          // Bounded generously rather than at the limit: the limit applies to the trimmed body,
          // and a hard `maxLength` would silently swallow keystrokes instead of showing the
          // counter FR-517 asks for.
          maxLength={MESSAGE_MAX_LENGTH * 2}
          placeholder="Write a message"
          aria-describedby={showCounter ? counterId : undefined}
          className={[
            'focus-ring min-h-11 w-full rounded-sm border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary',
            // ═══════════════════════════════════════════════════════════════════════════════
            // **`resize-none`, and its absence was half the defect** (FR-1005).
            //
            // This was `resize-y`. A reader-chosen height can violate FR-1003 no matter what
            // the bound says — dragging the handle past the ceiling put the send control off
            // screen with every other rule still satisfied. A bound that a drag can overrule is
            // not a bound, so direct manipulation goes rather than being clamped.
            // ═══════════════════════════════════════════════════════════════════════════════
            'resize-none',
            // The ceiling (FR-1001) and what happens at it (FR-1004): content scrolls inside
            // the composer rather than the composer continuing to grow.
            COMPOSER_MAX_HEIGHT,
            'overflow-y-auto',
          ].join(' ')}
        />

        <button
          type="submit"
          disabled={!sendable}
          aria-label="Send message"
          className="focus-ring flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-strong text-text-inverse disabled:opacity-50"
        >
          <Send aria-hidden="true" className="size-5" />
        </button>
      </div>

      {/*
        FR-517 — the attendee can see they are approaching the limit, before they reach it.
        `aria-live="polite"` so a screen-reader user learns the same thing a sighted one does,
        without the count being read out on every keystroke of an ordinary message.
      */}
      {showCounter && (
        <p id={counterId} aria-live="polite" className="mt-1 text-xs text-text-muted">
          {remaining >= 0
            ? `${remaining} characters remaining`
            : `${Math.abs(remaining)} characters over the limit`}
        </p>
      )}

      {failure && (
        <p role="alert" className="mt-2 text-sm text-danger-700">
          {failure}
        </p>
      )}
    </form>
  )
}
