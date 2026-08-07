/**
 * T027 (005) — the Saved-filter empty state (FR-195, US1 scenario 4).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **"Never a blank list and never a spinner that never resolves"** — the requirement's own
 * wording. An empty agenda is a valid answer, so this is *not* announced as a failure, and it
 * is not a hole in the layout either.
 *
 * It says what to do next and offers the way back, because an attendee who filtered to Saved
 * before saving anything has filtered themselves into a screen with nothing on it. The action
 * is what stops that being a dead end.
 *
 * **This is the first thing a reviewer sees.** No saved session is seeded — seeding
 * attendee-authored content would fabricate personal data — so both demo attendees start with
 * an empty agenda. The state most likely to be skipped is deliberately the one on screen at
 * first run (data-model.md).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
export const SavedEmptyState = ({ onShowAll }: { onShowAll: () => void }) => (
  <div className="rounded-md border border-border-subtle bg-surface-raised px-4 py-6">
    <p className="mb-1 font-medium text-text-primary">Nothing saved yet</p>
    <p className="mb-4 text-sm text-text-body">
      Browse the programme and save the sessions you intend to attend. They will appear here, in the
      order you will attend them.
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
