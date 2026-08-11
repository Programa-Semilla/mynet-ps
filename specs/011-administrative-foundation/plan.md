# Implementation Plan: Administrative Foundation — the Second Actor, the Admin Site, and the Report Queue

**Branch**: `spec/011-administrative-product` | **Date**: 2026-08-11 | **Spec**: [spec.md](./spec.md)
**Constitution**: v4.1.0 (standing decisions 31–39)
**Input**: Feature specification from `specs/011-administrative-foundation/spec.md`

## Summary

Build the first feature of the project's second programme: a **separate administrative website**
against the same API and database, exercised by a **second actor in two tiers**, delivering
authentication, the site shell, promotion and demotion, the **abuse-report queue**, and removal of a
reported question.

The approach is mostly **new construction rather than inheritance**, which is the inverse of 009 and
worth stating up front. 009's plan described its approach as "almost entirely inheritance" because
every mechanism it needed already existed. This feature introduces a second application, a second
principal, a second session store, a fourth branded scope, a fourth route audit, an audit trail, and
a pseudonymisation obligation on somebody else's deletion path. What it *does* inherit is the shape
of each: every one of those has a precedent in 007, 008 or 009 that tells us what the failure mode is.

**Nothing in MyNet changes.** Four requirements (FR-970–973) are absences enforced by test, and the
attendee product's existing suite must pass unmodified except for the guards this feature is licensed
to narrow.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 22, React 19
**Primary Dependencies**: Fastify + Drizzle (API), React + Vite (clients). **No new runtime
dependency.** The admin client deliberately takes *no* `vite-plugin-pwa` and *no* `@mynet/platform`
**Storage**: PostgreSQL 17. Migration `0009` — five new tables, two comment-level alterations
**Testing**: Vitest (unit, component, integration), Playwright (e2e, accessibility)
**Target Platform**: Linux; two browser origins served by one Caddy instance
**Project Type**: Web — two clients, one API
**Performance Goals**: None specified beyond existing gates. Administrative volume is low by
construction; the report queue is bounded by attendee reporting, itself throttled
**Constraints**: Same-origin per site; `SameSite=Lax` preserved on both; no offline behaviour in the
admin client; administrative sessions bounded by idle **and** absolute cap
**Scale/Scope**: 80 functional requirements, 13 success criteria, 5 user stories, 5 new tables

**No `NEEDS CLARIFICATION` remains.** Five were resolved by `/speckit-clarify` (see spec
`## Clarifications`); the rest by research R1–R10.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1. Both passes recorded.*

| Principle | Pre-design | Post-design |
|---|---|---|
| **I. Requirements define the product** | PASS — every requirement traces to v4.0.0/v4.1.0 or the spec | PASS |
| **II. Prototype is reference only** | PASS — the prototype has no administrative surface, so nothing to inherit or resist | PASS |
| **III. Attendee experience first** | PASS — administration enters under all four v4.0.0 conditions | PASS — FR-970–973 make MyNet's unchanged state testable |
| **IV. Accessibility & responsiveness** | PASS — FR-922 binds the new product in full | PASS, **with a flagged risk**: see Complexity Tracking |
| **V. Abstraction before platform/data APIs** | PASS | PASS — the admin client needs **no** device capability, so no eighth is added and `substitution.test.ts` is untouched (R9) |
| **VI. Web-first delivery** | PASS — scoped to the attendee product by v4.1.0 | PASS — FR-923's absence is structural via a separate app (R1), not configured |
| **VII. Verified on Linux CI** | PASS — every gate binds the new product | PASS |
| **VIII. Attendee data is personal data** | PASS — third exception already recorded in v4.1.0 | PASS — three records get three distinct deletion rules (data-model.md) |
| **IX. Feature declares completeness** | PASS — declaration complete, including the new **Actor and tier** row | PASS |

**No violation requiring justification.** One risk is tracked below rather than waived.

**Governance**: blocked by no register entry; opens none; **addresses without closing** entries 19
and 21; **escalates** entry 4. Reserved migration `0009`.

## Project Structure

### Documentation (this feature)

```text
specs/011-administrative-foundation/
├── spec.md                      # 80 FRs, 13 SCs, 5 clarifications
├── plan.md                      # this file
├── research.md                  # R1–R10
├── data-model.md                # migration 0009
├── contracts/administrative.md  # routes, guards, refusals, absences
├── quickstart.md                # 11 scenarios; 8–11 need a person
├── checklists/requirements.md   # 16/16, plus the review-gate record
└── tasks.md                     # NOT created by /speckit-plan
```

### Source code (repository root)

```text
apps/admin/                      # NEW — the administrative client
├── src/
│   ├── app/
│   │   ├── auth/                # sign-in, forced credential replacement
│   │   ├── conferences/         # list, unassigned state, promotion
│   │   ├── reports/             # queue, detail, resolution, question removal
│   │   └── shell/               # rail, top bar, tier indicator
│   ├── main.tsx                 # NO service-worker registration (asserted)
│   └── theme/                   # imports shared tokens + 010 brand assets
├── tests/
└── vite.config.ts               # NO vite-plugin-pwa

apps/api/src/
├── admin/                       # NEW — guards and branded scopes
│   ├── scope.ts                 # OperatorScope, PlatformScope
│   └── require-operator.ts      # requireOperator, requirePlatformOperator
├── db/schema/
│   ├── operators.ts             # NEW
│   ├── operator-sessions.ts     # NEW
│   ├── organizer-assignments.ts # NEW
│   ├── report-resolutions.ts    # NEW
│   ├── admin-audit.ts           # NEW
│   └── reports.ts               # ALTERED — header comment only
├── routes/admin/                # NEW — one file per domain
└── db/seed/operators.ts         # NEW — identities only, no credential

apps/api/migrations/0009_administrative_foundation.sql

deploy/vm/Caddyfile              # ALTERED — second site block
```

**Structure Decision**: a **new workspace app** rather than a second entry point in `apps/web`
(research R1). This makes FR-923's absences structural — there is no manifest to exclude and no
worker to un-register — and makes FR-970's absence testable by directory, which it is not if
administrative routes live in the same tree behind a flag.

## Implementation phases

Ordered so that the riskiest structural claim is proven before anything large depends on it.

| Phase | Contents | Why here |
|---|---|---|
| **1. Schema and guards** | Migration `0009`; branded scopes; `requireOperator` / `requirePlatformOperator`; **`operator-audit.test.ts` written first and failing** | The fourth audit is the mechanism 007 and 008 each had to build after discovering the gap. Building it before the routes means no route can be added unguarded, even temporarily |
| **2. Coverage guards** | `deletion-coverage` / `export-coverage` allow-list entries with written rules; narrow `qa-absences` **by path**; narrow `no-report-read-surface` to `apps/web` | These **fail by existing** the moment phase 1's tables land. Doing them here keeps the build green and forces the retention rules to be written rather than deferred |
| **3. Identity and session** | `operators`, `operator_sessions`, sign-in with one uniqueness domain, forced credential replacement, idle + absolute bounds, `admin_sign_in` throttle | Proves the topology and the indistinguishable refusal before any surface exists to protect |
| **4. Admin client shell** | `apps/admin` scaffold, sign-in, tier indicator, three layouts, shared tokens and brand | First point a human can look at it — and layout is what no gate examines |
| **5. Promotion and conferences** | `organizer_assignments`, conference list, unassigned derivation, promote/demote, seed clearing, **re-seed failure test** | The tier boundary becomes real and independently testable, which is what 012 builds on |
| **6. Audit trail** | `admin_audit_entries`, append-only repository, pseudonymisation in `deleteAccount`, retention sweep | Must exist before the queue, because reading report content **writes an entry** (FR-995) |
| **7. Report queue** | List, detail with content and reason, `contentAvailable: false`, resolution with unique-constraint concurrency, question removal with `FOR UPDATE` | The obligation that forced the amendment |
| **8. Lifecycle wiring** | Assignment revocation in `deleteAccount` and in withdrawal, both in-transaction | Two writes into files 004 and 008 own — deliberately last, and deliberately small |
| **9. Deployment and validation** | Caddy block, `.env.example`, runbook, e2e including admin dialog **position** assertions, quickstart walk | — |

**Phases 1–2 are the ones a reviewer should read as a unit**, and they are also the ones most likely
to be skipped under time pressure, because nothing visible works until phase 4.

## Files this feature writes that another feature owns

Named explicitly because this project treats them as exceptional. 008 wrote into two such files and
recorded both.

| File | Owner | Change |
|---|---|---|
| `apps/api/src/routes/account.ts` (deletion path) | 004 | Revoke assignments; **pseudonymise audit entries** — both in the same transaction |
| the withdrawal path | 004/008 | Revoke the assignment for that conference in the same transaction |
| `apps/api/src/db/schema/reports.ts` | 007 | Header comment amended, **not deleted** — FR-548 survives for MyNet |
| `apps/api/tests/unit/qa-absences.test.ts` | 009 | Narrowed by path to permit one moderation route |
| `apps/api/src/db/seed/index.ts` | 002 | Clear organizer assignments as a declared step |
| `e2e/responsive.spec.ts` | 008 | Extend dialog-position assertions to the admin dialogs |

## Complexity Tracking

| Item | Why it is accepted | Why the simpler alternative was rejected |
|---|---|---|
| **A fourth branded scope and a fourth route audit** | Administrative routes name no conference, and `event-scope-audit` **reports success** on such routes | Widening the existing audit to cover four unrelated predicates makes it unreadable, and all four fail silently — 008 declined the same widening |
| **Two guards rather than one with a tier field** | `PlatformScope` as a branded refinement makes a platform-only handler fail to **typecheck** without it | `if (tier === 'platform')` in handlers makes FR-906 a convention every new route can forget |
| **Cross-table email uniqueness enforced in application code** | Postgres cannot express uniqueness across two tables; FR-918 needs it to keep FR-915 achievable | **This is a genuine weakness** — every other uniqueness rule here is database-enforced. Mitigated by both insert paths checking inside their transaction plus a concurrency test, and recorded rather than hidden |
| **`ON DELETE NO ACTION` on `organizer_assignments.event_id`** | A cascade is not an administrative write, so the audit would not record a re-seed stripping authority | Cascade is semantically tidier and silently destroys authority in a deployed environment |
| **Storing `absolute_expires_at` rather than deriving it** | A configuration change must not retroactively alter live sessions | Deriving from `created_at` is simpler but makes the governing value mutable after the fact |

### Tracked risk, not waived

**Register entry 4 — desktop and tablet layouts have never been validated by the client — is
escalated by this feature more than by any before it.** The admin product is desk work, so it lives
predominantly in the width band nobody has ever reviewed, and the only approved visual reference in
this project is a mobile-only 390×844 prototype frame.

This is Principle IV's gate passing on *compliance* while the *design* is unreviewed, and 008 proved
the distinction is not academic: the first human to look at a dialog found it in the top-left corner
having passed 135 e2e tests, five review agents and CodeRabbit. Mitigation is scenario 8 of the
quickstart plus extending `e2e/responsive.spec.ts`'s position assertions — **and neither substitutes
for the owner looking at it.**

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1. **No new violation.** Three things the design changed for the better:

- **Principle V** is satisfied by *subtraction* — the admin client needs no device capability, so no
  eighth is added and `substitution.test.ts` is untouched. Recorded because quietly adding one is the
  failure mode Principle V's own history warns about.
- **Principle VI**'s absence became structural rather than configured, by separating the app (R1).
- **Principle VIII** gained three *distinct* deletion rules where a single rule would have been
  wrong: cascade (resolutions), pseudonymise-plus-clock (audit), deactivate-plus-clock (operators).

**One design decision is worth a reviewer's attention**: `/admin/conferences/:eventId/organizers`
declares an event parameter, so `event-scope-audit` will examine it and demand `requireEventAccess`
— which it must **not** have, because the caller is a platform operator who is not registered for
that conference and would fail that guard correctly. It needs an explicit allow-list entry with the
reason written down, and it is the one path where two audits disagree.

## Next

`/speckit-tasks` to generate `tasks.md`. Suggest `/clear` first — the plan, research, data model and
contracts now carry the context that this conversation was holding.
