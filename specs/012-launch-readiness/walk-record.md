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
| A1 | First sign-in forces a credential of the operator's own | Replacement password demanded before any administrative surface rendered; reveal control present and working; after replacing, the admin home rendered. | pass |  |
| A2 | Two independent sessions | MyNet sign-in first refused with a cannot-connect message — server logs show NO request arrived and the window coincided with the seeded build's deploy/restart, so recorded as environment, not defect. Admin session survived MyNet sign-out. After deleting the admin cookie by hand, every page said 'MyNet could not be reached. Nothing was changed — try again when you have a connection' — an ended session misreported as connectivity (defect DR-1, fixed). FAIL on the third assertion; re-walk after redeploy. | fail |  |
| A2 | Two independent sessions — RE-WALK after DR-1's fix | Deleting the admin cookie now renders 'Your administrative session has ended. Sign in again to continue' — distinguishable from a failed sign-in, as required. | pass | |
| A3 | The empty report queue is a state, not an error | Explicit nothing-here empty state at /reports; nothing rendered as a fault. | pass |  |
| A4 | Promotion | Promotion failed on every attempt with the generic 'Something went wrong' — the form demanded a UUID under the label 'Attendee identifier', which no administrative surface can ever show an operator (defect DR-2); a closed errored dialog kept the typed address and banner when reopened for ANOTHER conference (defect DR-3). Both fixed; re-walk after redeploy. | fail |  |
| A4 | Promotion — RE-WALK after DR-2/DR-3/DR-5 | Promotion by email succeeded on Product & Design Summit (204; assignment live in the database). Attempts (2)/(3) both hit Frontend Horizons — server logs show two 404s on its id — so the refusals were FR-930 being right about an unregistered attendee, not a defect; the dialog title names the conference and the walker had the wrong row. Dialog opens clean every time. The 409 duplicate-promotion sentence and DR-5's new 404 sentence render from the current bundle after a tab reload (the open SPA tab was running the pre-fix bundle; index.html is no-cache, assets immutable — browser behaviour, not a header defect). | pass | |
| A5 | The tier boundary is real | Signed in at the admin host as the promoted organizer: navigation shows Overview and Conferences only — no report-queue entry. Direct /reports answers the indistinguishable refusal sentence; nothing confirms the queue exists. | pass |  |
| A6 | No route acts on a person | Surfaces enumerated as organizer and as operator: no control anywhere suspends, removes, mutes or edits an attendee or profile. | pass |  |
| A7 | Refusals are indistinguishable | A wrong password for a real operator and an unknown address produced identical refusals. | pass |  |
| B1 | Promotion changed nothing observable in MyNet | Promoted organizer walked all five MyNet destinations: no admin affordance, no privileged view, nothing observable changed. | pass |  |
| B2 | Seam S8: a conference from zero | Conference created from zero as the organizer (decision 47's first real exercise): 'Grace Conference 2', 2 tracks, 2 rooms, 2 speakers, 3 sessions (fewer than the scripted 6 — sufficient for every downstream step), one optional with capacity 2; join code issued; every authoring edit crossed a real browser's CORS preflight cleanly (seam S13). Duplicate-promotion 409 initially rendered the generic sentence while the server wrote the specific one — DR-6, fixed. | pass |  |
| B3 | A real attendee joins from nothing | Real attendee joined by code and arrived at the conference; sign-up + verification half was already proven live (OPERATIONS-LOG, T006). | pass |  |
| B4 | Content is live-edited | A session's summary edited as the organizer appeared on the attendee's next read of the panel — no draft state, no publish step. (First attempt edited the CONFERENCE, whose form is name-only by design; the conference name updated only after a full reload — recorded as an observation: the active conference resolves once per session and content reads refresh on navigation.) | pass |  |
| B5 | The second notification trigger, coalesced | Walked three times, and the failures taught more than a first-try pass would have. Round 1: silence — correct, the only saved session's material edits predated the save. Round 2: server dispatched (delivered:1) into a subscription created in a discarded/incognito window; the follow-up message push got FCM 410 and the server DISCARDED the dead subscription — the designed dead-vs-failing asymmetry observed live. Round 3, fresh subscription in a persistent profile: ONE organizer act changing room AND start time produced ONE notification ('session moved'); activating it landed on the session itself — the surface carrying the marker, never a list; the per-row marker was present before activation and cleared after (markViewed working); no view anywhere shows a count of changes. | pass |  |
| B6 | Cancellation, and the one surface that omits it | | pending |  |
| B7 | Delete is fenced by engagement | | pending |  |
| B8 | Full and closed are different sentences | Optional session (capacity 2) filled by two attendees; the third attempt's refusal said the session is FULL — the sentence 'closed' did not appear. (The closed sentence needs the closing offset to pass; the full/closed mutual difference is machine-asserted, and the walk confirmed the full half renders.) | pass |  |
| B9 | The roster, and what it must not show | | pending |  |
| B10 | A virtual conference | Virtual modality with an https access link renders the link where a room would be on the attendee side; an http link is refused at authoring. | pass |  |
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
