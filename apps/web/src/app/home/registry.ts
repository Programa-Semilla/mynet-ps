import { greetingDayContextCard } from './cards/GreetingDayContext.js'
import { nextSavedSessionCard } from './cards/NextSavedSession.js'
import { peopleToMeetCard } from './cards/PeopleToMeet.js'
import { restOfDayCard } from './cards/RestOfDay.js'
import { unreadMessagesCard } from './cards/UnreadMessages.js'
import { upNextCard } from './cards/UpNext.js'
import { yourConferencesCard } from './cards/YourConferences.js'
import type { HomeCard } from './contract.js'

/**
 * T013 (002) — the Home card registry.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS AN APPEND-ONLY REGISTRY, AND IT IS THE ONE SHARED FILE THE NEXT SEVEN FEATURES
 * TOUCH.**
 *
 * That is deliberate and it is the whole design. Home is the first viewport, which Principle
 * III makes a success criterion, and it is also the one surface every feature wants to change.
 * Composition is what keeps it improving continuously without becoming a file that every
 * change contends over.
 *
 * To contribute a card:
 *   1. Write it in `cards/`, as its own file. It owns its loading, empty and failure states.
 *   2. Add one import above and one entry to `HOME_CARDS` below.
 *
 * That is the entire contact surface. **Do not** edit another feature's card, reorder existing
 * entries, or reach into `HomeShell`. If your card needs something the contract does not give
 * it, that is a change to `contract.ts` and a conversation — not a special case here.
 *
 * A merge conflict in this file should be one line against one line. If it is ever more than
 * that, something has gone wrong with the approach rather than with the merge.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Order within a slot is `order` ascending, not array position** (see `contract.ts`), so two
 * features appending concurrently do not silently reorder each other's cards by winning a
 * merge. Array position breaks ties, and only ties.
 *
 * **At most one card may claim the `lead` slot** (FR-157). That is checked by a unit test over
 * this array and by a development-mode assertion, rather than by the type system: expressing it
 * in types over an append-only array of arbitrary length would make the registry hostile to the
 * very append it exists for (research D8, T079).
 */
export const HOME_CARDS: readonly HomeCard[] = [
  // Cards are appended here. 002 contributes the greeting, up-next, rest-of-day and
  // your-conferences cards; features 004 onward add theirs the same way.
  greetingDayContextCard,
  upNextCard,
  restOfDayCard,
  yourConferencesCard,
  // 005 — the attendee's next SAVED session. Appended; nothing above is edited or reordered.
  nextSavedSessionCard,
  // 006 — who is worth meeting at this conference. Appended likewise: **one line**, and nothing
  // above it touched (FR-446).
  peopleToMeetCard,
  // 007 — the unread-message indicator, completing six of the seven elements `requirements.md`
  // names for the dashboard. **One line, and nothing above it touched** (FR-532). It is the first
  // ATTENDEE-scoped card whose scope is load-bearing: conversations are cross-event (FR-507), and
  // the discriminated union is what stops it quietly acquiring a dependency on the active
  // conference.
  unreadMessagesCard,
]

/**
 * T079 (002) — **at most one card may claim the `lead` slot** (FR-157).
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * A development-mode assertion plus a unit test, rather than a type-level guarantee — and the
 * trade is recorded rather than glossed (research D8).
 *
 * Expressing "at most one element of this array has slot: 'lead'" in the type system would mean
 * giving the registry a shape that counts its own contents: a tuple, or a builder that returns
 * a narrowed type per append. Either makes the registry hostile to the one operation it exists
 * for — a later feature adding a single line — which would cost far more than this rule is
 * worth.
 *
 * It fires here as well as in the test because the failure it prevents is a layout that
 * silently resolves the conflict: two `lead` cards would simply both render full-width, look
 * plausible, and be nobody's bug.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
export const assertAtMostOneLead = (cards: readonly HomeCard[]): void => {
  const leads = cards.filter((card) => card.slot === 'lead')
  if (leads.length > 1) {
    throw new Error(
      `Home has ${leads.length} cards claiming the 'lead' slot (${leads
        .map((card) => card.id)
        .join(', ')}), and FR-157 allows at most one. The lead card introduces the screen; two ` +
        'of them is a layout question nobody decided.',
    )
  }
}

if (import.meta.env.DEV) {
  assertAtMostOneLead(HOME_CARDS)
}
