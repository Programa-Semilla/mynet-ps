# Fix: Post-Merge Verification

**Branch:** `fix/post-merge-verification` · **Date:** 2026-08-15 · **Type:** repair, no feature
**Sources:** three defects found while promoting `develop` to `main` (PR #25). None is in product
behaviour; all three are in how the product is *verified* after a merge, and two of them have been
masking each other since at least 2026-08-10.

## Problem statement

The first promotion of `develop` to `main` (PR #25, merged 2026-08-15) surfaced that **no
post-merge verification has actually completed on any base branch for days**, and that when it
finally ran, it failed for reasons unrelated to the product:

1. **Every push-event run on `develop` and `main` is cancelled within seconds.** `verify.yml`
   triggers on `pull_request: types: [.., closed]`. A closed-event run resolves its concurrency
   group to the **base branch's ref** — observed, not theorised: both of today's push runs died
   the second the corresponding closed-event run started, and every `develop` push run since
   2026-08-10 shows the same signature. The push run is the **only** run that executes
   `verify-push`, `deploy-uat` and `deploy-prod` (`verify.yml:772,832,1030`), so merges have not
   been deploying. Invisible today only because both deploy jobs are blocked-and-exit-0 pending
   env values; the moment 010 fills `uat.env`, merges would silently stop deploying. The `closed`
   type is a fossil: 001's pipeline used it for the preview-environment `cleanup` job, which 006
   deleted along with the vendors it served.

2. **Two diff-aware guards fail structurally outside 014's own branch.**
   `apps/web/tests/unit/no-admin-surface.test.ts` and `marker-not-cached.test.ts` assert
   properties of **014 tranche 2's diff** by re-deriving a branch point from the checkout context
   (`tests/support/branch-point.ts`). That derivation was correct on the feature branch and has a
   distinct false answer in every context that came after it: on a `develop`→`main` promotion PR
   the nearest base is content-identical so the diff is empty; on a `main` push the merge commit's
   first parent is pre-promotion `main` so the diff is the whole product; on any future branch
   that does not touch `apps/web/src` heavily, the non-vacuity floors fail against **that**
   branch's diff — which is not even the diff the tests are about. Defect 1 cancelled every run
   that would have shown this.

3. **One refusal payload has an untotal order.** `sessionsViolatingModality` and the
   `would-orphan-sessions` query order by `starts_at` alone; two sessions sharing a start time
   arrive in whatever order the executor happens to produce.
   `conference-modality.test.ts:91` asserts the order and flipped on PR #25's run after passing
   on every feature-branch run.

## Requirements

- **FR-F1** — `verify.yml` MUST NOT run on `pull_request` `closed` events. The trigger types
  become `[opened, reopened, synchronize]`, and the `github.event.action != 'closed'` clause on
  the PR-side aggregate is removed **because the event can no longer occur** — a guard against an
  impossible event is a false record (013's false-header class). The concurrency group is
  unchanged: with `closed` gone there is nothing left to collide across events.
- **FR-F1a** *(added at review)* — a PUSH run is never `cancel-in-progress`; only pull-request
  runs supersede each other. Found adversarially: with push runs surviving (FR-F1), two rapid
  merges to `develop` would put both push runs in one group and the second would cancel the
  first **mid-deploy** — `deploy.sh` raises the maintenance flag mid-script, so a cancelled
  deploy leaves the environment serving 503 while the next run reports green. Unreachable before
  this fix only because every push run was killed at birth. Rapid merges now queue.
- **FR-F1b** *(added at review)* — `pull-requests: write` and `deployments: write` are removed
  from the workflow's permissions: fossils of the same deleted 001 preview pipeline as the
  `closed` trigger, with no remaining consumer. The `test-unit` checkout comment citing the
  deleted `branch-point.ts` is rewritten for the same reason the clause in FR-F1 is.
- **FR-F2** — the two diff-aware guards MUST be deterministic in every checkout context: a
  feature branch, a `develop` push, a promotion PR, a `main` push, and a future branch touching
  nothing they scan. 014 tranche 2's diff is **fixed history now** — the squash `8b775e17` and
  its parent `63bfd977`, both permanently in `develop` and `main` — so the guards pin that range
  by full SHA instead of re-deriving it from context. Every assertion keeps its exact subject and
  strength: the pinned diff is byte-identical to the diff the guards proved on the feature branch.
  This is the completion of the guards' own recorded trajectory (frozen count → branch-relative →
  pinned range): "the property 014 owes and which no later amendment can falsify".
- **FR-F2a** — `tests/support/branch-point.ts` is DELETED, not kept: after FR-F2 it has zero
  callers, and its header names the two guards as its callers — a helper whose documented call
  relationships do not exist is 013's recorded defect class. Its reasoning survives in git
  history and in the successor module's header, which must say where the machinery went and why.
- **FR-F3** — every session list carried in a refusal or warning payload MUST have a total,
  human-meaningful order: `starts_at`, then `title`, then `id`. Applies to
  `modality_conflicts_sessions`, `would_orphan_sessions`, and — found by the review's sweep —
  `room_overlap` (FR-1016's warning), which had the identical untotal order and escaped the
  first pass on the refusal/warning distinction. The integration test keeps asserting the exact
  order — now justified by the query rather than by luck: both fixture sessions share a start
  instant, so the assertion pins the title tiebreak.
- **Noted, deliberately not fixed here** *(review sweep of every `ORDER BY` reaching a
  payload)*: name-ordered vocabulary lists (speakers, tracks, rooms) tie on organizer-authored
  duplicate names; the account export orders several sections by `created_at` alone, where rows
  written in one transaction share an instant; `events` orders by `(starts_on, name)` with no id
  key. None is asserted on by any test, none has flipped, and each sits in another feature's
  files — recorded here so the next flake in that class starts from this list rather than from
  zero. `admin-enrolments` ties are invisible (only the display name is projected) and
  `appointments` is total in effect via the `(event_id, starts_at)` unique constraint.

## Success criteria

- **SC-F1** — the full unit suite passes **on this branch**, which touches no file in
  `apps/web/src`: this branch is itself the counter-example that broke the old guards.
- **SC-F2** — the two guards still fail when their subject is falsified: an empty pinned range
  fails each FILE loudly via its non-vacuity floor (mutation-checked during implementation, per
  this project's guard discipline). Stated precisely because the adversarial review measured it:
  the loudness is floor-level, not helper-level — `changedInRange` legitimately returns `[]` for
  an empty range and the floors are what refuse it, the same structure the predecessor had.
- **SC-F3** — after this change merges: the `develop` push run survives to completion and
  `verify-push` reports all ten checks green; on the next promotion, the `main` push run does the
  same and the deploy jobs execute (still printing their blocked-on message and exiting 0).
- **SC-F4** — `conference-modality.test.ts` passes with the order assertion intact, and the
  ordering is total by construction.

## Feature Declarations

| Declaration | Answer |
|---|---|
| Actor and tier | None — no actor-facing behaviour changes. The only product-code change is a deterministic `ORDER BY` on two refusal payloads: same rows, same shape. |
| Administrative counterpart | None, because nothing here adds a capability to either product. |
| Schema / migration | None. |
| Attendee data (deletion/export) | None touched. |
| Offline behaviour | Unchanged; no repository, no cache classification. |
| Layouts / accessibility | Unchanged; no rendered surface changes. |
| Event scoping | Unchanged; the ordered queries already scope by `event_id`. |
| Register position | Blocks nothing; opens nothing. Repairs the verification of what is already ratified. |

## Decisions recorded

- **Pinned SHAs over context derivation** — the guards' subject is one feature's diff, and that
  diff stopped being context-dependent the moment it merged. Context derivation was three
  assumptions deep (base ref present, base ≠ content-identical, HEAD~1 = the feature squash) and
  each post-merge context falsified a different one.
- **The cost of pinning is ratified, not glossed** *(named by the adversarial review)*: a pinned
  guard is a sealed proof about history and **can never again fail on a future edit** — the
  limiting case of "a guard that cannot fail", distinguished only by its subject being genuinely
  settled. Two things stop that from being a coverage hole. The broad per-file review patterns
  (`tier|operator|organiz…|admin` over every file 014 touched) retire with the review they
  served — applied to the working tree forever they would false-positive on legitimate copy, and
  the exemption list they would grow is the weakening doctrine forbids. Prospective coverage
  lives where it always did: the categorical halves of these files and 013's
  `admin-absences.test.ts` scan the whole product's working tree on every run, and a present-day
  capability change fails the typecheck against `substitution.test.ts`'s typed doubles — the
  file a capability change cannot avoid editing, which is the conversation.
- **Delete `branch-point.ts` rather than keep it "for the next feature"** — a future feature
  writing diff-aware guards writes them against its own recorded range after merge, or re-derives
  live during development; keeping a caller-less module with an emphatic header is the exact
  defect 013 catalogued four times.
- **`closed` removed rather than concurrency regrouped** — regrouping (adding `event_name` to the
  group key) would keep spending ten jobs per merge on a run whose aggregate is skipped and whose
  deploys never fire. The runs were pure waste; removing the trigger removes the waste and the
  collision in one line.
