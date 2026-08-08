import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * 006 — **the deployment guards, executed** (FR-484, FR-485, and 001's FR-067).
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════
 * **THE TYPESCRIPT SIBLING OF THIS REQUIREMENT HAD TEN TESTS. THE BASH ONE HAD NONE.**
 *
 * `assertSeedableTarget` and `mynet::require_data_separation` carry the same requirement —
 * a non-production environment must never be connected to real attendee data, and the tooling
 * must *refuse* rather than merely be configured correctly. One of them was tested and one was
 * not, and the untested one is the one CI executes against real environments.
 *
 * The cost of that asymmetry was demonstrated rather than theorised: `maintenance.sh on` exited
 * non-zero whenever `--until` was omitted — aborting **every** default deploy immediately after
 * putting the environment behind a 503 — and nothing in the repository had ever run, parsed or
 * linted the file. The `lint` job now ShellChecks every script; this file exercises the one
 * whose logic carries a requirement.
 * ═════════════════════════════════════════════════════════════════════════════════════════
 *
 * Runs the **real, unmodified** `_common.sh` against temporary env-file fixtures, so it verifies
 * production's guard rather than a reimplementation of it.
 */

const VM_DIR = fileURLToPath(new URL('../../../../deploy/vm', import.meta.url))

let work: string

/** A throwaway `deploy/vm` whose `envs/` this test controls. `_common.sh` is copied verbatim. */
const buildFixture = (uat: Record<string, string>, prod: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'mynet-deploy-guard-'))
  mkdirSync(join(dir, 'envs'), { recursive: true })
  copyFileSync(join(VM_DIR, '_common.sh'), join(dir, '_common.sh'))

  const render = (values: Record<string, string>) =>
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n') + '\n'

  writeFileSync(join(dir, 'envs', 'uat.env'), render(uat))
  writeFileSync(join(dir, 'envs', 'prod.env'), render(prod))
  return dir
}

/** Sources the guard and loads an environment. Returns the exit status and stderr. */
const loadEnv = (dir: string, env: string): { status: number; stderr: string } => {
  try {
    execFileSync('bash', ['-c', `source "${join(dir, '_common.sh')}"; mynet::load_env ${env}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, stderr: '' }
  } catch (error) {
    const failure = error as { status?: number; stderr?: string }
    return { status: failure.status ?? 1, stderr: failure.stderr ?? '' }
  }
}

const DISTINCT = {
  uat: {
    SUBSCRIPTION: '',
    RESOURCE_GROUP: 'rg-mynet-uat',
    VM_NAME: 'vm-mynet-uat',
    LOCATION: 'centralus',
    VM_SIZE: 'Standard_B2s',
    ADMIN_USER: 'azureuser',
    APP_DOMAIN: '',
    DATABASE_HOST: 'postgres',
    DATABASE_NAME: 'mynet_uat',
  },
  prod: {
    SUBSCRIPTION: '',
    RESOURCE_GROUP: 'rg-mynet-prod',
    VM_NAME: 'vm-mynet-prod',
    LOCATION: 'centralus',
    VM_SIZE: 'Standard_B2s',
    ADMIN_USER: 'azureuser',
    APP_DOMAIN: '',
    DATABASE_HOST: 'postgres',
    DATABASE_NAME: 'mynet_prod',
  },
}

describe('the deploy scripts parse and lint', () => {
  it('every shell script under deploy/ is syntactically valid', () => {
    // The cheapest possible guard against the class of defect that reached review, and the one
    // the `lint` job now also runs. Kept here too so `pnpm test:unit` catches it locally.
    const scripts = execFileSync('bash', ['-c', `ls ${VM_DIR}/*.sh`], { encoding: 'utf8' })
      .trim()
      .split('\n')

    expect(
      scripts.length,
      'no deploy scripts matched — a gate that checks nothing',
    ).toBeGreaterThan(3)

    for (const script of scripts) {
      expect(() => execFileSync('bash', ['-n', script], { stdio: 'pipe' }), script).not.toThrow()
    }
  })
})

describe('mynet::require_data_separation (FR-485)', () => {
  beforeAll(() => {
    work = buildFixture(DISTINCT.uat, DISTINCT.prod)
  })

  afterAll(() => {
    rmSync(work, { recursive: true, force: true })
  })

  it('allows UAT when its database name differs from production’s', () => {
    expect(loadEnv(work, 'uat').status).toBe(0)
  })

  it('allows production, always — the rule is one-directional', () => {
    // Checking both directions would make production refuse to be itself.
    expect(loadEnv(work, 'prod').status).toBe(0)
  })

  /**
   * The accident the guard exists for: somebody debugging a UAT problem points it at
   * production's database "just to see", and the convention of two separate files does not
   * notice. FR-485 requires a refusal.
   */
  it('REFUSES when UAT names production’s database', () => {
    const dir = buildFixture({ ...DISTINCT.uat, DATABASE_NAME: 'mynet_prod' }, DISTINCT.prod)
    try {
      const result = loadEnv(dir, 'uat')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/production's DATABASE NAME/i)
      // Actionable: the refusal names both values, not just the fact of a collision.
      expect(result.stderr).toContain('mynet_prod')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('REFUSES when UAT is production’s VM, whatever the database is called', () => {
    const dir = buildFixture({ ...DISTINCT.uat, VM_NAME: 'vm-mynet-prod' }, DISTINCT.prod)
    try {
      const result = loadEnv(dir, 'uat')
      expect(result.status).not.toBe(0)
      expect(result.stderr).toMatch(/production's DATABASE HOST on production's VM/i)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════
   * **The identical-host case must NOT refuse, and that is the subtle half.**
   *
   * Both environments legitimately address their database as `postgres` — the compose service
   * name — on their own private network. Those are identical strings naming two different
   * machines. A naive host comparison would refuse every legitimate UAT run on day one, so the
   * guard requires the host *and* the VM to match before it refuses on that branch.
   * ═══════════════════════════════════════════════════════════════════════════════════════
   */
  it('does NOT refuse merely because both address their database as "postgres"', () => {
    expect(DISTINCT.uat.DATABASE_HOST).toBe(DISTINCT.prod.DATABASE_HOST)
    expect(loadEnv(work, 'uat').status).toBe(0)
  })

  it('refuses an environment name that is neither uat nor prod', () => {
    const result = loadEnv(work, 'staging')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toMatch(/must be 'uat' or 'prod'/)
  })
})

/**
 * The defect that motivated the shell gate, pinned so it cannot return.
 *
 * `maintenance.sh on` ended with `[[ -n "$UNTIL_TEXT" ]] && echo …` as the last statement of the
 * last `case` branch. With no `--until` the test fails, the AND-list's status becomes the
 * script's status, and `deploy.sh` — which calls it under `set -e` before doing anything else —
 * aborted with the environment already behind a 503.
 */
describe('maintenance.sh does not exit non-zero on its own success path', () => {
  it('has no trailing `[[ … ]] && …` as a branch’s last statement', () => {
    const script = execFileSync('cat', [join(VM_DIR, 'maintenance.sh')], { encoding: 'utf8' })

    // The specific shape: an AND-list immediately followed by the end of a `case` branch.
    expect(
      /\[\[[^\n]*\]\]\s*&&[^\n]*\n\s*;;/.test(script),
      'An AND-list as a case branch’s last statement makes a false test the script’s exit ' +
        'status. Use an `if` — see the comment in maintenance.sh and in backup.sh.',
    ).toBe(false)
  })
})
