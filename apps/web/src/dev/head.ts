/**
 * Parsing `.git/HEAD`.
 *
 * Separated from the plugin because it is the only part with cases worth testing, and because
 * a pure function is testable under Vitest while a Vite plugin is not.
 */
export const branchFromHead = (contents: string): string => {
  const trimmed = contents.trim()
  if (!trimmed) return 'unknown'

  // `refs/heads/feat/a/b` is one branch name containing slashes, not a path to walk.
  const ref = /^ref:\s*refs\/heads\/(.+)$/.exec(trimmed)
  if (ref?.[1]) return ref[1]

  // Detached HEAD: the file holds a bare SHA.
  return trimmed.slice(0, 7)
}
