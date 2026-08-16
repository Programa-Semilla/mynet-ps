import { closeDb, getDb } from '../client.js'
import { ensureOperatorIdentities, SEED_OPERATORS } from './operators.js'

/**
 * T004 (012) — `pnpm admin:seed-operators`: **operator identities without destroying anything**
 * (FR-1100, FR-1101, FR-1102, SC-1210).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS COMMAND EXISTS BECAUSE THE ONLY OTHER ROUTE TO AN OPERATOR ROW WAS `pnpm db:seed`,
 * WHOSE FIRST ACT DELETES EVERY ATTENDEE.**
 *
 * 013 shipped the claim — in four files — that because `admin:bootstrap` is separate from the
 * seed, obtaining a credential does not require re-seeding. That was false: `bootstrap` only
 * hands a credential to an identity that already exists, and the identity's only route into the
 * database was `seed()`, which begins with `attendeeSeed.clear`. On a deployed environment the
 * cost of "get an operator credential" was therefore "destroy every account" (FR-1102a).
 *
 * This command is the missing additive half: it inserts the committed `SEED_OPERATORS` if
 * absent, clears nothing, creates no credential, and is safe to re-run — including against a
 * database where an operator has already chosen their own password, whose row it does not touch.
 * `pnpm admin:bootstrap` remains the only way a credential comes into existence.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * **`assertSeedableTarget` is deliberately NOT called** (FR-1102). That guard exists because
 * `seed()` destroys attendee data and a destroyed UAT is unrecoverable without a restore; an
 * additive insert of two committed identities destroys nothing, so there is nothing for the
 * guard to protect and demanding `SEED_TARGET_DATABASE` here would teach operators to reflexively
 * name deployed databases — eroding the one place the ritual must stay meaningful.
 */
const main = async (): Promise<void> => {
  try {
    await ensureOperatorIdentities(getDb())
    console.warn(
      `Operator identities present (${SEED_OPERATORS.map((o) => o.email).join(', ')}). ` +
        'Nothing was cleared and no credential was created — sign-in stays impossible until ' +
        '`pnpm admin:bootstrap` issues one (FR-990, FR-991).',
    )
  } catch (error) {
    console.error('admin:seed-operators failed:', error)
    process.exitCode = 1
  } finally {
    await closeDb()
  }
}

// The self-run guard is what makes `ensureOperatorIdentities` importable by the integration
// suite without executing anything, and this file runnable as a command.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
