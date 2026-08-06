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
  }
}

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
    },
  }

  return cached
}

/** Test seam: clears the memoised config so a test can vary the environment. */
export const resetConfigForTests = (): void => {
  cached = undefined
}
