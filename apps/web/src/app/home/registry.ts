import { greetingDayContextCard } from './cards/GreetingDayContext.js'
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
]
