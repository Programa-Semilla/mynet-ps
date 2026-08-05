# Git hooks

Versioned hooks that enforce the branching policy in
`.specify/memory/constitution.md` → **Branching and Change Flow**.

## Enable (once per clone)

```bash
git config core.hooksPath .githooks
```

Git does not enable these automatically — `core.hooksPath` is local
configuration and cannot be committed. Every clone must run the command above.

## What they do

| Hook | Blocks |
|------|--------|
| `pre-commit` | committing while `HEAD` is on `main` or `develop` |
| `pre-push`   | pushing to `refs/heads/main` or `refs/heads/develop` |

## Limits

These hooks run on the developer's machine and can be bypassed with
`--no-verify`. They are a guardrail against mistakes, not a security control.

Authoritative enforcement is server-side branch protection on GitHub, which is
**not currently active**: `daperezu/mynet-ps` is a private repository on a free
personal account, and both the branch-protection and ruleset APIs return

```
403  Upgrade to GitHub Pro or make this repository public to enable this feature.
```

Enable server-side protection by making the repository public or upgrading to
GitHub Pro, then applying:

```bash
gh api -X PUT repos/daperezu/mynet-ps/branches/main/protection \
  -H "Accept: application/vnd.github+json" --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_linear_history": true,
  "required_conversation_resolution": true
}
JSON
```

Repeat for `develop`. Raise `required_approving_review_count` above `0` once
more than one person works on the repository.

## Required status checks — FR-065's unmet half (T091a)

**FR-065 says a change whose verification is not green must not be merged. On
this repository, nothing enforces that.**

`.github/workflows/verify.yml` produces the eleven checks FR-063 names and an
aggregate `verify` job that fails unless every one of them literally succeeded.
That makes a non-green run *visible*. It does not make it *unmergeable*: turning
a check into a required status check is branch protection, and branch protection
returns `403` here for the same free-tier reason above.

Until that changes, FR-065 rests on the client-side hooks in this directory,
which `--no-verify` bypasses, and on whoever clicks merge. This is a known,
accepted, and now explicitly assigned gap — spec Open Question 17. It is
materially more serious than it was during the prototype, because real attendee
data is now in scope (constitution Principle VIII).

When protection becomes available, add the eleven checks plus the aggregate:

```bash
gh api -X PATCH repos/daperezu/mynet-ps/branches/develop/protection/required_status_checks \
  -H "Accept: application/vnd.github+json" --input - <<'JSON'
{
  "strict": true,
  "contexts": [
    "typecheck", "lint", "test-unit", "test-component", "contract",
    "migrations", "test-integration", "test-accessibility", "test-e2e",
    "build", "deploy-preview", "verify"
  ]
}
JSON
```

Listing all eleven *and* `verify` is deliberate rather than redundant. `verify`
alone would be enough while it names every job in `needs`, and would silently
stop being enough the moment somebody removed one — which is the failure FR-064
and FR-071 are about. `verify` additionally asserts that it has exactly eleven
dependencies, so that removal fails rather than passing quietly.
