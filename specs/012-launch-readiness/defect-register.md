# 012 — The Defect Register (SC-1208, FR-1130, FR-1132)

**The count SC-1208 requires**: total found ___, fixed ___, recorded as decisions (FR-1131) ___,
remaining unfixed **(must be zero at close, excluding decisions)** ___. Seeded defects (FR-1127):
planted 3, found by the walker ___ — **a miss voids the walk**.

One row per defect. `Class` is `defect` (fix it — FR-1130) or `decision` (record it in
`decisions.md`, do not fix — FR-1131). Every fixed defect names its fixing commit and the
re-walk row in `walk-record.md` (FR-1133). A seeded defect is marked `seeded` when revealed
(T089) — before the reveal it looks like any other row, which is the point.

| # | Found by step | Surface | What was observed | Class | Fixed in | Re-walked |
|---|---|---|---|---|---|---|
| DR-1 | A2 | apps/admin error classification | Deleting the session cookie left every page saying "MyNet could not be reached… try again when you have a connection" — an ended session misreported as connectivity. Root cause: `NotAuthenticatedError`/`SessionExpiredError` extend `Error`, invisible to the `instanceof RequestRefusedError` gate; the `not_authenticated` switch case was dead code for a real 401. | defect | classify() handles the two transport-minted classes first + regression test (feat/012-walk) | re-walked pass (A2 row 2) |
| DR-2 | A4 | POST /admin/conferences/:id/organizers + PromoteDialog | Promotion unusable: the form demanded an attendee UUID no administrative surface can show (there is deliberately no attendee directory, FR-973), every real attempt 400'd, and the refusal rendered as the generic sentence. | defect | route accepts email as the identifier form (blind in-transaction resolve; unknown address = the same indistinguishable 404; exactly one form per request), dialog asks for the email; integration tests incl. the oracle assertion | re-walked pass (A4 row 2) |
| DR-3 | A4 | PromoteDialog | A failed attempt's address and error banner survived close and reopen into a different conference's dialog. | defect | dialog keyed by conference at the render site — every opening mounts fresh | re-walked pass (A4 row 2) |
| DR-4 | A2 | environment (not product) | First sign-in attempts refused with a cannot-connect message. Server logs: no request arrived; the window coincided with the seeded build's deploy/restart. | not-a-defect (recorded) | — | — |
| DR-5 | A4 (round 2) | PromoteDialog | The deliberate indistinguishable-404 rendered as "That is no longer available. Reload…" — misleading for the likeliest cause (address not registered for THIS conference; the walker had picked one Grace is not registered for, so the product was right and the sentence unhelpful). Garbage input also reached the server's schema refusal and rendered generically. | defect | promotion-specific refusal sentence naming the possibilities without narrowing them (server still answers one 404); the Promote control stays disabled until the value is email-shaped | re-walked pass after tab reload (A4 row 2) |
