import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * T027 (010) — **the sink refuses to exist under production, and that refusal sequenced this
 * entire feature** (research R2).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THIS IS NOT DEFENSIVE PADDING. IT IS WHY THE MAIL ADAPTER HAD TO LAND BEFORE THE FIRST
 * DEPLOY RATHER THAN AFTER IT.**
 *
 * `deploy/vm/docker-compose.yml` sets `NODE_ENV: production`. `SinkMailService` holds every
 * verification and reset link it is given in memory and writes each to the log — and **a reset
 * link is the account**: anybody holding one can set the password. So the first deploy of the
 * pre-010 code would have failed at boot, with the sink's own error message.
 *
 * The naive plan was to deploy an empty product and add mail afterwards. That plan does not
 * execute. Research R2 records the discovery, and the task order follows from it: US3's *code*
 * runs before US2's environment, and US3's *acceptance* after.
 *
 * **The failure is good and must not be softened to make a first deploy easier.** The product is
 * refusing to run in a state where it would silently leak credentials, which is exactly what the
 * throw was written for.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Asserted here so that a future change which "helpfully" downgrades the throw to a warning — to
 * get a deploy green — fails a test that explains what it is protecting.
 */
describe('SinkMailService refuses to construct under production (research R2)', () => {
  afterEach(() => {
    vi.resetModules()
    vi.doUnmock('../../src/config.js')
  })

  const loadSink = async (isProduction: boolean) => {
    vi.resetModules()
    vi.doMock('../../src/config.js', () => ({
      loadConfig: () => ({
        isProduction,
        mail: { from: 'MyNet <no-reply@mynet.invalid>', operatorAddress: undefined },
      }),
    }))
    const { SinkMailService } = await import('../../src/mail/sink-adapter.js')
    return SinkMailService
  }

  it('constructs outside production, which is what the test suite and a clean clone run', async () => {
    const SinkMailService = await loadSink(false)
    expect(() => new SinkMailService()).not.toThrow()
  })

  it('THROWS under production, so an unconfigured deployment fails at boot', async () => {
    const SinkMailService = await loadSink(true)

    expect(
      () => new SinkMailService(),
      'The sink no longer refuses to run in production. It writes verification and reset links ' +
        'to the log and holds them in memory, and a reset link IS the account (FR-332, FR-391). ' +
        'Without this throw, a deployment with no MAIL_SMTP_URL starts perfectly and leaks ' +
        'credentials into its log for as long as nobody notices — which is strictly worse than ' +
        'not starting.',
    ).toThrow()
  })

  it('names what is missing rather than failing opaquely', async () => {
    const SinkMailService = await loadSink(true)

    // FR-836's principle applied to a boot failure: the message has to say what to do. An
    // operator meeting this at 2am has a container that will not start and no other clue.
    expect(() => new SinkMailService()).toThrow(/production/i)
  })
})
