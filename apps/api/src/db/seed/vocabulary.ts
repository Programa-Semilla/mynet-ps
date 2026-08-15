import { interestOptions, sectors, subsectors } from '../schema/vocabulary.js'
import type { SeedModule } from './index.js'

/**
 * T171 (014 tranche 2) — the vocabulary seed (FR-1086, FR-1085a).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **EXACTLY THE CLIENT'S FOUR SECTORS, AND NOTHING ELSE.** REQ-035 names Servicios, Comercio,
 * Industria and Agro verbatim — the one taxonomy list that was never missing (brainstorm #12's
 * finding). The subsector and interest lists ship **EMPTY AND AUTHORABLE**, because the client's
 * lists do not exist yet: what is missing is content for a surface, not a prerequisite for
 * building one, and every surface reading the vocabulary renders an inviting empty state rather
 * than an error (FR-1086). Do not "helpfully" invent placeholder subsectors here — a curated
 * list seeded with guesses is exactly how it stops being curated (FR-1099's reasoning).
 *
 * **Reference data, not attendee data** (FR-1085a): these rows name no attendee, cascade from
 * no attendee and appear in no export, which is why seeding them fabricates nothing about
 * anybody — unlike interests, which are attendee-authored and seeded only on the fixture
 * accounts' own rows in `attendees.ts`.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **`clear` EMPTIES THE WHOLE VOCABULARY DOMAIN, NOT ONLY WHAT `run` INSERTS** — 008's seed
 * lesson (`network.ts`), inherited rather than re-learned. A re-seeded database may carry
 * operator-authored subsectors and interests; leaving them would make the second run's state
 * depend on what happened between runs, and the seed is the dev/test fixture whose whole value
 * is that it always produces the same product. Subsectors go first — they reference sectors,
 * and deleting the parent side first fails on the constraint with an error naming neither
 * table. Idempotent across re-seeds by construction: clear everything, insert the four.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */

/** The four, in the order REQ-035 names them. Creation order is presentation order. */
const SEED_SECTORS = ['Servicios', 'Comercio', 'Industria', 'Agro'] as const

export const vocabularySeed: SeedModule = {
  name: 'vocabulary',

  async clear(db) {
    await db.delete(subsectors)
    await db.delete(sectors)
    await db.delete(interestOptions)
  },

  async run(db) {
    await db.insert(sectors).values(SEED_SECTORS.map((label) => ({ label })))
    // Deliberately nothing else: subsectors and interest options start empty (FR-1086).
  },
}
