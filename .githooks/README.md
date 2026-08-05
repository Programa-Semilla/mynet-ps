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
