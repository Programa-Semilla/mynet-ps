import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'

import { describe, expect, it } from 'vitest'

import { STEPS } from './verify-clean.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

const workflow = readFileSync(`${ROOT}.github/workflows/verify.yml`, 'utf8')
const rootScripts = Object.keys(JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')).scripts)

/**
 * Every root package script the pipeline invokes, taken from the workflow itself.
 *
 * Read rather than listed, because a list would be a second copy of the pipeline that nobody
 * updates. `install` is excluded — it is a prerequisite of running anything, not a gate.
 */
const scriptsUsedByCi = [...workflow.matchAll(/\brun: pnpm ([a-z:-]+)/g)]
  .map((match) => match[1])
  .filter((script) => rootScripts.includes(script) && script !== 'install')

const stepCommands = STEPS.map((step) => `${step.command} ${step.args.join(' ')}`)

const covered = (script) =>
  stepCommands.some((command) => command.split(' ').slice(0, 2).join(' ') === `pnpm ${script}`)

describe('CI parity', () => {
  /**
   * The guard that makes `pnpm verify:clean` trustworthy rather than merely convenient.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   * The whole claim of this script is "everything the pipeline gates on, you can run here". A
   * new job added to the workflow silently falsifies that claim, and it falsifies it in the
   * worst direction: the local run keeps passing while covering less than it says it does.
   *
   * So the workflow is the source and this test is the comparison. Adding a gate to CI without
   * adding it here fails, with the missing script named.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   */
  it('runs every root package script the pipeline runs', () => {
    expect(scriptsUsedByCi.length).toBeGreaterThan(0)

    const missing = scriptsUsedByCi.filter((script) => !covered(script))
    expect(missing, `not covered by verify:clean: ${missing.join(', ')}`).toEqual([])
  })

  it('covers the two gates CI does not invoke as a plain pnpm script', () => {
    // `node scripts/asset-budget.mjs` in the build job, and the two Playwright jobs.
    expect(covered('budget')).toBe(true)
    expect(covered('test:e2e')).toBe(true)
  })
})

describe('clean-environment guarantees', () => {
  /**
   * The reason this script exists at all. `pnpm verify` runs against whatever database the
   * developer already has, which is already migrated and already has `citext` installed — so
   * it cannot catch the failure the comment at the top of `0000_initial_schema.sql` describes.
   */
  it('applies migrations twice, to prove idempotence as the pipeline does', () => {
    const migrations = STEPS.filter(
      (step) => covered('db:migrate') && step.args.includes('db:migrate'),
    )
    expect(migrations).toHaveLength(2)
  })

  it('installs from the lockfile, so a drifted node_modules cannot mask a missing dependency', () => {
    expect(stepCommands).toContain('pnpm install --frozen-lockfile')
  })

  it('migrates before anything that reads the database', () => {
    const lastMigrate = stepCommands.findLastIndex((command) => command.includes('db:migrate'))
    const integration = stepCommands.findIndex((command) => command.includes('test:integration'))
    expect(lastMigrate).toBeGreaterThan(-1)
    expect(integration).toBeGreaterThan(lastMigrate)
  })

  it('orders the cheap gates before the expensive ones', () => {
    const typecheck = stepCommands.findIndex((command) => command.includes('typecheck'))
    const e2e = stepCommands.findIndex((command) => command.includes('test:e2e'))
    expect(typecheck).toBeLessThan(e2e)
  })

  it('forbids .only in the end-to-end suite, which would narrow it while reporting green', () => {
    const e2e = stepCommands.find((command) => command.includes('test:e2e'))
    expect(e2e).toContain('--forbid-only')
  })
})
