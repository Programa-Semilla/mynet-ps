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
