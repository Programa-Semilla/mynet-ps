# Implementation Plan: 012 — Launch Readiness

**Branch**: `spec/012-launch-readiness` | **Date**: 2026-08-16 | **Spec**: [spec.md](./spec.md)
**Constitution**: v5.4.0 | **Research**: [research.md](./research.md)

## Summary

Discharge the by-hand validation backlog — **122 scenarios across 13 features, 74 outstanding** —
as one consolidated script walked against deployed UAT on four device classes, fix every defect it
finds, and close six defects Phase 0 already found before the walk starts.

**Production is not in this feature.** Split out; the roadmap is annotated.

**Phase 0 changed the shape of the work.** It was expected to size five unknowns. It instead found
that Safari users cannot open Messages, that backups have never run on UAT, that nine e2e tests have
never run in CI, and that this specification contained an instance of the very defect class one of
its own requirements exists to catch. **Roughly half this feature is now repair that precedes the
walk rather than follows it.**

## Technical Context

**Language/Version**: TypeScript 5.x — React 19 client, Fastify API, Node 22
**Primary Dependencies**: no new runtime dependency. Playwright gains two browser engines.
**Storage**: PostgreSQL 17 (no schema change), IndexedDB client-side (no shape change)
**Testing**: Vitest (unit/component/integration), Playwright (e2e, becoming three engines)
**Target Platform**: deployed UAT — `mynet-dev.programasemilla.com` and `admin.mynet-dev.programasemilla.com`
**Project Type**: web — two client applications, one API, one deployment platform
**Performance Goals**: unchanged. No requirement here moves a performance target.
**Constraints**: the walk runs against the deployed build (FR-1120a); the CI job count must stay at
10 (FR-1147); the extra engines must not break `pnpm verify`'s claim that everything the pipeline
gates on can be run locally.
**Scale/Scope**: 74 outstanding walk units, ~16 seam candidates, 4 device classes, 2 products,
3 widths, 3 browser engines. **Defect count from the walk is unknown by construction** (FR-1130).

## Constitution Check

*GATE: passed before Phase 0. Re-evaluated after Phase 0 below.*

| Principle | Status |
|---|---|
| **III — attendee experience first** | Pass. No actor gains a capability. The walk covers all three actors; repairs are defect fixes. |
| **IV — accessibility and responsiveness** | Pass, and this feature is where it is finally *verified*. FR-1124 screen-reader pass; FR-1121 three widths on real viewports; v5.4.0 R3 ratified layouts nobody had seen. |
| **V — abstraction before platform** | Pass. No feature code gains a browser API call. `getCurrent`'s reclassification is a composition-root change. |
| **VI — web-first** | Pass. No Capacitor trigger fires. |
| **VII — verified on Linux CI** | **Strengthened.** FR-1147 brings nine orphaned tests in; FR-1144 adds two engines; FR-1146 fixes two assertions that could never fail. |
| **VIII — attendee data is personal data** | **Strengthened.** FR-1140 closes an offline disclosure; FR-1149 closes a cross-prefix write. |
| **IX — every feature declares its completeness** | Pass. Feature Declarations complete; the Offline row was **wrong twice and is now corrected** — see below. |

### Post-Phase-0 re-evaluation

**One row failed and is fixed.** The Offline behaviour declaration said "unchanged, no new
`passThrough` member". Any fix closing SC-1207 falsifies it — **an FR-1140a instance inside the
specification that requirement lives in.** Corrected to state what actually changes and what it
costs.

**One decision is recorded rather than taken silently, per FR-1131.** Closing SC-1207 means an
offline cold start can no longer resolve an identity, so *"arrive at the venue with no signal, open
MyNet, read the programme"* stops working. **This narrows the field reading of FR-215.** Owner
decision, 2026-08-16.

**No amendment is required by anything in this plan.** FR-1143's Q&A decision *may* require one, and
recording the decision is in scope while drafting the amendment is not.

## Project Structure

```text
specs/012-launch-readiness/
├── spec.md              # revised twice: after independent review, and after Phase 0
├── research.md          # Phase 0 — five parallel agents
├── plan.md              # this file
├── data-model.md        # "none, because…" — no schema
├── contracts/README.md  # "none, because…" — no route or contract change
├── quickstart.md        # THE DELIVERABLE — the consolidated launch script
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks output
```

**`quickstart.md` is not a by-product here — it is the feature.** For every other feature it is a
validation guide written alongside the work. For 012 the consolidated script *is* the work, derived
from R1's inventory.

## Phases

Sequencing is **forced**, not chosen. Everything in A gates the walk.

### Phase A — Unblock and repair *(before any walking)*

| Item | Requirement | Note |
|---|---|---|
| Operator identities without destroying attendees | FR-1102 | Additive command; narrow the table-wide self-check to the rows inserted |
| Correct the false claim in **four** files | FR-1102a | Plus the FR-902 → FR-901 mis-citation |
| Document the two undocumented re-seed consequences | FR-1102b | Credential reset; audit-trail destruction |
| Re-seed UAT, issue a credential, log it | FR-1100/1101/1103 | Destroys 4 disposable accounts |
| **Backups actually work; restore exercised on the host** | FR-1148 | Governance breach today; two scenarios fail at step 1 without it |
| **Messages loads in WebKit** | FR-1145 | Safari users cannot open Messages |
| Three Playwright engines, sweep-only | FR-1144 | Guard the `CAPTURE_SCREENSHOTS` ternary; `deviceScaleFactor: 1` |
| Nine orphaned e2e tests into CI | FR-1147 | Job count stays at 10 |
| Two latent false-greens | FR-1146 | Wrong on Chromium too |
| `getCurrent` → `passThrough`; `forget()` on expiry | FR-1140/1140a/1149 | Restructure `agenda-offline.spec.ts` in the same change |
| `listRegistered` completeness guard | FR-1141 | Name the accidental `contract.ts` guard before relying on it |

### Phase B — Derive the script

Enumerate every scenario (not by heading shape — that is what hid 006), map to journeys, retire the
~9 machine-covered, **rewrite the 3 carrying false expectations**, pick one width triple and record
why, and add the seam steps no per-feature walk could contain. Output: `quickstart.md`.

### Phase C — Walk it

Four device classes, two products, three widths, deployed UAT. Observations not verdicts; captures
for every layout and install step; **three seeded defects planted by somebody else** — a miss voids
the walk.

### Phase D — Fix and re-walk

Every defect fixed; findings needing a decision recorded instead; each fix traced to its step and
its step re-walked.

### Phase E — The two decisions

Q&A at launch (FR-1143) and the client diagnostic channel (FR-1142). Recorded in a durable artifact;
the feature is not complete while either is unrecorded.

## Complexity Tracking

**This feature is larger than its specification implies, and the reason is stated rather than
absorbed.** Nine items were scoped; Phase 0 added six repairs and one decision. The unknown
(FR-1130's defect count) sits next to fifteen knowns.

**Accepted by the owner**: if the walk surfaces something large, the feature grows rather than the
known items being quietly trimmed.

**The PR split is the open planning question.** Phase A is independently reviewable and independently
valuable — it fixes a governance breach and a production defect whether or not the walk ever
happens. Phases B–D are one unit. Phase E is neither.

## Open Questions for `/speckit-tasks`

- **How does this split into PRs?** Natural seam: A / B+C+D / E. Worth `speckit-spex-collab-phase-split`.
- **Who plants FR-1127's seeded defects?** The assumption most likely to fail — it needs a second
  person, and the substitute (10% spot-check) has the same prerequisite.
- **What artifact records a completed walk?** Register entry 4 was closed *without* an acceptance
  act, so there is no precedent. Naming a format is a planning decision, not a spec one.
- **Does the WebKit Messages fix block the walk, or run beside it?** It is in Phase A, but if the
  diagnosis is long the walk could start on Chromium and Firefox.
