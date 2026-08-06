import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { classifyDrift, committedMigrations } from './schema.mjs'

describe('classifyDrift', () => {
  it('reports no drift when the applied sequence is the committed sequence', () => {
    expect(classifyDrift(['a', 'b'], ['a', 'b'])).toBe('none')
  })

  it('reports ahead when the branch adds migrations on top', () => {
    expect(classifyDrift(['a', 'b', 'c'], ['a', 'b'])).toBe('ahead')
  })

  it('reports ahead against an empty database', () => {
    expect(classifyDrift(['a'], [])).toBe('ahead')
  })

  it('reports diverged when the branch is behind — the backward checkout case', () => {
    expect(classifyDrift(['a'], ['a', 'b'])).toBe('diverged')
  })

  it('reports diverged when an applied migration file was edited', () => {
    // Same position, different hash. Applying the rest would leave a schema nobody has.
    expect(classifyDrift(['a', 'edited'], ['a', 'b'])).toBe('diverged')
  })

  it('reports diverged when history was rewritten at the first position', () => {
    expect(classifyDrift(['x', 'b'], ['a', 'b'])).toBe('diverged')
  })
})

describe('committedMigrations', () => {
  it('reads the journal in order and hashes each migration file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynet-migrations-'))
    mkdirSync(join(dir, 'meta'))
    writeFileSync(
      join(dir, 'meta', '_journal.json'),
      JSON.stringify({
        version: '7',
        dialect: 'postgresql',
        entries: [
          { idx: 0, version: '7', when: 1, tag: '0000_first', breakpoints: true },
          { idx: 1, version: '7', when: 2, tag: '0001_second', breakpoints: true },
        ],
      }),
    )
    writeFileSync(join(dir, '0000_first.sql'), 'CREATE TABLE a ();')
    writeFileSync(join(dir, '0001_second.sql'), 'CREATE TABLE b ();')

    const migrations = committedMigrations(dir)

    expect(migrations.map((m) => m.tag)).toEqual(['0000_first', '0001_second'])
    // sha256 of the raw file contents — the algorithm drizzle's migrator records.
    expect(migrations[0].hash).toMatch(/^[0-9a-f]{64}$/)
    expect(migrations[0].hash).not.toBe(migrations[1].hash)
  })

  it('returns nothing when no journal exists yet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynet-migrations-empty-'))
    expect(committedMigrations(dir)).toEqual([])
  })
})
