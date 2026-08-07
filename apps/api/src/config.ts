/**
 * Environment configuration, validated once at startup.
 *
 * Every secret this project holds is read here and nowhere else. FR-041 keeps them out of the
 * client bundle, the repository, and preview deployments; reading them in one place is what
 * makes that auditable rather than a claim.
 *
 * Missing configuration fails at boot, not at the first request that needs it. A server that
 * starts without `AUTH_PASSWORD_PEPPER` and then fails every sign-in is strictly worse than
 * one that refuses to start.
 *
 * Importing `./env.js` first populates `process.env` from a local `.env` when one exists,
 * without overwriting anything the environment already set. Every entry point reaches
 * configuration through this module, so that is the one place the loading has to happen.
 */
import './env.js'

const required = (name: string): string => {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    )
  }
  return value
}

const optional = (name: string, fallback: string): string => {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? fallback : value
}

const positiveInt = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive integer, received "${raw}".`)
  }
  return parsed
}

const nonNegativeInt = (name: string, fallback: number): number => {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(
      `Environment variable ${name} must be a non-negative integer, received "${raw}".`,
    )
  }
  return parsed
}

export interface AppConfig {
  readonly nodeEnv: 'development' | 'test' | 'production'
  readonly isProduction: boolean
  readonly host: string
  readonly port: number
  readonly webOrigin: string
  readonly databaseUrl: string
  /**
   * How many reverse proxies sit in front of this service (FR-031a).
   *
   * Used as Fastify's `trustProxy` hop count so that `request.ip` is the address the outermost
   * *trusted* proxy observed, rather than whatever the client wrote in `X-Forwarded-For`. One
   * matches a single Fly.io edge. Zero means no proxy — use the socket address.
   */
  readonly trustedProxyHops: number
  readonly auth: {
    readonly passwordPepper: string
    readonly attemptHashKey: string
    /** Sliding idle window in milliseconds (FR-028a, research.md D17 — 14 days). */
    readonly sessionIdleMs: number
    /**
     * The longest a failed sign-in is held open while its escalating delay is served
     * (FR-031a). Anything beyond becomes retry-after guidance.
     *
     * Configurable so the integration suite can shrink it. Without that the suite would spend
     * minutes asleep proving properties that do not depend on the wall-clock magnitude.
     */
    readonly maxServedDelayMs: number
    /**
     * T002 (004) — how long a verification link stays usable (FR-320).
     *
     * 24 hours, per the specification's Assumptions: a verification link is followed at
     * leisure, unlike a reset link, which is a live credential. Open Question 7 records that
     * both lifetimes are assumptions rather than decisions, which is exactly why they are
     * configuration and not constants.
     */
    readonly verificationLifetimeMs: number
    /**
     * T002 (004) — how long a password-reset link stays usable (FR-328).
     *
     * One hour. **Deliberately much shorter than verification**: possession of this link is
     * possession of the account, so its window is the smallest that still lets a person read
     * their mail and act on it.
     */
    readonly passwordResetLifetimeMs: number

    /**
     * 004 review — the fixed cost of the reset-request branch, in milliseconds (FR-327).
     *
     * Makes the response take the same time whether or not the address has an account, so the
     * identical status and body are not undone by a measurable difference in latency.
     * Production refuses to start below a floor; see `loadConfig`.
     */
    readonly resetRequestBranchBudgetMs: number
  }
  /**
   * T002 (004) — avatar bounds (FR-347, FR-348, research D8).
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * **The accepted formats are deliberately NOT configuration.** They are a security boundary,
   * not a preference: the upload is decoded and re-encoded server-side, so the accepted set is
   * exactly what this service is prepared to decode *and* re-emit with no metadata carried
   * across. An operator raising it by environment variable would widen an attack surface by
   * editing a deployment, without anyone reviewing what the new format's decoder does. The size
   * and dimension bounds are configuration because they are capacity decisions.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  readonly avatar: {
    /** Refused **before any bytes are stored** (FR-347). */
    readonly maxUploadBytes: number
    /** The bounded square an accepted image is resized to (FR-348). */
    readonly dimensionPx: number
  }
  readonly mail: {
    /**
     * The envelope sender for transactional account mail (FR-394).
     *
     * Defaulted rather than required, because register entry 18 leaves the provider unchosen
     * and the development adapter writes to a sink instead of sending. A required value here
     * would make a clean clone fail to boot over a setting nothing local consumes.
     */
    readonly from: string
  }
}

/**
 * T002 (004) — what the avatar pipeline will decode and re-encode (FR-347, research D8).
 *
 * `sharp`'s own format names, because the check is "what did the decoder actually find",
 * never the declared `content-type` header or the filename — both are attacker-supplied.
 */
export const AVATAR_ACCEPTED_FORMATS = ['jpeg', 'png', 'webp', 'avif', 'gif'] as const

/**
 * What every accepted upload becomes. One output format, so the stored bytes are uniform and
 * the "no metadata survived" property is a property of one encoder rather than of five.
 */
export const AVATAR_OUTPUT_FORMAT = 'webp' as const
export const AVATAR_OUTPUT_CONTENT_TYPE = 'image/webp' as const

let cached: AppConfig | undefined

export const loadConfig = (): AppConfig => {
  if (cached) return cached

  const nodeEnv = optional('NODE_ENV', 'development')
  if (nodeEnv !== 'development' && nodeEnv !== 'test' && nodeEnv !== 'production') {
    throw new Error(`NODE_ENV must be development, test, or production — received "${nodeEnv}".`)
  }

  cached = {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    host: optional('API_HOST', '0.0.0.0'),
    port: positiveInt('API_PORT', 3000),
    webOrigin: optional('WEB_ORIGIN', 'http://localhost:5173'),
    databaseUrl: required('DATABASE_URL'),
    // Defaults to 1 — the deployed topology. A local run has no proxy, but trusting one hop
    // that does not exist is harmless there, whereas defaulting to 0 and forgetting to set it
    // in production would throttle every attendee as a single source.
    trustedProxyHops: nonNegativeInt('TRUSTED_PROXY_HOPS', 1),
    auth: {
      passwordPepper: required('AUTH_PASSWORD_PEPPER'),
      attemptHashKey: required('AUTH_ATTEMPT_HASH_KEY'),
      sessionIdleMs: positiveInt('AUTH_SESSION_IDLE_DAYS', 14) * 24 * 60 * 60 * 1000,
      maxServedDelayMs: nonNegativeInt('AUTH_MAX_SERVED_DELAY_MS', 5_000),
      // 004 — FR-320 and FR-328. Declared in hours and minutes respectively because that is
      // how the specification states them, and converting here keeps every consumer in
      // milliseconds like the rest of this object.
      verificationLifetimeMs: positiveInt('AUTH_VERIFICATION_LIFETIME_HOURS', 24) * 60 * 60 * 1000,
      passwordResetLifetimeMs: positiveInt('AUTH_RESET_LIFETIME_MINUTES', 60) * 60 * 1000,
      /**
       * 004 review — the fixed cost of the reset-request branch (FR-327), in milliseconds.
       *
       * ───────────────────────────────────────────────────────────────────────────────────
       * **Configurable, but with a floor that production cannot go below.**
       *
       * The pad exists because an identical status and body are not an identical response if
       * one branch is measurably faster — issuing a token and sending mail costs hundreds of
       * milliseconds that a lookup miss does not, which is an account-existence oracle.
       *
       * It is settable only so the test suite need not pay it several hundred times over; a
       * timing oracle is not a property tests are exercising. Lowering it where it matters is
       * refused outright below rather than warned about, because a silently-lowered pad looks
       * exactly like a working one.
       * ───────────────────────────────────────────────────────────────────────────────────
       */
      resetRequestBranchBudgetMs: nonNegativeInt('AUTH_RESET_BRANCH_BUDGET_MS', 600),
    },
    avatar: {
      // 5 MiB. Large enough for a phone photograph straight off the camera roll, small enough
      // that refusing one costs nothing — and the refusal happens before any byte is stored.
      maxUploadBytes: positiveInt('AVATAR_MAX_UPLOAD_BYTES', 5 * 1024 * 1024),
      // A single bounded size, not a set of resolutions (Assumptions). 512px covers a
      // retina-density avatar at every place a profile renders today.
      dimensionPx: positiveInt('AVATAR_DIMENSION_PX', 512),
    },
    mail: {
      from: optional('MAIL_FROM', 'MyNet <no-reply@mynet.invalid>'),
    },
  }

  // The one setting production may not weaken. Stated as a refusal rather than a clamp so the
  // deployment fails loudly instead of running with a value its operator believes is in effect.
  const budgetMs = cached.auth.resetRequestBranchBudgetMs
  if (cached.isProduction && budgetMs < RESET_BRANCH_BUDGET_FLOOR_MS) {
    throw new Error(
      `AUTH_RESET_BRANCH_BUDGET_MS is ${budgetMs}ms, below the ${RESET_BRANCH_BUDGET_FLOOR_MS}ms ` +
        `floor. Below that, the reset-request branch becomes timeable and reports whether an ` +
        `address has an account (FR-327).`,
    )
  }

  return cached
}

/** The lowest pad that still covers a transaction plus a provider round trip. */
const RESET_BRANCH_BUDGET_FLOOR_MS = 400

/** Test seam: clears the memoised config so a test can vary the environment. */
export const resetConfigForTests = (): void => {
  cached = undefined
}
