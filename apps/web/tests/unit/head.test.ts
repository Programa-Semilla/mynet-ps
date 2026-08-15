import { describe, expect, it } from 'vitest'

import { branchFromHead } from '../../src/dev/head.js'

describe('branchFromHead', () => {
  it('reads an ordinary branch', () => {
    expect(branchFromHead('ref: refs/heads/spec/production-foundation\n')).toBe(
      'spec/production-foundation',
    )
  })

  it('keeps slashes in the branch name rather than taking the last segment', () => {
    expect(branchFromHead('ref: refs/heads/feat/a/b\n')).toBe('feat/a/b')
  })

  it('falls back to a short SHA on a detached HEAD', () => {
    expect(branchFromHead('9f8e7d6c5b4a39281706f5e4d3c2b1a098765432\n')).toBe('9f8e7d6')
  })

  it('does not throw on an empty or unreadable HEAD', () => {
    expect(branchFromHead('')).toBe('unknown')
    expect(branchFromHead('   \n')).toBe('unknown')
  })
})
