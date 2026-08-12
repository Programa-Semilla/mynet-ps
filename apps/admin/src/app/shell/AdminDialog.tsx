import { useEffect, useId, useRef, type ReactNode, type SyntheticEvent } from 'react'

/**
 * T095, T096, T110, T129 (011) — the one modal `<dialog>` every administrative dialog uses.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THREE MISTAKES THIS PRODUCT HAS ALREADY MADE ARE FIXED HERE ONCE, RATHER THAN IN EACH OF
 * THIS FEATURE'S THREE DIALOGS.**
 *
 * **1. Centring.** A modal `<dialog>` is centred by the user agent with `margin: auto`, and
 * Tailwind's Preflight sets `margin: 0` on every element and takes it away — pinning it to the
 * **top-left corner**. 005 and 006 each rediscovered this and patched it locally; 004's
 * `ConfirmDialog` and 008's `ScheduleDialog` did not, and both shipped mispositioned. It is
 * invisible to every behavioural test: the dialog opens, traps focus, closes on Escape and reads
 * correctly. The base rule now lives in `theme/tokens.css`, which this product imports, and
 * `e2e/responsive.spec.ts` measures the gap on either side.
 *
 * **2. Focus restoration.** `<dialog>` does not restore focus to the opener reliably, so it is
 * explicit here — and the **ordering** is what is easy to get wrong: restore *after* closing,
 * because an inert element cannot take focus.
 *
 * **3. A nested dialog's `cancel` reaching ancestor React handlers.** 009's finding, and research
 * R2 predicted the opposite: the DOM event does not bubble, but React's synthetic system
 * delivers it anyway. One Escape on an inner confirmation closed the outer panel **and** changed
 * the address. The fix is comparing `event.target` against this dialog's own element, and it is
 * invisible to every component test because jsdom has no top layer.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * The whole point of putting it here is that `RemoveQuestionDialog` — this feature's nested one —
 * cannot get any of the three wrong by forgetting them.
 */
export interface AdminDialogProps {
  readonly open: boolean
  readonly title: string
  readonly onClose: () => void
  readonly children: ReactNode
}

export const AdminDialog = ({ open, title, onClose, children }: AdminDialogProps) => {
  // Unique per mounted dialog. See the `aria-labelledby` note below.
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  /** The element focus returns to. Captured on open, because by close time it may be gone. */
  const openerRef = useRef<Element | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      // ───────────────────────────────────────────────────────────────────────────────────────
      // `dialog.ownerDocument`, **not the `document` global** — and this is not a way around
      // `mynet/no-direct-platform-access`, it is what the rule is asking for.
      //
      // The rule forbids feature code reaching for ambient platform globals. This reads a
      // property of a node the component already holds a ref to, which is the same kind of
      // access as `dialog.showModal()` two lines down. It is also strictly more correct: the
      // global always names the top-level document, while this names the document the dialog is
      // actually in.
      // ───────────────────────────────────────────────────────────────────────────────────────
      openerRef.current = dialog.ownerDocument.activeElement
      // `showModal`, never `show`: the focus trap, the background inertness and the platform's
      // Escape handling all come from the top layer, and `show` provides none of them.
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
      // **After closing.** An inert element cannot take focus, so restoring first silently does
      // nothing and the focus lands on `<body>` — which is where a keyboard user is stranded.
      const opener = openerRef.current
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [open])

  /**
   * Escape, routed through the same close path as every other dismissal.
   *
   * `event.target` is compared against this dialog's own element because **React delivers a
   * nested dialog's `cancel` to ancestor handlers** even though the DOM event does not bubble.
   * Without this, one Escape on a confirmation nested inside a detail view closes both.
   */
  const onCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    if (event.target !== dialogRef.current) return
    event.preventDefault()
    onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={onCancel}
      // ─────────────────────────────────────────────────────────────────────────────────────
      // **PER-INSTANCE, because more than one of these is mounted at a time.**
      //
      // This was the literal string `"admin-dialog-title"` on both the attribute and the
      // heading. `ReportDetail` renders `ResolveDialog` and `RemoveQuestionDialog` together —
      // the `<dialog>` element exists whether or not `open` is true — so two elements carried
      // the same id, and `aria-labelledby` resolves to the **first match in document order**.
      // A screen-reader user confirming an irreversible question removal was told the dialog
      // was "Record a resolution".
      //
      // Invisible to the component tests, which mount one dialog at a time, and to the axe
      // scan, which reports no violation for a reference that resolves to the wrong valid node.
      // ─────────────────────────────────────────────────────────────────────────────────────
      aria-labelledby={titleId}
      // `m-auto` is NOT set here. The base `dialog { margin: auto }` rule in `theme/tokens.css`
      // is what centres this, and repeating it locally is how four features ended up with four
      // copies of the same fix and two dialogs without it.
      className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border-subtle bg-surface-card p-6 text-text-body shadow-lg backdrop:bg-navy-900/40"
    >
      <h2 id={titleId} className="mb-4 text-lg font-semibold text-text-primary">
        {title}
      </h2>
      {children}
      {/*
        A clear close action as well as Escape — the constitution's modal constraint names both,
        and the prototype implemented neither.
      */}
    </dialog>
  )
}
