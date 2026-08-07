import { ActiveEventFailure, NoConferencesNotice, useActiveEvent } from '../active-event.js'
import { HomeShell } from '../home/HomeShell.js'
import { HOME_CARDS } from '../home/registry.js'

/**
 * T016 (002) — Home is the shell over the card registry, and nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **This file used to *be* the dashboard.** It is now deliberately almost empty, and that is
 * the design: Home is composed rather than aggregated (constitution, "Data scoping, content
 * provenance, and composition"), so the content lives in independent cards that each own their
 * loading, empty and failure states.
 *
 * A feature contributing to Home adds a card and registers it. It does not come back here.
 * If this file starts growing again, the composition contract has been abandoned.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 *
 * The registered-events list this file used to render is not deleted — it becomes the
 * `YourConferences` card (T075), which is also the genuine attendee-scoped consumer that keeps
 * the other half of the card contract honest.
 */
export const Home = () => {
  const activeEvent = useActiveEvent()

  return (
    <HomeShell
      cards={HOME_CARDS}
      activeEvent={activeEvent}
      banner={
        <>
          {activeEvent.status === 'none' && <NoConferencesNotice />}
          {activeEvent.status === 'failed' && (
            <ActiveEventFailure message={activeEvent.message} onRetry={activeEvent.retry} />
          )}
        </>
      }
    />
  )
}
