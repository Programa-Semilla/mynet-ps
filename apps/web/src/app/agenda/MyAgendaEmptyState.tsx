/**
 * T027 (005), T194 (014 tranche 2) — the My-agenda-filter empty state (FR-195, FR-1066a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"Never a blank list and never a spinner that never resolves"** — the requirement's own
 * wording. An empty agenda is a valid answer, so this is *not* announced as a failure, and it
 * is not a hole in the layout either.
 *
 * It says what to do next and offers the way back, because an attendee who filtered to their
 * own agenda before committing to anything has filtered themselves into a screen with nothing
 * on it. The action is what stops that being a dead end.
 *
 * **This is the first thing a reviewer sees.** No commitment is seeded — seeding
 * attendee-authored content would fabricate personal data — so both demo attendees start with
 * an empty agenda. The state most likely to be skipped is deliberately the one on screen at
 * first run (data-model.md).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **T194 — was `SavedEmptyState`, saying "Nothing saved yet", and both names became false**
 * (FR-1066a). The set this filter shows carries two commitments — saves on mandatory sessions
 * and held places in optional ones — so copy asserting it holds only saves is the same
 * falsified claim 016's review found shipping in card copy while every gate stayed green.
 * `commitment-copy.test.tsx` reads this file's prose and would catch the old sentence.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const MyAgendaEmptyState = ({ onShowAll }: { onShowAll: () => void }) => (
  <div className="rounded-md border border-border-subtle bg-surface-raised px-4 py-6">
    <p className="mb-1 font-medium text-text-primary">Nothing on your agenda yet</p>
    <p className="mb-4 text-sm text-text-body">
      Browse the programme and commit to the sessions you intend to attend — save them, or take a
      place in the ones that enrol. They will appear here, in the order you will attend them.
    </p>
    <button
      type="button"
      onClick={onShowAll}
      className="rounded-sm border border-border-strong px-3 py-2 text-sm font-medium text-text-primary"
    >
      Show all sessions
    </button>
  </div>
)
