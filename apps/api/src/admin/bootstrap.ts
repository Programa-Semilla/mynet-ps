import { and, eq } from 'drizzle-orm'

import { hashPassword } from '../auth/password.js'
import { loadConfig } from '../config.js'
import { closeDb, getDb } from '../db/client.js'
import { normaliseEmail } from '../db/queries/attendees.js'
import { operators } from '../db/schema/operators.js'

/**
 * T056, T058 (013) — **giving a seeded platform operator a usable credential, once**
 * (FR-991, FR-992, FR-993, research R10).
 *
 *     pnpm admin:bootstrap
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS THE ONLY WAY AN ADMINISTRATIVE CREDENTIAL COMES INTO EXISTENCE, AND IT IS
 * DELIBERATELY NOT PART OF `pnpm db:seed`.**
 *
 * The seed creates operator identities with a **null** `password_hash` (FR-990): this repository
 * is public, so a committed administrative password would be a published credential for the tier
 * that reads the abuse-report queue. Sign-in for a seeded operator is therefore *impossible*
 * rather than *defaulted* — there is no well-known password to find.
 *
 * Separating the two commands is the point rather than a convenience — and **until 012 the
 * separation did not deliver what it claimed** (FR-1102a). This command only hands a credential
 * to an identity that already exists, and the identity's only route into the database was
 * `pnpm db:seed`, which **deletes every attendee** before inserting. The additive half now
 * exists: `pnpm admin:seed-operators` inserts the committed identities if absent, clears
 * nothing, and creates no credential — so on a deployed environment the sequence is
 * `admin:seed-operators` then this, and no attendee data is touched (FR-1102).
 *
 * The two values are read from `config.admin`, which reads them from the environment — **no route
 * can reach them**, so there is no request that could set a credential and no path by which the
 * bootstrap password becomes a sign-in parameter.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

export type BootstrapOutcome =
  | { readonly status: 'not-configured' }
  | { readonly status: 'no-such-operator'; readonly email: string }
  | { readonly status: 'already-replaced'; readonly email: string }
  | { readonly status: 'credential-set'; readonly email: string }

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **FR-993 — NEVER RESET AN OPERATOR WHO HAS ALREADY REPLACED THEIR CREDENTIAL.**
 *
 * This is the one requirement here that an obvious implementation gets wrong, which is why T058
 * calls it out and why `admin-bootstrap.test.ts` drives it. The natural way to write a bootstrap
 * is an idempotent upsert — *"set the password to the configured value"* — and that is a
 * **credential reset triggered by an environment variable**.
 *
 * Consider what it would mean in a deployed environment. `ADMIN_BOOTSTRAP_PASSWORD` sits in a
 * `.env` on the VM forever, because nobody removes a variable after using it once. Every deploy
 * that re-ran the bootstrap would silently overwrite the operator's chosen password with the
 * value in that file — and anybody who has ever read that file, or a backup of it, holds a
 * credential that keeps being restored.
 *
 * So the update is guarded by `credential_is_initial = true`, **in the `WHERE` clause** rather
 * than by a prior read. A read-then-write would leave a window; expressing it as a condition on
 * the update means an operator who replaced their password between the read and the write is
 * simply not matched.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
export const bootstrapOperatorCredential = async (): Promise<BootstrapOutcome> => {
  const config = loadConfig()
  const { bootstrapEmail, bootstrapPassword } = config.admin

  // Absent is the **expected, safe state** (FR-991): administrative sign-in is impossible and
  // nothing is broken. `loadConfig` already refuses a half-configured pair at boot, so reaching
  // here with one set and not the other is impossible.
  if (!bootstrapEmail || !bootstrapPassword) return { status: 'not-configured' }

  const email = normaliseEmail(bootstrapEmail)
  const db = getDb()

  const existing = await db
    .select({ id: operators.id, credentialIsInitial: operators.credentialIsInitial })
    .from(operators)
    .where(eq(operators.email, email))
    .limit(1)

  const operator = existing[0]
  // ─────────────────────────────────────────────────────────────────────────────────────────
  // **This does not CREATE an operator, and that is FR-901.**
  // (This comment cited FR-902 — the organizer rule — until 012; the test file inherited it.)
  //
  // Neither tier is reachable by self sign-up (decision 32), and a bootstrap that creates an
  // identity from an environment variable is self sign-up with extra steps: anybody who can set
  // an environment variable on the host could mint themselves a platform operator. A platform
  // operator is **seeded as committed, reviewed data**; this command only hands a credential to
  // an identity that a reviewed change already put there.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  if (!operator) return { status: 'no-such-operator', email }

  const passwordHash = await hashPassword(bootstrapPassword)

  const updated = await db
    .update(operators)
    .set({ passwordHash })
    .where(
      and(
        eq(operators.id, operator.id),
        // FR-993, expressed as a condition rather than as a prior check. See the header.
        eq(operators.credentialIsInitial, true),
      ),
    )
    .returning({ id: operators.id })

  // `credential_is_initial` is deliberately left **true**: the operator must still replace this
  // password themselves before reaching any administrative surface (FR-992), and it is that flag
  // which `requireOperator` reads to enforce it.
  return updated.length > 0
    ? { status: 'credential-set', email }
    : { status: 'already-replaced', email }
}

/**
 * The command. Reports what happened in words, because every outcome is one somebody has to act
 * on differently — and three of the four are not errors.
 */
const main = async (): Promise<void> => {
  try {
    const outcome = await bootstrapOperatorCredential()

    switch (outcome.status) {
      case 'not-configured':
        console.warn(
          'ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD are not set, so no credential was ' +
            'created. Administrative sign-in remains impossible, which is the correct state for ' +
            'any environment where nobody has yet been made responsible for it (FR-991).',
        )
        return

      case 'no-such-operator':
        console.error(
          `No seeded operator has the address ${outcome.email}. This command gives a credential ` +
            'to an identity a reviewed change already created; it does not create one, because ' +
            'neither administrative tier is reachable by self sign-up (FR-901). Run `pnpm ' +
            'admin:seed-operators` — it inserts the committed identities and destroys nothing — ' +
            'or add the operator to `db/seed/operators.ts`.',
        )
        process.exitCode = 1
        return

      case 'already-replaced':
        console.warn(
          `${outcome.email} has already replaced their initial credential, so nothing was ` +
            'changed (FR-993). This command never resets a password an operator chose — a ' +
            'bootstrap that did would be a credential reset triggered by an environment ' +
            'variable that stays on the host forever. Recovery from a lost administrative ' +
            'password is a re-seed; see deploy/vm/README.md.',
        )
        return

      case 'credential-set':
        console.warn(
          `Initial credential set for ${outcome.email}. They must replace it at first sign-in ` +
            'before reaching any administrative surface (FR-992). Remove ' +
            'ADMIN_BOOTSTRAP_PASSWORD from the environment once they have.',
        )
        return
    }
  } finally {
    await closeDb()
  }
}

// The self-run guard is what makes `bootstrapOperatorCredential` importable by the integration
// suite without executing anything, and this file runnable as a command.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  await main()
}
