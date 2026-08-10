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

/**
 * T002 (007) — a setting whose **absence is a legitimate, expected state**.
 *
 * Distinct from `optional` on purpose. `optional` substitutes a working default, so its callers
 * can never tell configured from defaulted; these settings have no sensible default — there is no
 * stand-in for a VAPID key or an operator's address — and the code that reads them must branch on
 * whether one was supplied. Returning `undefined` rather than `''` makes that branch a type
 * obligation instead of a truthiness check somebody can forget.
 *
 * Whitespace collapses to `undefined` so an empty value in a `.env` means the same as no line.
 */
const absent = (name: string): string | undefined => {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? undefined : value
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
  /**
   * T065 (006) — **whether this process is running in a deployed environment** (FR-478).
   *
   * ───────────────────────────────────────────────────────────────────────────────────────
   * **Deliberately the INVERSE of "is local development", not a synonym for `isProduction`.**
   *
   * The session cookie's `Secure` attribute was gated on `isProduction`, which is a statement
   * about a name rather than about a deployment. UAT is a real, publicly reachable environment
   * carrying realistically-shaped attendee data over HTTPS, and every environment this project
   * deploys is one of exactly two — so anything that is not the developer's machine or the test
   * suite is deployed, and must send `Secure`.
   *
   * Expressed as `nodeEnv !== 'development' && nodeEnv !== 'test'` rather than as
   * `nodeEnv === 'production'` so that **a new environment name defaults to secure**. A future
   * `staging` would otherwise silently serve a non-`Secure` session cookie, which is precisely
   * the failure mode this framing removes.
   * ───────────────────────────────────────────────────────────────────────────────────────
   */
  readonly isDeployed: boolean
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
    /**
     * T021 (006) — the **card**-sized square, embedded in the directory listing (FR-457, D2).
     *
     * ───────────────────────────────────────────────────────────────────────────────────────
     * A second rendition rather than serving the profile one smaller, because FR-456 delivers
     * every face **inside the listing response** — one request for a page of 24, not 25. At
     * quality 82 a 96px square is roughly 3–5 KB, so twenty-four base64-encoded are on the order
     * of 150 KB; twenty-four 512px renditions would be about a megabyte, on a conference
     * connection, for images rendered at a fraction of that size.
     *
     * Configurable exactly as `dimensionPx` is, and for the same reason: it is a capacity
     * decision rather than a security boundary. The accepted *formats* remain non-configurable
     * — see the note above.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    readonly cardDimensionPx: number
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
    /**
     * T002 (007) — where abuse reports are mailed (FR-547).
     *
     * ───────────────────────────────────────────────────────────────────────────────────────
     * **Optional, and its absence is the expected state.** Spec open question 3 leaves the
     * operator address undecided, and it gates configuration only — never the code path. A
     * report still blocks the reported attendee and still writes its row when this is unset;
     * only the dispatch has nowhere to go, and FR-549 already requires that failure to be
     * isolated from the two effects that matter.
     *
     * Required here would make a clean clone fail to boot over an address nothing local
     * consumes, exactly as `from` above records for the same reason.
     * ───────────────────────────────────────────────────────────────────────────────────────
     */
    readonly operatorAddress: string | undefined
  }
  /**
   * T002 (007) — Web Push delivery (FR-550–FR-559, research R8).
   *
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * **EVERY MEMBER IS OPTIONAL, AND AN UNPROVISIONED PROVIDER IS THE EXPECTED STATE.**
   *
   * This mirrors `mail` deliberately. `apps/api/src/mail/service.ts` records the reasoning in
   * full: no provider is chosen, so the unconfigured case is the normal one and the sink
   * adapter is what a clean clone, the test suite and CI all run. Spec open question 2 blocks
   * the *real* adapter and nothing else.
   *
   * Making these `required()` would invert that — a developer with no VAPID keys could not
   * start the API at all, over a capability FR-552 says every attendee must be able to decline.
   * ═════════════════════════════════════════════════════════════════════════════════════════
   */
  readonly push: {
    /**
     * The VAPID key pair identifying this server to the push service.
     *
     * Both halves or neither: a public key without its private key cannot sign, and a private
     * key without its public half cannot be handed to a subscribing client. `loadConfig`
     * refuses the half-configured case rather than starting and failing at first delivery.
     *
     * **The private key is a secret** and is read here, like every other secret (FR-041).
     */
    readonly vapidPublicKey: string | undefined
    readonly vapidPrivateKey: string | undefined
    /**
     * The `mailto:` or `https:` contact the push service is given for this deployment, per the
     * VAPID specification — it is how a push service reaches an operator whose sender is
     * misbehaving. Defaulted, because it is contact information rather than a credential.
     */
    readonly vapidSubject: string
    /**
     * How long a single delivery attempt is given before it is abandoned (research R8).
     *
     * Delivery failure must never fail the send that triggered it, which FR-318a established
     * for verification mail and R8 carries forward here. A timeout is what makes that true when
     * the push service hangs rather than refuses.
     */
    readonly dispatchTimeoutMs: number
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
    // Not `=== 'production'`: see `isDeployed` on the interface. A new environment name must
    // default to secure rather than to insecure.
    isDeployed: nodeEnv !== 'development' && nodeEnv !== 'test',
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
      // 006 — the card rendition. 96px covers a 48px card avatar at 2× density.
      cardDimensionPx: positiveInt('AVATAR_CARD_DIMENSION_PX', 96),
    },
    mail: {
      from: optional('MAIL_FROM', 'MyNet <no-reply@mynet.invalid>'),
      // 007 — undecided by spec open question 3. Absent is normal; see the interface.
      operatorAddress: absent('MAIL_OPERATOR_ADDRESS'),
    },
    push: {
      // 007 — undecided by spec open question 2. Absent is normal; the sink adapter runs.
      vapidPublicKey: absent('PUSH_VAPID_PUBLIC_KEY'),
      vapidPrivateKey: absent('PUSH_VAPID_PRIVATE_KEY'),
      vapidSubject: optional('PUSH_VAPID_SUBJECT', 'mailto:no-reply@mynet.invalid'),
      // Ten seconds. Long enough for a slow push service, short enough that a hung one cannot
      // hold a message send open — the send has already succeeded by the time this runs.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // **THREE SECONDS, NOT TEN, BECAUSE THIS IS AWAITED INSIDE THE SEND.**
      //
      // `notifyRecipient` is awaited on the message-send path — deliberately, so SC-503's latency
      // is measurable and no error escapes as an unhandled rejection. The cost of that choice is
      // that this timeout is added to the one request an attendee is actually waiting on: at ten
      // seconds, a push service that *hangs* rather than refuses left the sender's composer
      // disabled and their own message unrendered for ten seconds.
      //
      // A push service that has not accepted a 4 KB POST within three seconds will not improve
      // the recipient's experience by being waited on for seven more, and the outcome is already
      // the right one — `'failed'`, which is retried later rather than discarded (FR-557).
      // ═══════════════════════════════════════════════════════════════════════════════════════
      dispatchTimeoutMs: positiveInt('PUSH_DISPATCH_TIMEOUT_MS', 3_000),
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

  /**
   * T002 (007) — **both VAPID halves, or neither.**
   *
   * Half-configured is the one push state that is never intentional, and it fails in the worst
   * possible way: the API starts, the client is handed a public key, the device subscribes
   * successfully, and every delivery then fails at signing time — long after the attendee was
   * told notifications were on. Refusing at boot converts that into a deployment that does not
   * start, which is the failure an operator can actually see.
   *
   * Neither key set remains entirely normal: that is the unprovisioned state, and the sink
   * adapter serves it.
   */
  const { vapidPublicKey, vapidPrivateKey } = cached.push
  if ((vapidPublicKey === undefined) !== (vapidPrivateKey === undefined)) {
    throw new Error(
      'PUSH_VAPID_PUBLIC_KEY and PUSH_VAPID_PRIVATE_KEY must be set together or not at all. ' +
        'Exactly one is set, which starts the API, lets devices subscribe, and then fails every ' +
        'delivery at signing time. Leave both unset to run the sink adapter.',
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
