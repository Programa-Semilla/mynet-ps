# Code Review: 011 — Administrative Foundation

**Spec**: [spec.md](./spec.md) · **Date**: 2026-08-11 · **Reviewer**: `speckit.spex-gates.review-code`
**Constitution**: v4.1.0, standing decisions 31–39

## Compliance Summary

**Overall: 93/93 requirements implemented — 100%.**

| Group | Count | Implemented | Has a test that fails when it breaks |
|---|---|---|---|
| FR-900–FR-926 (actors, tiers, origin, session, client) | 27 | 27 | 26 |
| FR-930–FR-947 (promotion, conferences, report queue) | 25 | 25 | 25 |
| FR-950–FR-962 (moderation, lifecycle) | 11 | 11 | 11 |
| FR-970–FR-984 (absences in MyNet, retention, export) | 13 | 13 | 13 |
| FR-990–FR-999 (bootstrap, audit) | 13 | 13 | 13 |
| SC-900–SC-912 | 13 | 13 | 12 |

Method: every requirement id was located in source and in tests mechanically, then the eight with
no test reference were read individually. Six were covered by tests that cite a neighbouring
requirement rather than their own number; **one was a genuine gap and was closed during this
review**; one is deliberately not a gate.

## The gap this review found and closed

### FR-920 — "reuses none of MyNet's destinations, Home card registry, or navigation contract"

**Status before**: satisfied but unguarded. Nothing in `apps/admin` imported `apps/web`, and
nothing failed if that changed.

**Why it matters more than it looks**: decision 33 keeps Principle III's attendee-workspace framing
true *by construction*. The first step away from that is not an admin screen inside MyNet — it is
somebody importing MyNet's `navigation.ts` here to avoid duplicating the contract, after which one
registry serves two products and a tier filter is the obvious next commit. `routes.tsx` argues this
in prose; there was no assertion under it.

**Closed**: `apps/admin/tests/unit/no-platform-dependency.test.ts` now also asserts no `@mynet/web`
dependency and no `apps/web` reach in source. **Comments are stripped first, and that is
load-bearing here rather than ceremonial** — three files in this client legitimately mention
`apps/web` in explanatory comments, so matching raw text would fail on a correct implementation and
the natural repair would be to weaken the pattern until it checks nothing (009's recorded rule).
**Mutation-verified**: a smuggled `'apps/web/src/app/navigation.js'` string in `branding.ts` fails
it; the comment mentions do not.

## The seven that read as gaps and are not

| Requirement | Covered by | Note |
|---|---|---|
| **FR-900** two tiers, no third | `tier: 'platform' \| 'organizer'` union + `admin-scope-brand.test.ts` | Structural. A third tier fails typecheck; the brand test pins both directions, one with `@ts-expect-error`. |
| **FR-910** subdomain, same-origin API | `deploy/vm/Caddyfile` | **Verification is environment-limited and says so.** Locally the admin client is a second *port*, which is a different origin but not a different host — `e2e/support/env.ts` records that the local topology reproduces the property under test only by coincidence, and that the deployed guarantee rests on the Caddyfile and `admin-cookie.test.ts`. No domain is registered, so it has never been exercised for real. |
| **FR-921** shared tokens and brand mark | `theme/index.css`, `branding.ts` | **The one requirement with no dedicated test.** Partly covered in effect: `admin-accessibility.spec.ts` scans rendered contrast, which is what a broken token import would break first. Judged acceptable — see Recommendations. |
| **FR-980** server-enforced authority | `operator-audit.test.ts` | Fails any `/admin/*` route carrying neither guard, with an allow-list requiring a written reason. This *is* FR-980's test. |
| **FR-983** every table states deletion or expiry | `deletion-coverage.test.ts` | Three allow-list entries with written reasons, plus computed transitive cascade reachability (`deviations.md` D3). |
| **FR-984** resolution retention stated | `maintenance.ts` `RETENTION_SWEEPS` | Retention window declared; `report_resolutions` reachable in two cascade hops, computed rather than claimed. |
| **SC-900** sign-in to queue under 30s | `quickstart.md`, measured | **Deliberately not a gate.** Median 373 ms over five runs against the machine-observable path — about 1% of the budget. Recorded with its method so the next reading is comparable. |

## Deviations

Five, all documented in [`deviations.md`](./deviations.md) and all `[~]` in `tasks.md`:

- **D1/D2** — no client-side audit repository, and no administrative repository registered in
  `packages/platform`'s `Repositories`. Registering them would put administrative code inside
  MyNet's bundle and violate FR-970; they are composed in `apps/admin`'s own root instead. **This is
  a deviation from `tasks.md`, not from the spec** — the spec requirement is satisfied more
  strictly than the task described.
- **D3** — `deletion-coverage.test.ts` gained computed reachability instead of an allow-list entry.
  Stronger than asked for.
- **D4** — `PlatformScope` is a subclass rather than a sibling class, because sibling classes with
  private fields are incompatible in both directions.
- **D5** — `apps/admin` has no CI jobs of its own; the existing five already address the whole
  workspace. Cost stated in the workflow.

None weakens a spec requirement.

## Extra behaviour not in the spec

- **`ADMIN_ORIGIN`** — a development-only CORS setting, `absent()` by design and documented in
  `.env.example` as such. Not spec'd because it does not exist in a deployed environment, where
  Caddy makes the two hosts same-origin. Correct as an implementation detail; no spec change needed.
- **Deployment wiring** (`deviations.md` D7) — the admin build, its rsync and its `/srv/admin`
  mount. Not a spec requirement, but FR-910 is unreachable without it.

## Defects found and fixed during this review cycle

Four, written up in `deviations.md` D6–D9. The two that matter most:

1. **FR-992's forced credential replacement was unreachable** (D8). Sign-in succeeded, `/admin/me`
   correctly refused with `credential_not_replaced`, and the client classified every failure as
   signed-out — returning the operator to the form they had just used correctly. **The product's
   opening interaction was a dead end**, and it passed every gate because the component test
   substituted `session.me()` with a response the server cannot produce.
2. **Two tasks were ticked while their assertions did not exist** (D6): T050's session bounds — the
   guarantee that stops a busy session living forever — and T113's FR-934. Both now written and
   mutation-verified.

Plus an AA contrast failure on the administrative rail (D9) and the deployment gap (D7).

## Code Quality Notes

- Refusal shapes are consistent and produced from single factories; the tier 404 is
  indistinguishable from a missing route by construction rather than by two careful call sites.
- Client error classification is on `error.code` throughout, with a test requiring all nine
  outcomes to be mutually distinct — the property `instanceof` classification destroys.
- **One piece of dead code**: `credentialIsInitial` on `GET /admin/me`'s payload can never be
  `true`, because the guard refuses before the handler runs in exactly that state. Left in place
  because the contract is committed. Worth removing deliberately.

## Recommendations

### Critical (must fix)
None outstanding.

### Worth a decision
- [ ] **Remove `credentialIsInitial` from `GET /admin/me`** in a follow-up, with a contract
      regeneration. It reads as meaningful and is unreachable.
- [ ] **FR-921 has no dedicated test.** A token-import assertion would be cheap, but the honest
      version of this requirement ("reads as the same product family") is visual, and the by-hand
      walk is where it belongs. Recorded rather than papered over.

### Not closed by this feature, and must not be read as closed
- **Register entries 19 and 21** — 011 creates the *capability* to moderate and to read reports; it
  does not decide who does so, against what standard, or with what appeal. A capability is not a
  policy.
- **Register entry 4** — desktop and tablet layouts remain unvalidated, and 011 adds a whole second
  product to that debt.

## Conclusion

**Compliance: 100%. Approved to proceed.**

Every requirement is implemented, and every one but FR-921 has a test that fails when it stops
being true. One genuine guard gap (FR-920) was found and closed during this review, with mutation
verification.

**What is NOT verified, stated plainly**: T158 and T159 — the by-hand `quickstart.md` walk — have
not been performed. They need a person, a phone and a screen reader. FR-921 and the three-width
layout review live there, and every feature since 007 has shipped without walking its equivalent.
008 is the standing argument against repeating that: the first person who looked found a dialog
rendering in the top-left corner that had passed every automated gate.
