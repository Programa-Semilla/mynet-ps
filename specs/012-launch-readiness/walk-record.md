# 012 — The Walk Record (SC-1203, FR-1125, FR-1126)

**Status**: `in-progress` — set to `complete` only when no row reads `pending`; the
`walk-record-audit` gate enforces the rest from that moment.

| Field | Value |
|---|---|
| Deployed base commit | `659fa94` (develop, PR #31), hand-deployed 2026-08-17 per D-012-4 |
| Seed patch (FR-1127) | `seed-patch-012-walk-A.diff` (sha256 733d891288d79005…), 3 seeds — one layout, one copy, one refusal — planted 2026-08-17, deployed atop `659fa94`; patch held OUT of git until the T089 reveal |
| Walker | Danny Pérez (owner) |
| Defect planter (T059) | the 012 implementation session (Claude) — not the walker; contents unknown to the walker until the reveal |
| Devices | *(each width: real viewport or emulated-with-reason, FR-1121)* |
| Dates | walk started 2026-08-17 |

**A row is recorded when it carries an observation — what was actually on the screen — never a
verdict alone.** `pass/fail` values: `pending`, `pass`, `fail`, `blocked`, `n/a` (with reason in
the observation). Every D-part row (layout/install) must name a capture file that exists in
`captures/`. Defects found go to `defect-register.md`, and the fixing commit re-walks the step
(FR-1133) — append a second row for the re-walk rather than overwriting the first.

| Step | Subject | Observation | Pass/fail | Capture |
|---|---|---|---|---|
| A1 | First sign-in forces a credential of the operator's own | | pending |  |
| A2 | Two independent sessions | | pending |  |
| A3 | The empty report queue is a state, not an error | | pending |  |
| A4 | Promotion | | pending |  |
| A5 | The tier boundary is real | | pending |  |
| A6 | No route acts on a person | | pending |  |
| A7 | Refusals are indistinguishable | | pending |  |
| B1 | Promotion changed nothing observable in MyNet | | pending |  |
| B2 | Seam S8: a conference from zero | | pending |  |
| B3 | A real attendee joins from nothing | | pending |  |
| B4 | Content is live-edited | | pending |  |
| B5 | The second notification trigger, coalesced | | pending |  |
| B6 | Cancellation, and the one surface that omits it | | pending |  |
| B7 | Delete is fenced by engagement | | pending |  |
| B8 | Full and closed are different sentences | | pending |  |
| B9 | The roster, and what it must not show | | pending |  |
| B10 | A virtual conference | | pending |  |
| C1 | The five destinations, including every empty state | | pending |  |
| C2 | Build an agenda; the panel; notes | | pending |  |
| C3 | Discover narrows and respects visibility | | pending |  |
| C4 | The unverified account is a complete product | | pending |  |
| C5 | The mutual exchange, and its sentence | | pending |  |
| C6 | Messages | | pending |  |
| C7 | Push, both answers | | pending |  |
| C8 | A meeting is scheduled — SC-1201's endpoint | | pending |  |
| C9 | Seam S5: a report crosses three features' surfaces, end to end — never | | pending |  |
| C10 | Blocking severs and lifting restores — except the appointment | | pending |  |
| C11 | Q&A as shipped | | pending |  |
| C12 | Offline, honestly, in session | | pending |  |
| C13 | The offline cold start now refuses — and that is 012's own change | | pending |  |
| C14 | Export, and the account surfaces | | pending |  |
| D1 | MyNet at 390, 768 and 1280 | | pending | (required) |
| D2 | The admin site at 390, 768 and 1280 — never reviewed at any width | | pending | (required) |
| D3 | Every modal, centred | | pending | (required) |
| D4 | The 768–1279 divergence is present and CORRECT | | pending | (required) |
| D5 | Seam S11: one small top bar, five tenants | | pending | (required) |
| D6 | The five authentication screens | | pending | (required) |
| D7 | The tab strip at 16px | | pending | (required) |
| D8 | The physical iPhone | | pending | (required) |
| D9 | The physical Android phone | | pending | (required) |
| D10 | Seam S12: the worker does not annex the admin site | | pending | (required) |
| D11 | Screen reader | | pending | (required) |
| D12 | Zoom and motion | | pending | (required) |
| E1 | Seam S2: delete the person who is everything at once | | pending |  |
