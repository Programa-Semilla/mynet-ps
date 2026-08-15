import { execSync } from 'node:child_process'

/**
 * fix/post-merge-verification (2026-08-15) — **a merged feature's diff, pinned by the history
 * that now records it.**
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * **THIS FILE REPLACES `branch-point.ts`, AND THE REPLACEMENT IS THE END OF A RECORDED
 * TRAJECTORY: frozen count → branch-relative → pinned range.**
 *
 * Two guards assert properties of 014 tranche 2's diff: `no-admin-surface.test.ts` (FR-1003 over
 * the files the feature touched) and `marker-not-cached.test.ts` (the feature changed nothing
 * about the device-capability set). Their first form froze a product-wide count and broke when a
 * parallel feature legitimately changed it (016's `InstallService`, v5.1.0). Their second form —
 * `branch-point.ts` — re-derived the branch point from the checkout context, which was correct on
 * the feature branch and had a distinct false answer in every context that came after the merge:
 *
 *   - a `develop`→`main` promotion PR resolves a base that is content-identical, so the diff is
 *     empty and the non-vacuity floors fail ("the guard is vacuous");
 *   - a push to `main` resolves the merge commit's first parent, so the "diff" is the whole
 *     product since the previous promotion;
 *   - any future branch that does not touch what the guards scan fails their floors against
 *     THAT branch's diff — which is not even the diff the guards are about.
 *
 * None of this was visible before 2026-08-15 because a workflow defect (the `closed` trigger's
 * concurrency collision) cancelled every push run that would have shown it.
 *
 * The repair completes the guards' own argument. The property 014 owes is a fact about **its own
 * diff**, and since the squash merged, that diff is **fixed history**: `8b775e17` and its parent
 * `63bfd977`, both permanently in `develop` and `main`. Pinning both ends makes every assertion
 * deterministic in every checkout context, and — the property the second form was built for —
 * **no later amendment can falsify it**: a ninth capability, a rename, a rewrite of any file the
 * feature touched all land after `8b775e17` and change nothing about the range.
 *
 * **Both ends, never base-versus-working-tree.** Comparing the pinned base against the tree that
 * happens to be checked out re-imports the frozen-count failure through the other door: the next
 * legitimate product-wide change would fail 014's guard again.
 *
 * **This throws rather than degrading, unchanged from its predecessor.** These guards assert
 * absences; a resolution failure that degraded to "no files changed" would make them pass forever
 * — the 010 precache defect this project records as its worst. A shallow clone that cannot see
 * the pinned commits fails loudly here; CI's `test-unit` job checks out with `fetch-depth: 0`
 * for exactly this reason (a requirement it already had for the merge-base form).
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 */

export interface FeatureRange {
  /** The commit the feature branched from — the last commit that does not contain it. */
  readonly base: string
  /** The squash commit that landed the feature — the first commit that contains all of it. */
  readonly head: string
}

/**
 * 014 tranche 2 as it landed: PR #24, squash-merged to `develop` 2026-08-15. The base is the
 * tranche 1 merge (PR #23), which is the commit the tranche 2 branch was taken from.
 */
export const TRANCHE_2: FeatureRange = {
  base: '63bfd9779633bf8602287ab4fe01f152d5c13d1b',
  head: '8b775e176cd574b1025280229e76247b91204264',
}

const git = (command: string, repo: string): string =>
  execSync(command, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

/**
 * Files the feature changed, optionally narrowed to a pathspec. Deleted paths are excluded
 * (`--diff-filter=d`): a file the feature removed cannot carry what these guards scan for, and
 * has no content at `head` to read.
 */
export const changedInRange = (repo: string, range: FeatureRange, pathspec?: string): string[] => {
  const scope = pathspec ? ` -- ${pathspec}` : ''
  try {
    return git(`git diff --name-only --diff-filter=d ${range.base} ${range.head}${scope}`, repo)
      .split('\n')
      .filter(Boolean)
  } catch {
    throw new Error(
      `Could not diff ${range.base.slice(0, 8)}..${range.head.slice(0, 8)}, so the diff-aware ` +
        'guards would compare nothing and pass vacuously. Both commits are on `develop` and ' +
        '`main`; a checkout that cannot see them is too shallow — CI must use `fetch-depth: 0`.',
    )
  }
}

/**
 * One file's contents at a pinned commit. Throws for the same reason `changedInRange` does: a
 * guard that cannot read its comparison base has checked nothing and must say so, rather than
 * degrade to an empty string that matches everything.
 */
export const fileAt = (repo: string, commit: string, path: string): string => {
  try {
    return git(`git show ${commit}:${path}`, repo)
  } catch {
    throw new Error(
      `Could not read ${path} at ${commit.slice(0, 8)}, so a comparison against it would pass ` +
        'vacuously. If the file does not exist at that commit, the guard using this helper is ' +
        'the wrong guard for it; if the commit is missing, the checkout is too shallow.',
    )
  }
}
