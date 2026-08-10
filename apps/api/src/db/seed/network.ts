import { appointments, meetingSlots } from '../schema/appointments.js'
import { sharedCards } from '../schema/cards.js'
import { SEED_EVENTS } from './events.js'
import type { SeedContext, SeedModule } from './index.js'

/**
 * T043 (008) — the meeting-slot grid (FR-623, FR-624, research R3).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **SEEDED CONFERENCE CONTENT, AND THERE IS NO WRITE PATH TO IT AT ANY PRIVILEGE.**
 *
 * The grid is the only thing 008 seeds, and it is deliberately the *impersonal* half of the
 * feature. Cards and appointments are attendee-authored, so seeding them would fabricate
 * personal data attributed to a real identity — the rule 005 set for saved sessions and notes,
 * and 007 tested by seeding one conversation and saying why.
 *
 * The consequence is deliberate and worth stating, because it is what a reviewer sees first:
 * **both seeded accounts begin with an empty Network.** The empty states — "you have not met
 * anybody yet", "no appointments" — are on screen at first run, which is exactly the pair of
 * states most likely to be skipped (FR-617, FR-627).
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Principle III at the seed boundary.** An interface for authoring this grid would be organizer
 * administration, which is out of product scope by construction — and seed data must not become
 * a route around that exclusion. Changing the grid is a reviewed change to this file, exactly as
 * changing a programme is a reviewed change to `catalog.ts`.
 */

/**
 * Uniform 30-minute intervals across each conference day, in **venue-local wall time**.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **A handful per day rather than a full working day, and that is a fixture decision.**
 *
 * FR-625 subtracts the reader's saved sessions from the offered set, and the whole of scenario 3
 * in `quickstart.md` turns on being able to *see* a slot disappear. A grid of sixteen slots makes
 * that change invisible in a scrolling list; six makes it obvious. Six also keeps the no-slots
 * state (FR-627) reachable by hand — an attendee who saves a few sessions and books a meeting can
 * actually exhaust a day, which is the only way that state gets exercised outside a unit test.
 *
 * The windows straddle the seeded programme deliberately: `09:30` and `10:00` overlap the
 * Barcelona keynote and the tokens session, so saving either removes a slot and step 3 of the
 * walkthrough demonstrates itself.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const SLOT_START_TIMES = ['09:30', '10:00', '11:30', '13:30', '15:00', '16:30'] as const

/** Every slot is the same length. FR-623 says a grid; a grid with varying widths is a schedule. */
const SLOT_MINUTES = 30

/**
 * The number of days a seeded conference runs, derived from its own dates rather than declared
 * here — so a change to `seed/events.ts` cannot leave this file seeding slots for a day that no
 * longer exists, or none for a day that has just appeared.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────
 * **`SeedContext` carries `startsOn` and `timezone` but not `endsOn`**, because the catalog — the
 * only earlier consumer — authors sessions as day *offsets* and never needs to know when a
 * conference stops. The slot grid does: it covers every day.
 *
 * So this **reads `SEED_EVENTS` rather than widening the shared context**. Adding a third field
 * to `SeedContext.eventDates` would mean editing both `seed/index.ts`'s type and `seed/events.ts`
 * where it is populated — two neighbours changed so that one appended module can ask a question,
 * when the answer is already exported and immutable. Reading a neighbour's export is not editing
 * it, which is the line the append-only registry draws.
 *
 * `undefined` for an unknown name is impossible in practice — `eventDates` is built from this
 * same list — and is treated as a single-day conference rather than thrown on, because a seed
 * that half-ran is worse than one that produced a conservative grid.
 * ─────────────────────────────────────────────────────────────────────────────────────────
 */
const dayCount = (eventName: string, startsOn: string): number => {
  const endsOn = SEED_EVENTS.find((event) => event.name === eventName)?.endsOn
  if (!endsOn) return 1

  const start = Date.parse(`${startsOn}T00:00:00Z`)
  const end = Date.parse(`${endsOn}T00:00:00Z`)
  return Math.floor((end - start) / 86_400_000) + 1
}

/**
 * A venue-local wall time on day N of the conference, as an absolute instant (FR-624).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE SAME TWO-PASS CORRECTION `seed/catalog.ts` USES, AND IT IS COPIED RATHER THAN SHARED
 * FOR A REASON WORTH STATING.**
 *
 * The conversion is identical and the seed modules are deliberately independent — the registry's
 * whole design is that a feature writes its own file and edits no neighbour's. Importing
 * `catalog.ts`'s private helper would couple the network seed to the catalog seed's internals,
 * so that a change to the programme's authoring format could silently move every meeting slot.
 *
 * **Two correction passes, not one.** The offset that matters is the one in force at the
 * *answer*, not at the guess, and those differ when a DST transition falls between them. A single
 * pass gets `2026-03-29 01:00` in Europe/Madrid an hour wrong. That lesson was paid for in 002 and
 * is inherited here rather than re-learned; if you are editing this, edit `seed/catalog.ts` too.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const instantAt = (
  startsOn: string,
  timezone: string,
  dayOffset: number,
  wallTime: string,
): Date => {
  const day = new Date(`${startsOn}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + dayOffset)
  const date = day.toISOString().slice(0, 10)

  const guess = new Date(`${date}T${wallTime}:00Z`)
  const firstPass = new Date(guess.getTime() - zoneOffsetMs(guess, timezone))
  return new Date(guess.getTime() - zoneOffsetMs(firstPass, timezone))
}

/** How far ahead of UTC the zone is at a given instant, in milliseconds. */
const zoneOffsetMs = (instant: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const at = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00'
  const asUtc = Date.UTC(
    Number(at('year')),
    Number(at('month')) - 1,
    Number(at('day')),
    Number(at('hour')) % 24,
    Number(at('minute')),
    Number(at('second')),
  )

  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

export const networkSeed: SeedModule = {
  name: 'network',

  async clear(db) {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **THIS CLEARS THE WHOLE DOMAIN, NOT ONLY WHAT IT SEEDED — AND IT HAS TO.**
    //
    // `clear` is documented as "delete this module's rows", and the natural reading is *the rows
    // this module inserted*, which is the slot grid alone. That reading breaks the seed, and the
    // failure is worth recording because the next feature with a similar table will meet it.
    //
    // `shared_cards.event_id` is deliberately **ON DELETE NO ACTION** (see `schema/cards.ts`):
    // an exchange happened, and if a conference were ever removed by hand the constraint should
    // stop it and ask a human rather than silently destroying everybody's contacts.
    //
    // The seed *is* that hand. `eventSeed.clear` runs `DELETE FROM events`, and any surviving
    // `shared_cards` row refuses it — so a re-seed of a database where anybody had shared a card
    // failed outright with `Failed query: delete from "events"`, which names neither this table
    // nor a cause. The integration harness re-seeds per file, so this was every card and
    // appointment test at once.
    //
    // Both tables are deleted here, in dependency order, because this module owns the Network
    // domain and reverse registry order puts it before `eventSeed`. `appointments` would in fact
    // cascade from `events`, but deleting it explicitly beside its sibling is what keeps the
    // ordering legible rather than depending on which of two constraints happens to fire first.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    await db.delete(appointments)
    await db.delete(sharedCards)
    await db.delete(meetingSlots)
  },

  async run(db, context: SeedContext) {
    for (const [eventName, dates] of context.eventDates) {
      const eventId = context.eventIds.get(eventName)
      if (!eventId) throw new Error(`Seed: no event "${eventName}" — check seed/events.ts`)

      const days = dayCount(eventName, dates.startsOn)

      // ───────────────────────────────────────────────────────────────────────────────────
      // **Every seeded conference gets the same grid, including the one with no programme.**
      //
      // That is not laziness. The empty conference exists as 002's fixture for "this event has
      // no sessions", and giving it slots keeps the two states independent: an attendee there
      // can still arrange a meeting, which is what proves scheduling does not depend on the
      // catalog. Deriving slots from sessions would have coupled them and quietly made the
      // no-programme conference un-meetable.
      // ───────────────────────────────────────────────────────────────────────────────────
      const rows = []
      for (let day = 0; day < days; day += 1) {
        for (const wallTime of SLOT_START_TIMES) {
          const startsAt = instantAt(dates.startsOn, dates.timezone, day, wallTime)
          rows.push({
            eventId,
            startsAt,
            endsAt: new Date(startsAt.getTime() + SLOT_MINUTES * 60_000),
          })
        }
      }

      await db.insert(meetingSlots).values(rows)
    }
  },
}
