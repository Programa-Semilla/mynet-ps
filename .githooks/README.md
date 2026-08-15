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
**not configured**. Verified 2026-08-07 against `Programa-Semilla/mynet-ps`:

```
GET repos/Programa-Semilla/mynet-ps/branches/main/protection     404  Not Found
GET repos/Programa-Semilla/mynet-ps/branches/develop/protection  404  Not Found
GET repos/Programa-Semilla/mynet-ps/rulesets                     []
```

A 404 here means **no rule is set** — not that the feature is unavailable. An
earlier version of this file recorded a 403 and a private repository on a free
personal account; both were wrong, and the repository name has changed too.
The repository is public and organisation-owned, and branch protection is free
on public repositories, so nothing blocks enabling it. Apply:

```bash
gh api -X PUT repos/Programa-Semilla/mynet-ps/branches/main/protection \
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
a check into a required status check is branch protection, and no branch
protection is configured here.

Until it is, FR-065 rests on the client-side hooks in this directory, which
`--no-verify` bypasses, and on whoever clicks merge. This is a known and
explicitly assigned gap — spec Open Question 17, and constitution register
entry 15. It is **not** an accepted one: nothing external prevents closing it,
so it is unfinished configuration. It is materially more serious than it was
during the prototype, because real attendee data is now in scope (constitution
Principle VIII).

This matters more than it reads. Every pull-request run of `verify` has so far
concluded in **failure**, with the migration, integration, accessibility and
end-to-end stages **skipped** — and features 001 and 002 merged anyway. Under
Principle VII as amended in constitution v2.2.0, that is a governance breach
requiring a recorded waiver. Required status checks are what would have stopped
it. See constitution register entry 17.

Once protection is applied, add the eleven checks plus the aggregate:

```bash
gh api -X PATCH repos/Programa-Semilla/mynet-ps/branches/develop/protection/required_status_checks \
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
