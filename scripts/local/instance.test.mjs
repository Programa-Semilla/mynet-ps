import { describe, expect, it } from 'vitest'

import { databaseNameFor, instanceFor, portOffsetFor } from './instance.mjs'

describe('databaseNameFor', () => {
  it('uses the directory basename, lowercased, with separators normalised', () => {
    expect(databaseNameFor('/mnt/D/repos/mynet-ps')).toBe('mynet_ps')
    expect(databaseNameFor('/home/dev/MyNet.Feature')).toBe('mynet_feature')
  })

  it('prefixes a name that would not be a valid identifier', () => {
    // PostgreSQL identifiers may not begin with a digit.
    expect(databaseNameFor('/repos/2026-rewrite')).toBe('mynet_2026_rewrite')
  })

  it('truncates to the 63-byte identifier limit', () => {
    const long = `/repos/${'a'.repeat(80)}`
    expect(databaseNameFor(long)).toHaveLength(63)
  })
})

describe('portOffsetFor', () => {
  it('gives the main working tree offset zero, so existing bookmarks keep working', () => {
    expect(portOffsetFor('/mnt/D/repos/mynet-ps', { isMainWorktree: true })).toBe(0)
  })

  it('is stable for the same worktree path', () => {
    const first = portOffsetFor('/repos/wt-a', { isMainWorktree: false })
    const second = portOffsetFor('/repos/wt-a', { isMainWorktree: false })
    expect(first).toBe(second)
  })

  it('separates different worktree paths and stays inside the reserved band', () => {
    const a = portOffsetFor('/repos/wt-a', { isMainWorktree: false })
    const b = portOffsetFor('/repos/wt-b', { isMainWorktree: false })
    expect(a).not.toBe(b)
    for (const offset of [a, b]) {
      expect(offset).toBeGreaterThanOrEqual(0)
      expect(offset).toBeLessThan(200)
    }
  })
})

describe('instanceFor', () => {
  it('derives both ports from the offset', () => {
    const instance = instanceFor('/repos/wt-a', { isMainWorktree: false })
    expect(instance.webPort).toBe(5173 + instance.portOffset)
    expect(instance.apiPort).toBe(3000 + instance.portOffset)
  })

  it('honours overrides, which is the escape hatch for two clones sharing a basename', () => {
    const instance = instanceFor('/repos/mynet-ps', {
      isMainWorktree: true,
      overrides: { databaseName: 'custom_db', portOffset: 7 },
    })
    expect(instance.databaseName).toBe('custom_db')
    expect(instance.webPort).toBe(5180)
    expect(instance.apiPort).toBe(3007)
  })
})
