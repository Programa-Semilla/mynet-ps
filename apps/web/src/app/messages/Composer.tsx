import { MESSAGE_MAX_LENGTH, OfflineError } from '@mynet/data'
import { Send } from 'lucide-react'
import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'

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

  if (unavailable) return <>{unavailable}</>

  // Trimmed, so whitespace is not a message. The server trims before insert for the same reason,
  // which is what makes the lower bound structural rather than a rule two layers both remember.
  const length = draft.trim().length
  // **Both bounds disable rather than one**, though FR-512 names only the lower one. An
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

      <div className="flex items-end gap-2">
        <textarea
          id={fieldId}
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
          className="focus-ring min-h-11 w-full resize-y rounded-sm border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary"
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
