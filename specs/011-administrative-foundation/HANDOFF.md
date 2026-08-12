# 011 — implementation handoff

**Resumed and completed 2026-08-11.** Nothing is committed; the branch
`spec/011-administrative-product` carries 011's spec commits and an uncommitted working tree.

Everything a machine can check is done. **What remains is T158 and T159 — the by-hand
`quickstart.md` walk — which need a person and a phone.**

---

## Phase 9 — the deep review's deferred findings were closed, not carried (2026-08-11)

`review-findings.md` deferred nine Important findings on the ground that each needed a design or
product decision. They were taken to the owner as an explicit decision round. **Eight are fixed and
one is accepted with recorded reasoning**; the four test-coverage gaps are closed too. T160–T171 in
`tasks.md`, outcome table in `review-findings.md` under "Post-review pass".

**The review's framing of four of them was wrong, and that is the part worth carrying forward.**
Findings 1, 2, 3 and 5 were listed separately. They are one defect: **four functions whose emphatic
headers described call relationships that did not exist** — `appendAuditEntry` claiming every write
path passed a transaction when none did, `assertVerifiedOperator` claiming query-layer placement
while being called nowhere, `addressTakenByOtherPrincipal` claiming to run inside the caller's
transaction while being called only by tests, and three helpers whose headers named callers that
were inlined copies instead. In a codebase whose discipline is that the comment is the record, that
is systemic. It also made the fixes **cheaper** than the review estimated: three of the four already
had the executor parameter, so the work was wiring rather than design.

**Two things a later reader should not re-derive:**

- **The helpers could not be deleted.** `audit-append-only.test.ts` asserts
  `pseudonymiseAuditEntriesFor` *exists* and pins the permitted-mutation list at exactly two names.
  Deleting it breaks a guard and moves a retention operation out of the module that owns it. They
  were called instead — which removes the duplication the finding was actually about.
- **`0009` was regenerated, and that was safe exactly once.** It had reached no database. The diff
  against the previous file is two `CREATE INDEX` lines and a later `when`. `lock_timeout` went into
  `migrate.ts` rather than the SQL, because a regeneration erases hand edits — and putting it on the
  connection covers every migration, including `0003`'s recorded unclaimed defect.

**One new finding came out of it**, from writing the audit sweep's first behavioural test: the
window is measured from `occurred_at` while two comments claim it runs from pseudonymisation, so the
accountability record for a *recent* erasure is swept immediately. Recorded as `deviations.md` D11,
not fixed — the fix is a `pseudonymised_at` column and therefore a decision about the retention rule.

---

## Task accounting

| State | Count |
|---|---|
| Complete `[X]` | 165 |
| Documented deviation `[~]` | 6 |
| Open `[ ]` | 2 (T158, T159 — both need a person) |

`tasks.md` is the record; `deviations.md` explains every `[~]` and every departure.

## Gate status — all green, 2026-08-11

| Gate | Result |
|---|---|
| `pnpm typecheck` | ✅ 6 projects |
| `pnpm lint` · `pnpm format:check` | ✅ |
| `pnpm test:unit` | ✅ 60 files |
| `pnpm test:component` | ✅ 62 files |
| `pnpm contract:check` | ✅ up to date |
| `pnpm test:integration` | ✅ 114 files, 958 tests |
| `pnpm build` + budget + brand audit | ✅ |
| `pnpm test:e2e` | ✅ 156 passed |
| `pnpm test:a11y` | ✅ 34 passed (now covers both products) |

`pnpm verify` exits 0. The first full run failed on one 007 spec — a latent one-shot-`count()`
race in `messages-journey.spec.ts`, where the failure screenshot showed the conversation **on
screen** while the count had already returned zero. Fixed in the assertion, claim untouched, and
recorded in `guard-amendments.md`.

---

## What the resumed session actually found

The previous pause recorded "~30 open, mostly the remaining test files" and one red e2e test
attributed to harness flakiness. **Both readings were wrong**, and the corrections are the useful
part of this handoff.

### 1. Most "open" tasks were already done, and two "done" ones were not

Eighteen test files had been consolidated into ten, with only one task ticked per file — so
twenty-odd tasks read as open while their assertions existed. `tasks.md` now names the covering
file on every consolidated entry (`deviations.md` D6).

Checking each open task's *requirement* against the source rather than against the checkbox found
**two tasks marked complete whose assertions did not exist anywhere**:

- **T050 (FR-919a, FR-919b)** — neither administrative session bound was tested at all. The file
  whose header claimed T050 never covered it. This is the serious one: `absolute_expires_at`
  exists solely to stop a session in constant use living forever, and advancing it in
  `resolveAdminSession`'s `set` clause — one word, beside the `idleExpiresAt` that *is* advanced
  there correctly — makes the eight-hour cap infinite. **Mutation-tested**: that exact change now
  fails the new assertion and nothing else in the file.
- **T113 (FR-934)** — demotion's two halves were unasserted. The existing test checked the
  assignment row was revoked, which is neither half of the requirement.

### 2. The red e2e test was a product defect, not the harness

**FR-992's forced credential replacement could not be reached at all.** Sign-in succeeded, the
client called `/admin/me`, `requireOperator` correctly answered `credential_not_replaced` 403 —
and `session.tsx` classified every failure as signed-out and rendered the sign-in form again. The
operator was returned to the screen they had just used correctly, forever. The provider was reading
`identity.credentialIsInitial` from a **successful** `/admin/me`, a response the server cannot
produce.

It survived every gate because the component test substituted `session.me()` and had it resolve
with that impossible shape. Full write-up in `deviations.md` D8, along with **three harness
defects** underneath it — including one where a leaked detached API from an interrupted run held
port 3000, the new child died with `EADDRINUSE`, and the health poll was answered by the stale
server, so **a whole suite could run against a process started from different code and report
success**.

### 3. The administrative site was never wired into the deployment

The Caddyfile served `admin.{$APP_DOMAIN}` from `/srv/admin` and its own comment claimed
`deploy.sh` placed it. Nothing built it, nothing synced it, nothing mounted it, and `--delete`
had no exclude for it. MyNet would have deployed perfectly with the administrative host answering
404, and no check in the runbook looks at that host. Fixed and documented (`deviations.md` D7).

### 4. The administrative rail failed AA

`bg-coral-500` behind `text-inverse` is 3.27:1. `tokens.css` describes this exact mistake where it
splits the accent in two — and MyNet's accessibility scan never visits the administrative origin,
so the guard was real and the new product sat outside it. Now `coral-600`, 5.04:1
(`deviations.md` D9).

---

## Records to read before reviewing

- **`deviations.md`** — D1–D9. D6–D9 are new and are where the findings above are written up.
- **`guard-amendments.md`** — every existing test 011 touched, and why. Three of the five named
  guards plus the notification-trigger audit are byte-unchanged.
- **`quickstart.md`** — now carries the **measured** SC-900 timing (median 373 ms) with its method,
  and the corrected gate command (`pnpm test:a11y`, not `test:accessibility`).

---

## What a reviewer should be most sceptical about

- **The consolidation.** Ten files carry eighteen tasks' assertions. The mapping is written into
  `tasks.md`, but it is the thing most likely to hide a gap — two were found this way already.
- **`identity.credentialIsInitial` on `GET /admin/me` is dead code.** The guard refuses before the
  handler runs whenever it is true. It is left in place because the contract is committed; it
  should probably be removed deliberately rather than left to look meaningful.
- **T158/T159 have not been walked**, and every feature since 007 has shipped without walking its
  equivalent. 008's experience is the argument for doing it: the first person to look found a
  dialog in the top-left corner that had passed every gate.
