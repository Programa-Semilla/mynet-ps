import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ensureEnvFile, renderEnvLocal, writeEnvLocal } from './env-file.mjs'

const VALUES = {
  databaseUrl: 'postgresql://mynet:mynet@localhost:55432/mynet_ps',
  apiPort: 3000,
  webOrigin: 'http://localhost:5173',
  apiOrigin: 'http://localhost:3000',
}

describe('renderEnvLocal', () => {
  it('writes every derived value', () => {
    const rendered = renderEnvLocal(VALUES)
    expect(rendered).toContain('DATABASE_URL=postgresql://mynet:mynet@localhost:55432/mynet_ps')
    expect(rendered).toContain('API_PORT=3000')
    expect(rendered).toContain('WEB_ORIGIN=http://localhost:5173')
    expect(rendered).toContain('VITE_API_BASE_URL=http://localhost:3000')
  })

  it('says it is generated, so nobody edits it expecting the edit to survive', () => {
    expect(renderEnvLocal(VALUES)).toMatch(/generated/i)
  })

  it('carries no secret — those stay in .env', () => {
    const rendered = renderEnvLocal(VALUES)
    expect(rendered).not.toContain('AUTH_PASSWORD_PEPPER')
    expect(rendered).not.toContain('AUTH_ATTEMPT_HASH_KEY')
  })
})

describe('writeEnvLocal', () => {
  it('writes to .env.local at the given root', () => {
    const root = mkdtempSync(join(tmpdir(), 'mynet-root-'))
    writeEnvLocal(root, VALUES)
    expect(readFileSync(join(root, '.env.local'), 'utf8')).toContain('API_PORT=3000')
  })
})

describe('ensureEnvFile', () => {
  it('creates .env from the example, with generated secrets substituted', () => {
    const root = mkdtempSync(join(tmpdir(), 'mynet-root-'))
    writeFileSync(
      join(root, '.env.example'),
      [
        'AUTH_PASSWORD_PEPPER=replace-me-with-openssl-rand-base64-48',
        'AUTH_ATTEMPT_HASH_KEY=replace-me-with-openssl-rand-base64-48',
        'AUTH_SESSION_IDLE_DAYS=14',
      ].join('\n'),
    )

    expect(ensureEnvFile(root)).toBe('created')

    const written = readFileSync(join(root, '.env'), 'utf8')
    expect(written).not.toContain('replace-me')
    expect(written).toContain('AUTH_SESSION_IDLE_DAYS=14')

    const pepper = /AUTH_PASSWORD_PEPPER=(.+)/.exec(written)[1]
    const key = /AUTH_ATTEMPT_HASH_KEY=(.+)/.exec(written)[1]
    expect(pepper.length).toBeGreaterThan(40)
    expect(pepper).not.toBe(key)
  })

  it('never touches an existing .env', () => {
    const root = mkdtempSync(join(tmpdir(), 'mynet-root-'))
    writeFileSync(join(root, '.env.example'), 'AUTH_PASSWORD_PEPPER=replace-me')
    writeFileSync(join(root, '.env'), 'AUTH_PASSWORD_PEPPER=mine\n')

    expect(ensureEnvFile(root)).toBe('present')
    expect(readFileSync(join(root, '.env'), 'utf8')).toBe('AUTH_PASSWORD_PEPPER=mine\n')
  })
})
