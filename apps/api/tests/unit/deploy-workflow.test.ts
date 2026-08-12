import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * T071, T072 (010) — **the just-in-time SSH admission, asserted statically** (FR-833, FR-835).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE HIGHEST-RISK THING IN THIS FEATURE, AND THE ONE THAT CANNOT BE TESTED BY RUNNING IT.**
 *
 * The deploy job opens port 22 on a public host to one address and closes it again. If the
 * closing half ever stops happening, **the environment is permanently exposed and nothing
 * reports it** — no test fails, no alert fires, the deploy goes green. The failure is silent by
 * construction, which is exactly the kind that needs a guard somewhere other than the thing
 * failing.
 *
 * It also cannot be exercised in CI without the service principal, and the service principal may
 * not be creatable at all — the operator is a guest in the tenant. So the properties are asserted
 * over the workflow's own text, which is available whether or not the job can run.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */

const WORKFLOW = readFileSync(
  fileURLToPath(new URL('../../../../.github/workflows/verify.yml', import.meta.url)),
  'utf8',
)

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **COMMENTS AND PRINTED TEXT ARE STRIPPED BEFORE MATCHING, AND THIS FILE LEARNED IT THE HARD
 * WAY — TWICE, IN ITS FIRST RUN.**
 *
 * Every phrase this guard forbids also appears in the prose explaining why it is forbidden. The
 * job carries a comment saying "never from ssh-keyscan at deploy time" and *prints* an
 * `az network nsg rule delete` command as a remediation hint for whoever reads the failure. Both
 * matched. Both were correct code.
 *
 * 007 and 009 record the same lesson about their absence guards, and the danger is identical: a
 * pattern that fails on a correct implementation gets weakened until it checks nothing. So the
 * text being searched is the *executable* text, and a forbidden command must be at the start of
 * a line rather than anywhere in it.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 */
const executable = (yaml: string): string =>
  yaml
    .split('\n')
    .filter((line) => !/^\s*#/.test(line))
    .filter((line) => !/^\s*echo\s/.test(line))
    .join('\n')

/** The `deploy-uat` job alone. Ends where the next job begins. */
const deployUat = (() => {
  const start = WORKFLOW.indexOf('  deploy-uat:')
  const end = WORKFLOW.indexOf('  deploy-prod:')
  expect(start, 'the deploy-uat job was not found').toBeGreaterThan(-1)
  expect(end, 'the deploy-prod job was not found').toBeGreaterThan(start)
  return WORKFLOW.slice(start, end)
})()

describe('just-in-time SSH admission (FR-833)', () => {
  it('the job was found and is substantial', () => {
    expect(deployUat.length).toBeGreaterThan(1_000)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **THE TEARDOWN MUST BE UNCONDITIONAL, AND `always()` IS WHAT COVERS CANCELLATION.**
   *
   * A merge cancelled mid-deploy is ordinary — it is what happens when somebody spots a mistake
   * and pushes a fix. Without `always()` the rule outlives the run, and port 22 stays open to a
   * hosted runner's address indefinitely.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('withdraws the admission on every exit path', () => {
    const teardown = /withdraw the runner's admission[\s\S]{0,200}?if:\s*always\(\)/.exec(deployUat)

    expect(
      teardown,
      'The teardown step is missing or no longer runs unconditionally. `if: always()` is what ' +
        'covers a CANCELLED run — the case that actually leaks, because a cancelled deploy is ' +
        'what happens when somebody notices a mistake and pushes a fix.',
    ).not.toBeNull()
  })

  /**
   * The assertion that catches a teardown which ran and did not work — a killed runner, an API
   * timeout, an expired token. It must come *before* the admission, or it is checking a rule this
   * run just created.
   */
  it('asserts no stale rule survives, before admitting anything', () => {
    const assertAt = deployUat.indexOf('assert no firewall rule survived')
    const admitAt = deployUat.indexOf('admit this runner to port 22')

    expect(assertAt, 'the stale-rule assertion is gone').toBeGreaterThan(-1)
    expect(
      assertAt,
      'The stale-rule assertion runs AFTER admission, so it inspects a rule this run created ' +
        'and can never catch one a previous run leaked.',
    ).toBeLessThan(admitAt)
  })

  it('refuses rather than tidying up when it finds one', () => {
    const step = deployUat.slice(
      deployUat.indexOf('assert no firewall rule survived'),
      deployUat.indexOf('admit this runner to port 22'),
    )

    expect(
      /exit 1/.test(step),
      'The stale-rule check no longer fails the build. Deleting a leaked rule quietly erases the ' +
        'only evidence that the environment was exposed, and for how long. A red build is how a ' +
        'person finds out.',
    ).toBe(true)

    // At the START of a line: the step deliberately PRINTS this command as a remediation hint
    // for whoever reads the failure, and printing it is the opposite of running it.
    expect(
      /^\s*(mynet::)?az network nsg rule delete/m.test(executable(step)),
      'The stale-rule check deletes the rule it finds. It must not: see above.',
    ).toBe(false)
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **ONE ADDRESS. THIS IS THE REQUIREMENT ITSELF, NOT AN IMPLEMENTATION DETAIL.**
   *
   * FR-833 exists to forbid the obvious alternative — widening the rule to GitHub's published
   * Actions ranges, which is thousands of addresses belonging to anybody who can run a workflow.
   * A `/32` is the difference between "one runner, for one deploy" and "any GitHub user".
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('admits exactly one address', () => {
    const admit = deployUat.slice(
      deployUat.indexOf('admit this runner to port 22'),
      deployUat.indexOf('trust the host key'),
    )

    expect(admit).toMatch(/--source-address-prefixes "\$\{RUNNER_IP\}\/32"/)

    // Anything broader. A range, a wildcard, or a missing restriction entirely.
    expect(
      /source-address-prefixes\s+["']?(\*|0\.0\.0\.0|Internet)/i.test(admit),
      'The admission rule now covers more than one address. FR-833 exists to forbid exactly ' +
        'that — the rejected alternative was GitHub’s published ranges, which belong to ' +
        'anybody who can run a workflow.',
    ).toBe(false)
  })

  it('opens port 22 only', () => {
    expect(deployUat).toMatch(/--destination-port-ranges 22\b/)
  })
})

/**
 * FR-835 — **no secret value reaches deployment output or logs.**
 */
describe('secrets stay out of the logs (FR-835)', () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **GITHUB MASKS A SECRET'S OWN VALUE, NOT A VALUE DERIVED FROM IT.**
   *
   * `AZURE_CREDENTIALS` is a JSON blob and is masked as a whole string. The moment `jq -r
   * .clientSecret` pulls a field out of it, the result is a **new string GitHub has never seen**
   * — unmasked, and one `set -x` or one error message away from the log.
   *
   * `::add-mask::` is what closes that, and it has to happen before the value is used.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('masks the client secret it extracts from the credentials blob', () => {
    const extracts = deployUat.includes('jq -r .clientSecret')

    if (!extracts) return

    expect(
      deployUat.includes('::add-mask::'),
      'The job extracts .clientSecret from AZURE_CREDENTIALS without masking the result. GitHub ' +
        'masks the secret it was given — the JSON blob — and has never seen the field pulled out ' +
        'of it, so the extracted value is not redacted anywhere.',
    ).toBe(true)
  })

  it('never passes a secret as a command-line argument that gets echoed', () => {
    // `set -x` would print every expanded command, secrets included. No step may enable it.
    expect(/^\s*set -x/m.test(deployUat)).toBe(false)
    expect(/set -euxo/.test(deployUat)).toBe(false)
  })

  it('writes the SSH private key to a file rather than an environment echo', () => {
    // `printf` into a 0600 file. An `echo "$KEY"` into the log is the failure this pins.
    const trust = deployUat.slice(
      deployUat.indexOf('trust the host key'),
      deployUat.indexOf('deploy to UAT'),
    )
    expect(trust).toMatch(/chmod 600 ~\/\.ssh\/id_deploy/)
    expect(/echo\s+"?\$\{?DEPLOY_SSH_KEY/.test(trust), 'the key is echoed').toBe(false)
  })

  /**
   * FR-834 — the host identity is verified out-of-band, not accepted on first connection. A
   * deploy that ran `ssh-keyscan` at deploy time would be trust-on-first-use against a host whose
   * address is public, which is no verification at all.
   */
  it('trusts the host from a stored value, never from a keyscan at deploy time', () => {
    expect(deployUat).toMatch(/SSH_KNOWN_HOSTS/)
    expect(deployUat).toMatch(/StrictHostKeyChecking yes/)
    expect(
      /ssh-keyscan/.test(executable(deployUat)),
      'The deploy job runs ssh-keyscan. That accepts whatever answers at the address, which is ' +
        'trust-on-first-use against a public host — FR-834 requires the fingerprint to be ' +
        'verified out-of-band BEFORE first use.',
    ).toBe(false)
  })
})
