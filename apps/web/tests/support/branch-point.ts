import { execSync } from 'node:child_process'

/**
 * T-review (014) — **where this branch left `develop`, resolved the same way locally and in CI.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **TWO GUARDS COMPARE AGAINST THE BRANCH POINT, AND BOTH HAD THEIR OWN COPY OF THIS, AND
 * NEITHER COPY COULD RUN IN CI.**
 *
 * `no-admin-surface.test.ts` re-asserts FR-1003 over the files this feature touched;
 * `marker-not-cached.test.ts` proves **this feature** added no device capability by showing
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
 * Candidates: the pull request's own base (`GITHUB_BASE_REF`, which is the authoritative answer
 * when CI supplies it), a local `develop`, and `origin/develop`. A candidate that resolves to
 * `HEAD` means we are standing on the base branch, and `HEAD~1` is used instead.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 * **THE LATEST RESOLVABLE BASE WINS, NOT THE FIRST — AND A STALE LOCAL REF IS WHY.**
 *
 * This used to return the first candidate that resolved, which put a **local** `develop` ahead of
 * `origin/develop`. On 2026-08-14 that produced a wrong answer on a real clone: `develop` had moved
 * two commits on the remote, the local ref still pointed at the older tip, and every guard here
 * compared against a branch point two features out of date. One of them failed loudly and the rest
 * silently widened — `changedSinceBranchPoint` reported another feature's files as this feature's.
 *
 * Preferring the newest base is correct in every case and wrong in none: each candidate is a merge
 * base of the same HEAD, so they lie on one ancestry line, and the descendant-most is by definition
 * the closest true divergence point. A stale ref can then only make the answer *older*, never
 * wrong, and this picks the freshest of whatever the checkout happens to have.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════
 */
export const branchPoint = (repo: string): string => {
  const head = git('git rev-parse HEAD', repo)

  const candidates = [
    process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null,
    'develop',
    'origin/develop',
  ].filter((ref): ref is string => ref !== null)

  const bases: string[] = []

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
        bases.push(git('git rev-parse HEAD~1', repo))
      } catch {
        continue
      }
      continue
    }

    bases.push(base)
  }

  if (bases.length > 0) {
    // Keep the descendant-most. `--is-ancestor` exits 0 when the first commit is an ancestor of
    // the second, so a successful call means `candidate` is strictly newer than `best`.
    return bases.reduce((best, candidate) => {
      if (best === candidate) return best
      try {
        git(`git merge-base --is-ancestor ${best} ${candidate}`, repo)
        return candidate
      } catch {
        return best
      }
    })
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

/**
 * The contents of one file as it stood at the branch point.
 *
 * **Added on the 2026-08-14 merge of `develop`, and the reason is worth stating.** A guard that
 * froze a *product-wide* count — "the device capabilities are seven" — was correct when written and
 * became false the moment a parallel feature ratified an eighth (v5.1.0, `InstallService`). The
 * property this feature actually owes is narrower and does not expire: **this feature changed
 * nothing about the set.** Comparing HEAD against the branch point states exactly that, and stays
 * true however many capabilities later amendments add.
 *
 * Throws for the same reason `branchPoint` does: a guard that cannot read its comparison base has
 * checked nothing and must say so rather than degrade to an empty string that matches everything.
 */
export const fileAtBranchPoint = (repo: string, path: string): string => {
  const base = branchPoint(repo)
  try {
    return git(`git show ${base}:${path}`, repo)
  } catch {
    throw new Error(
      `Could not read ${path} at the branch point (${base}), so a comparison against it would ` +
        'pass vacuously. If the file is genuinely new in this feature, the guard using this ' +
        'helper is the wrong guard for it.',
    )
  }
}
