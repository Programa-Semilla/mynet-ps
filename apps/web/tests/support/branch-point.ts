import { execSync } from 'node:child_process'

/**
 * T-review (014) — **where this branch left `develop`, resolved the same way locally and in CI.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **TWO GUARDS COMPARE AGAINST THE BRANCH POINT, AND BOTH HAD THEIR OWN COPY OF THIS, AND
 * NEITHER COPY COULD RUN IN CI.**
 *
 * `no-admin-surface.test.ts` re-asserts FR-1003 over the files this feature touched;
 * `marker-not-cached.test.ts` proves no eighth device capability was added by showing
 * `packages/platform/tests/substitution.test.ts` is unchanged since the branch point. Both ran
 * `git merge-base HEAD develop` directly, which works on a developer's machine — where `develop`
 * is a local ref — and fails two different ways in CI:
 *
 *   - **On a pull request**, `actions/checkout` has no `develop` ref at all, so `merge-base`
 *     exits non-zero and `execSync` throws. (The `test-unit` job now checks out with
 *     `fetch-depth: 0`; without it, no resolution strategy here can succeed.)
 *   - **On a push to `develop`**, the ref resolves to `HEAD`, so the base *is* `HEAD`, the diff is
 *     empty, and the non-vacuity assertions fail instead.
 *
 * The second case is the one worth naming, because it is not an error — it is the honest answer
 * to "where did this branch leave `develop`" once the branch has been squash-merged **into**
 * `develop`. There, `HEAD~1` is the pre-merge tip, so `HEAD~1..HEAD` is exactly the feature's
 * diff and the guards keep working after the merge rather than going vacuous.
 *
 * **This throws rather than returning an empty result, and that is the requirement.** These two
 * guards assert absences. A resolution failure that degraded to "no files changed" would make
 * both of them pass forever — which is the 010 defect this project records as its worst, where
 * the only assertion for the precache exclusion was skipped on every CI run while appearing to
 * pass. A guard that cannot resolve its own comparison base has not checked anything, and must
 * say so loudly.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

const git = (command: string, repo: string): string =>
  execSync(command, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

/**
 * The commit this branch diverged from, as a sha.
 *
 * Tried in order: the pull request's own base (`GITHUB_BASE_REF`, which is the authoritative
 * answer when CI supplies it), then a local `develop`, then `origin/develop`. A candidate that
 * resolves to `HEAD` means we are standing on the base branch, and `HEAD~1` is used instead.
 */
export const branchPoint = (repo: string): string => {
  const head = git('git rev-parse HEAD', repo)

  const candidates = [
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null,
    'develop',
    'origin/develop',
  ].filter((ref): ref is string => ref !== null)

  for (const ref of candidates) {
    let base: string
    try {
      base = git(`git merge-base HEAD ${ref}`, repo)
    } catch {
      // The ref is absent from this checkout. Try the next one rather than failing here — a
      // shallow clone legitimately has some of these and not others.
      continue
    }

    if (!base) continue

    // We are on the base branch itself (a push to `develop` after this branch merged). The
    // feature's diff is the merge commit's own, so compare against its parent.
    if (base === head) {
      try {
        return git('git rev-parse HEAD~1', repo)
      } catch {
        continue
      }
    }

    return base
  }

  throw new Error(
    'Could not resolve the branch point, so the diff-aware guards in this gate would compare ' +
      'nothing and pass vacuously. Tried: ' +
      candidates.join(', ') +
      '. In CI the `test-unit` job must check out with `fetch-depth: 0` — a depth-1 checkout has ' +
      'no history to find a merge base in.',
  )
}

/** Files changed since the branch point, optionally narrowed to a pathspec. */
export const changedSinceBranchPoint = (repo: string, pathspec?: string): string[] => {
  const base = branchPoint(repo)
  const scope = pathspec ? ` -- ${pathspec}` : ''
  return git(`git diff --name-only ${base} HEAD${scope}`, repo).split('\n').filter(Boolean)
}
