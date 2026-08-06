import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { loadEnvFiles } from '../../src/env.js'

const NAMES = ['MYNET_TEST_ONLY_IN_ENV', 'MYNET_TEST_IN_BOTH', 'MYNET_TEST_FROM_SHELL'] as const

afterEach(() => {
  for (const name of NAMES) delete process.env[name]
})

const rootWith = (env: string, local: string) => {
  const root = mkdtempSync(join(tmpdir(), 'mynet-env-'))
  writeFileSync(join(root, '.env'), env)
  writeFileSync(join(root, '.env.local'), local)
  return `${root}/`
}

describe('loadEnvFiles', () => {
  it('lets .env.local win over .env', () => {
    // The whole mechanism in one assertion: `process.loadEnvFile` will not overwrite a variable
    // that is already set, so loading .env.local first is what makes it take precedence.
    const root = rootWith('MYNET_TEST_IN_BOTH=from_env\n', 'MYNET_TEST_IN_BOTH=from_local\n')
    loadEnvFiles(root)
    expect(process.env['MYNET_TEST_IN_BOTH']).toBe('from_local')
  })

  it('still reads values that only .env carries', () => {
    const root = rootWith('MYNET_TEST_ONLY_IN_ENV=secret\n', 'MYNET_TEST_IN_BOTH=x\n')
    loadEnvFiles(root)
    expect(process.env['MYNET_TEST_ONLY_IN_ENV']).toBe('secret')
  })

  it('lets the real environment beat both — this is what keeps CI on its own database', () => {
    process.env['MYNET_TEST_FROM_SHELL'] = 'from_shell'
    const root = rootWith('MYNET_TEST_FROM_SHELL=from_env\n', 'MYNET_TEST_FROM_SHELL=from_local\n')
    loadEnvFiles(root)
    expect(process.env['MYNET_TEST_FROM_SHELL']).toBe('from_shell')
  })

  it('treats a missing file as ordinary — a deployed API is configured by its host', () => {
    const root = `${mkdtempSync(join(tmpdir(), 'mynet-env-none-'))}/`
    expect(() => loadEnvFiles(root)).not.toThrow()
  })
})
