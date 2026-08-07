import type { Session } from '@mynet/data'

/**
 * T040 (005) — the panel's Speaker section (FR-200, FR-201, FR-206).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **A SESSION WITH NO SPEAKER SAYS SO, IN WORDING DISTINCT FROM A FAILURE** (FR-201).
 *
 * This is the requirement the shape of the data was chosen to make possible. `speakers` is an
 * array that is empty when there are none — never null, never absent — so "this session has no
 * listed speaker" and "the speakers did not load" cannot collapse into the same falsy check
 * and be rendered as each other. The server guarantees it (FR-138) and this is the surface
 * that spends the guarantee.
 *
 * The two states are worded to be unmistakable: *"No speaker is listed for this session"* is a
 * fact about the programme. A failure would say something went wrong on our side. An attendee
 * must never read the first and believe the second.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **Its own section, which is a structural requirement rather than tidiness** (FR-206).
 *
 * Feature 009 adds audience questions to this panel as a **third** section. It must be able to
 * do that without editing Overview or this file — so the panel composes sections, a section
 * renders itself, and no section knows how many siblings it has or which of them exist.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const PanelSpeakers = ({ speakers }: { speakers: Session['speakers'] }) => (
  <section aria-labelledby="session-panel-speakers" className="mb-6">
    <h3
      id="session-panel-speakers"
      className="mb-2 font-display text-sm font-medium text-text-primary"
    >
      Speakers
    </h3>

    {speakers.length === 0 ? (
      <p className="text-sm text-text-muted">No speaker is listed for this session.</p>
    ) : (
      <ul className="grid gap-2">
        {speakers.map((speaker) => (
          <li key={speaker.id}>
            <p className="text-sm font-medium text-text-primary">{speaker.name}</p>
            {/*
              Title and company are each optional and are rendered only when present — no
              placeholder dash, and no empty line where one is missing. A speaker with neither
              is one line, which is a complete rendering rather than a truncated one.
            */}
            {(speaker.title ?? speaker.company) && (
              <p className="text-sm text-text-muted">
                {[speaker.title, speaker.company].filter(Boolean).join(' · ')}
              </p>
            )}
          </li>
        ))}
      </ul>
    )}
  </section>
)
