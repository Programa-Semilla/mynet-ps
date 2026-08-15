import { useEffect, useId, useRef, type ReactNode } from 'react'

/**
 * T111, T112 (004) — the confirmation dialog, in the treatment 005 established (FR-367).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A NATIVE `<dialog>` OPENED WITH `showModal()`.**
 *
 * The platform supplies the focus trap, the inertness of everything behind, and Escape — three
 * things the prototype implemented none of, and which the register lists as *settled
 * requirements the prototype failed to meet* rather than as open questions. 005 established
 * this for the session panel; deletion is the surface where getting it wrong matters most, so
 * it inherits rather than reinvents.
 *
 * **Focus restoration is explicit, and the ORDER is the part that is easy to get wrong.**
 * Restoring focus before closing the dialog silently does nothing: while a dialog is modal
 * everything behind it is *inert*, and an inert element cannot take focus. The call succeeds,
 * focus stays on the body, and a keyboard reader is returned to the top of the page. So: leave
 * the top layer first, then restore focus to an element that is once again focusable.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Full-width at mobile widths** (Mobile layout declaration), with a clear close control and a
 * touch-sized confirm.
 */
export const ConfirmDialog = ({
  title,
  confirmLabel,
  confirming,
  destructive = false,
  confirmDisabled = false,
  children,
  onConfirm,
  onDismiss,
  returnFocusTo,
}: {
  title: string
  confirmLabel: string
  confirming: boolean
  /** Styles the confirmation as irreversible. Colour is never the only signal — the wording is. */
  destructive?: boolean
  /**
   * 007 — disables the confirmation because the dialog's own input is not yet valid.
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Distinct from `confirming`, which means "in flight".** The report dialog needs a reason
   * before it can be submitted (FR-546), and `requirements.md` specifies the treatment: a
   * **disabled** confirmation, never an error shown after submission. Without this prop that
   * dialog would have to reimplement the modal mechanics to add one attribute — and a second
   * `<dialog>` is a second place for the focus-restoration ordering above to be got wrong,
   * which is the failure this component exists to make impossible.
   *
   * Optional and defaulting to `false`, so every existing caller is unchanged.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  confirmDisabled?: boolean
  children: ReactNode
  onConfirm: () => void
  onDismiss: () => void
  /** The control that opened this, so focus can be returned to it (FR-202's treatment). */
  returnFocusTo: React.RefObject<HTMLElement | null>
}) => {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  /**
   * The single dismiss path. Both the close control and Escape arrive here, so the two cannot
   * behave differently — which is exactly what happened in the prototype, where Escape did
   * nothing at all.
   *
   * Not memoised: it closes over a ref *prop*, which the compiler cannot prove stable, and it
   * is referenced only by two handlers on this component's own output. A `useCallback` here
   * would be a claim the linter is right to refuse.
   */
  const dismiss = () => {
    // Step 1 — leave the top layer, so what is behind stops being inert.
    dialogRef.current?.close()
    // Step 2 — return focus to the control that opened this. `<dialog>` does not do it
    // reliably, which is why it is explicit rather than trusted.
    returnFocusTo.current?.focus()
    onDismiss()
  }

  useEffect(() => {
    // `showModal`, never `show`: only the modal form gives the focus trap and the inertness.
    const dialog = dialogRef.current
    dialog?.showModal()

    /**
     * ─────────────────────────────────────────────────────────────────────────────────────
     * **Unmounting is also a close, and it is the path the confirm case actually takes.**
     *
     * `dismiss` above handles the close control and Escape. It does not run when the *parent*
     * removes this component — which is exactly what both confirm paths do: `Account.tsx` calls
     * `setConfirming(false)` and `WithdrawConference.tsx` calls `setLeaving(null)`, tearing the
     * element out of the DOM while it is still in the top layer. Neither step of the ordered
     * pair above runs, so focus is dropped to `<body>` immediately after a destructive action —
     * the precise outcome the explicit restoration exists to prevent.
     *
     * Same order as `dismiss`, and for the same reason: leave the top layer first, then restore.
     * ─────────────────────────────────────────────────────────────────────────────────────
     */
    /**
     * **The opener is captured now, not read at cleanup — and that is a correctness fix, not
     * only a lint accommodation.**
     *
     * `WithdrawConference` attaches this ref conditionally
     * (`ref={leaving?.id === event.id ? opener : undefined}`), so the render that sets
     * `leaving` to null both unmounts this dialog *and* detaches the ref. Reading
     * `returnFocusTo.current` in the cleanup would therefore find `null` on exactly the path
     * that most needs focus restored — straight after a destructive action.
     */
    const opener = returnFocusTo.current

    return () => {
      dialog?.close()
      // No-op if the opener has since left the DOM — as it has when the conference it belonged
      // to was successfully left. Better than focusing nothing deliberately.
      opener?.focus()
    }
  }, [returnFocusTo])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape reaches the same dismiss path as the control. Prevented so the platform does
        // not close the dialog underneath us before focus has been restored.
        event.preventDefault()
        dismiss()
      }}
      className="w-full max-w-md rounded-lg border border-border-subtle bg-surface-raised p-0 shadow-card backdrop:bg-navy-900/40"
    >
      <div className="p-5 tablet:p-6">
        <h2 id={titleId} className="mb-3 font-display text-lg font-semibold text-text-primary">
          {title}
        </h2>

        <div className="mb-5 text-sm text-text-body">{children}</div>

        <div className="flex flex-col-reverse gap-2 tablet:flex-row tablet:justify-end">
          {/* A visible, labelled close control, at touch size (FR-202's treatment, SC-310). */}
          <button
            type="button"
            onClick={dismiss}
            disabled={confirming}
            className="rounded-sm border border-border-subtle px-4 py-2 text-sm font-medium text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming || confirmDisabled}
            className={`rounded-sm px-4 py-2 text-sm font-medium text-text-inverse disabled:cursor-not-allowed disabled:opacity-50 ${
              destructive ? 'bg-danger-500' : 'bg-accent-strong'
            }`}
          >
            {confirming ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
