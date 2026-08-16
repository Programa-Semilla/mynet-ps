import { addressTakenByOtherPrincipal } from '../../admin/identity.js'
import type { Database } from '../client.js'
import { adminAuditEntries } from '../schema/admin-audit.js'
import { operators } from '../schema/operators.js'
import { organizerAssignments } from '../schema/organizer-assignments.js'
import { reportResolutions } from '../schema/report-resolutions.js'
import type { SeedModule } from './index.js'

/**
 * T054 (013) — **platform-operator identities, with NO credential** (FR-990, FR-991, FR-901).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS SEED CREATES ACCOUNTS NOBODY CAN SIGN IN TO, AND THAT IS THE REQUIREMENT.**
 *
 * Every other seeded identity in this product carries a committed password — `SEED_PASSWORD` in
 * `attendees.ts` — because a throwaway attendee on a development database is worth nothing to
 * anybody. A platform operator is not that. **This repository is public**, so a committed
 * administrative password would be a well-known credential for the tier that can read the
 * abuse-report queue, published on the internet, in every environment the seed has ever run
 * against.
 *
 * So `password_hash` is left **null**, which makes sign-in *impossible* rather than *defaulted*:
 * `findAdminCandidate` returns nothing for an operator with no hash, and the refusal is the same
 * one an unknown address produces. There is no well-known password to find and no account to
 * guess into.
 *
 * A credential arrives only through `pnpm admin:bootstrap`, which reads two values from the
 * environment that **no route can reach**. The identity it needs no longer requires a re-seed
 * either: `pnpm admin:seed-operators` (012, FR-1102) runs `ensureOperatorIdentities` below
 * **additively** — `onConflictDoNothing` on the address, nothing cleared, no credential created —
 * so obtaining an operator credential destroys no attendee data. **Until 012 that separation was
 * claimed and did not hold**: this module's insert was reachable only through `seed()`, whose
 * first act clears every attendee, and four files asserted otherwise (FR-1102a).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **A NULL COLUMN RATHER THAN A SENTINEL HASH.**
 *
 * A hash of some agreed placeholder would be a value somebody could compute and submit. `null`
 * cannot be submitted at all: the verification path has nothing to compare against and refuses
 * before it starts. The column is nullable for exactly this state and for no other reason.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * **Scoping**: neither per-event nor cross-event — see `schema/operators.ts`. An operator belongs
 * to the product.
 */

/**
 * The seeded operators. **Two, and the second is not decoration.**
 *
 * One operator would make every test of the tier boundary a test of one row, and would make the
 * deactivation path untestable without leaving the environment with nobody: `POST
 * /admin/operators/:id/deactivation` is deliberately unguarded against removing the last operator
 * (spec Assumptions), so a fixture with one would be a fixture that a single successful test
 * destroys.
 *
 * Addresses use `.invalid`, which is reserved by RFC 2606 and can never be registered — the same
 * choice `mail.from` defaults to. A seeded address that somebody could actually own would be an
 * address a bootstrap could be pointed at by accident.
 */
export const SEED_OPERATORS = [
  { email: 'operator@mynet.invalid', displayName: 'Platform Operator' },
  { email: 'second.operator@mynet.invalid', displayName: 'Second Operator' },
] as const

export const operatorSeed: SeedModule = {
  name: 'operators',

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * **T125 (013) — CLEARS THE WHOLE ORGANIZER-ASSIGNMENT DOMAIN, NOT ONLY WHAT IT SEEDED**
   * (FR-938), and this is 008's `shared_cards` trap arriving exactly as the constitution
   * predicted it would.
   *
   * `organizer_assignments.event_id` is `ON DELETE NO ACTION` deliberately (FR-937): a cascade is
   * not an administrative write, so a re-seed would silently strip every organizer's authority
   * with no audit trace. The consequence is that **a surviving assignment refuses
   * `DELETE FROM events`**, and `eventSeed.clear` then fails with a constraint error naming
   * neither organizer assignments nor the operator who granted them.
   *
   * 008 recorded the identical failure for `shared_cards` and the identical fix: *"the seed
   * clears the whole Network domain, not only what it seeded."* CLAUDE.md carries the prediction
   * — *"the next feature with a non-cascading reference to seeded content will meet this"* — and
   * this is that feature.
   *
   * This module seeds **no** assignments (see `run`), so clearing them is clearing somebody
   * else's rows on purpose. That is what "the whole domain" means, and why the deletion is
   * unconditional rather than scoped to rows this module created.
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   */
  async clear(db: Database): Promise<void> {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **ALL FOUR TABLES THAT REFERENCE `operators`, AND GETTING THIS WRONG IS HOW THE TRAP
    // ACTUALLY BITES.**
    //
    // The first version of this cleared assignments and operators, which is the obvious pair —
    // and the re-seed failed with a constraint error naming `report_resolutions`, a table this
    // module does not seed and never touches. That is the identical shape 008 recorded for
    // `shared_cards`: *"a surviving card refuses `DELETE FROM events` and breaks the re-seed
    // with an error naming neither table."*
    //
    // Four references, and only two of them need a statement here:
    //
    //   `operator_sessions.operator_id`     CASCADE   — goes on its own.
    //   `admin_audit_entries.operator_id`   SET NULL  — survives, correctly, and never blocks.
    //   `organizer_assignments.assigned_by` NO ACTION — **blocks**, so it is cleared.
    //   `report_resolutions.resolved_by`    NO ACTION — **blocks**, so it is cleared.
    //
    // Both `NO ACTION` references are deliberate, and neither may be relaxed to make this
    // simpler: FR-944 requires a resolution to keep naming the operator who made it, which is
    // the whole reason an operator is deactivated rather than deleted (FR-909).
    //
    // `admin_audit_entries` is cleared too — not because it blocks anything, but because
    // leaving it would let one run's accountability record outlive the operators it names, and
    // the next run's assertions would read entries nobody in this database performed.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    await db.delete(adminAuditEntries)
    await db.delete(reportResolutions)
    await db.delete(organizerAssignments)
    await db.delete(operators)
  },

  /**
   * Inserts the identities. **No assignments, and no credentials.**
   *
   * No assignments because promotion is an administrative act performed by a platform operator on
   * a registered attendee (FR-930) — seeding one would fabricate an administrative decision
   * nobody took, and would put an `assigned_by` in the audit-adjacent record naming an operator
   * who never acted. The empty state is also the one an operator sees first, and FR-936's
   * `unassigned` needs it to be reachable at first run.
   */
  async run(db: Database): Promise<void> {
    await ensureOperatorIdentities(db)
  },
}

/**
 * T002–T003 (012) — **the additive half of the operator seed** (FR-1102, SC-1210).
 *
 * Inserts any `SEED_OPERATORS` identity that is absent and touches nothing else: no `clear`, no
 * credential, no attendee row read or written. `operatorSeed.run` calls this on a database the
 * seed has just emptied; `pnpm admin:seed-operators` calls it on a database full of attendee
 * data, which is the whole point — obtaining an operator identity must not require destroying
 * anything (FR-1102).
 *
 * `onConflictDoNothing` on the address is what makes a re-run safe on a database where the
 * identities already exist — including one where an operator has since chosen a credential,
 * whose row this must not touch (FR-993's spirit, one layer down).
 */
export const ensureOperatorIdentities = async (db: Database): Promise<void> => {
  for (const operator of SEED_OPERATORS) {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // **FR-918's other half — the operator-creation side of the one cross-table uniqueness
    // rule in the product.** `attendees.email` and `operators.email` are separate unique
    // indexes and no constraint spans them, so this is the only place the collision can be
    // refused when an operator is the one being created.
    //
    // It **throws** rather than skipping. A silently-absent operator would leave a database
    // that looks seeded and has no platform tier, and the failure would surface much later as
    // "nobody can sign in to the administrative site". FR-915's single-lookup sign-in depends
    // on the rule holding, so breaking it is not a warning.
    //
    // **Check and insert share one transaction**, which is `addressTakenByOtherPrincipal`'s
    // own stated precondition ("called INSIDE the caller's transaction… that is the entirety
    // of what makes it work") — on the bare pool the pair is a read-then-write race against a
    // concurrent attendee sign-up for the same address (deep-review finding). The window is
    // operator-seed-vs-sign-up, so it is narrow; honouring the helper's contract costs one
    // wrapper.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const inserted = await db.transaction(async (tx) => {
      if (await addressTakenByOtherPrincipal(operator.email, 'operator', tx)) {
        throw new Error(
          `The operator seed address ${operator.email} is already registered to an attendee ` +
            '(FR-918). One address identifies at most one principal product-wide — FR-915 ' +
            'resolves administrative sign-in with a single lookup and no branch, which stops ' +
            'being possible the moment an address names both. Change the seed address, or ' +
            'remove the attendee account that holds it.',
        )
      }

      return tx
        .insert(operators)
        .values({
          email: operator.email,
          displayName: operator.displayName,
          // Explicit rather than omitted, so a reader sees the decision rather than a default.
          passwordHash: null,
          // Vacuously true — there is no credential yet. `admin:bootstrap` sets one and leaves
          // this true until the operator replaces it themselves (FR-992).
          credentialIsInitial: true,
        })
        .onConflictDoNothing({ target: operators.email })
        .returning({ id: operators.id, passwordHash: operators.passwordHash })
    })

    // A guard against the one way this seed could quietly become wrong: somebody adding a
    // committed password above. **Narrowed to the rows THIS call inserted** (T003, research R2):
    // the previous table-wide `count(*) WHERE password_hash IS NOT NULL` threw on any database
    // where an operator had already chosen a credential — which is every database the additive
    // command exists to serve. `returning` yields only rows the insert actually created (a
    // conflict-skipped row comes back empty), so an existing operator's chosen credential is
    // invisible here and a committed password in the values above still fails loudly.
    if (inserted.some((row) => row.passwordHash !== null)) {
      throw new Error(
        'The operator seed created a usable administrative credential. This repository is ' +
          'public, so a committed administrative password is a published credential for the ' +
          'tier that reads the abuse-report queue (FR-990). Use `pnpm admin:bootstrap`.',
      )
    }
  }
}
