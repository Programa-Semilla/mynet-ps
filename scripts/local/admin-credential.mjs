/**
 * The administrative credential for a local run (013).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THE SEED CREATES OPERATORS NOBODY CAN SIGN IN TO, ON PURPOSE, AND THAT IS THE WHOLE PROBLEM
 * THIS SOLVES.**
 *
 * `db/seed/operators.ts` inserts platform operators with `password_hash: null`, because this
 * repository is public and a committed administrative password is a **published** credential for
 * the tier that reads the abuse-report queue (FR-990). So a freshly seeded database has an
 * administrative site that nobody can enter, and `quickstart.md` answers that with a second
 * command and two environment variables somebody has to compose by hand.
 *
 * This generates a fresh random password per run and hands it to the **existing, reviewed**
 * bootstrap rather than reimplementing it — which matters because that command carries FR-993's
 * guard: it updates only `WHERE credential_is_initial = true`, so an operator who has chosen
 * their own password is never reset by a re-run. Every outcome below is that guard being
 * honest about what it did.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE PASSWORD IS GENERATED, NEVER STORED, AND NEVER COMMITTED.**
 *
 * `randomBytes` per run, printed once to the terminal, and written nowhere — not to `.env`, not
 * to `.env.local`, not to the banner's history. If it scrolls away, run `pnpm start
 * --reset-admin` for a new one. Persisting it would recreate in miniature exactly the hazard
 * `bootstrap.ts`'s header describes: a credential sitting in a file forever, restored by every
 * run, held by anybody who ever read that file.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */
import { randomBytes } from 'node:crypto'

/** The seeded platform operator this hands a credential to. Must exist; this never creates one. */
export const LOCAL_OPERATOR_EMAIL = 'operator@mynet.invalid'

/**
 * Readable at a glance and awkward to mistype: no ambiguous characters, grouped in fours.
 *
 * The alphabet omits `0/O` and `1/l/I` because this value's entire job is to survive being read
 * off a terminal and typed into a form.
 */
const generatePassword = () => {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(16)
  const characters = [...bytes].map((byte) => alphabet[byte % alphabet.length])

  return [characters.slice(0, 4), characters.slice(4, 8), characters.slice(8, 12)]
    .map((group) => group.join(''))
    .join('-')
}

/**
 * Puts the operator row back into its just-seeded state so the bootstrap below can set a fresh
 * password. Used by `--reset-admin`, which exists for the case the credential was replaced and
 * whoever replaced it does not remember what they chose.
 *
 * **Clears the hash as well as the flag.** Leaving the old hash in place while flipping the flag
 * would produce a row that accepts a password nobody knows and reports itself as un-bootstrapped
 * — the two halves have to move together or the state is a lie.
 */
export const resetOperatorCredential = async (databaseName, { runSql }) => {
  const output = await runSql(
    databaseName,
    `UPDATE operators
       SET password_hash = NULL, credential_is_initial = TRUE
     WHERE email = '${LOCAL_OPERATOR_EMAIL}'
     RETURNING id`,
  )

  return output.trim().length > 0
}

/**
 * Runs the bootstrap and reports what it did, in the shape the banner needs.
 *
 * `pnpm` is the caller's runner so this module stays free of process concerns.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * **THE OUTCOME IS READ FROM THE COMMAND'S OWN WORDS, AND BOTH STREAMS HAVE TO BE READ.**
 *
 * `bootstrap.ts` reports through `console.warn` — which is **stderr** — for three of its four
 * outcomes, including the success it is normally run for. Matching on `stdout` alone finds
 * nothing and silently classifies every run as the last branch, so the two are concatenated
 * rather than one being picked.
 *
 * The `no-such-operator` branch also sets a non-zero exit code, so it arrives here as a
 * rejection rather than as a result. That is not a failure of this step: an unseeded database is
 * a state the banner can explain and the developer can fix in one command, so it is caught and
 * turned into an outcome instead of taking `pnpm start` down with it.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 */
export const ensureAdminCredential = async ({ pnpm, env }) => {
  const password = generatePassword()

  let output
  try {
    const result = await pnpm(['admin:bootstrap'], {
      ...env,
      ADMIN_BOOTSTRAP_EMAIL: LOCAL_OPERATOR_EMAIL,
      ADMIN_BOOTSTRAP_PASSWORD: password,
    })
    output = `${result.stdout}${result.stderr}`
  } catch (error) {
    output = `${error.stdout ?? ''}${error.stderr ?? ''}`

    // Anything that is not the known recoverable outcome is a real failure and must not be
    // reported as a tidy banner line.
    if (!output.includes('No seeded operator')) throw error
  }

  if (output.includes('Initial credential set')) {
    return { status: 'issued', email: LOCAL_OPERATOR_EMAIL, password }
  }

  // FR-993 declined to overwrite a password the operator chose. Correct, and the banner has to
  // say so rather than print a password that will not work.
  if (output.includes('already replaced')) {
    return { status: 'kept', email: LOCAL_OPERATOR_EMAIL }
  }

  // No operator row — an unseeded database. Recoverable, and the banner names the fix.
  return { status: 'no-operator', email: LOCAL_OPERATOR_EMAIL }
}
