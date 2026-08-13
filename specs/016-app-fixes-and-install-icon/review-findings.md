# 016 — deep review findings

**Feature**: App fixes, mutual card exchange, and the install icon
**Branch**: `feat/016-app-fixes-and-install-icon`
**Reviewed**: 2026-08-12

---

## Stage 1 — spec compliance: **53/54 — NOT 100%**

**This corrects the figure this review first recorded.** The initial pass — and the pass before it —
reported 100%. Both verified that every FR was **cited** in code. Neither verified that the citation
was **true**, and for one requirement it is not.

**FR-1052 is materially unmet.** It requires *every* comment, docblock and header explaining card
behaviour by the one-directional rule to be rewritten. Five files still state that rule as current
fact — see finding **T6** below. It scored as compliant because the files that *were* rewritten cite
it, which is precisely the hole a citation-presence check leaves.

The lesson is the transferable part: **a requirement whose subject is prose cannot be verified by
grepping for its own number.** The number appears wherever the work was done and nowhere it was
missed, so the check is brightest exactly where it is blindest.

| | Result |
|---|---|
| Functional requirements | **53/54** — FR-1052 unmet |
| Success criteria | **11/11** |

**53 of the 54 FRs are cited in code.** The one that is not is **FR-1048** — *"the weight of every
changed install asset MUST be recorded in a durable place"* — which is discharged in
`plan.md` under *Install-asset weights*. That is what the requirement asks for: a durable place, not
a code path. Recording it as a gap would be reading the requirement wrongly.

**Two success criteria are deliberately not traceable to code, and both are correct.**
**SC-1009** — *"the home-screen icon … judged by a person looking at it"* — is human-only by its own
wording and is task **T068**. **SC-1011** — the ten correctness gates plus the brand audit — is
discharged by the `pnpm verify` pipeline and `scripts/brand-audit.mjs`, which checks the recorded
3.23× upscale for **equality** rather than as a ceiling, so a second upscale still fails.

Five requirements were implemented but uncited when this review began (FR-1006, FR-1046, FR-1047,
FR-1048, FR-1052); citations were added and are present now.

---

## Stage 2 — deep review

Five perspectives. **Correctness** ran first, in an earlier session, and found the three defects
below. The remaining four were dispatched afterwards and their findings are recorded beneath.

### Correctness — 3 findings, all fixed

#### C1 — CRITICAL: `shareCard` deadlocked when both attendees shared at the same moment

Each insert locks its own key in the `(sharer_id, recipient_id)` unique index, so A→B and B→A issued
concurrently took the two locks in **opposite orders** and PostgreSQL aborted one with **40P01**. One
attendee's share answered 500. The specification names this exact case as one that must succeed both
ways.

**Fixed** in `apps/api/src/db/queries/cards.ts` by sorting the pair before writing, so both
transactions take the same locks in the same order.

**Proven both ways**: `apps/api/tests/integration/cards-concurrency.test.ts` fails with
`deadlock detected` when the sort is removed, and passes with it.

#### C2 — IMPORTANT: the install prompt flipped its guidance mid-dialog

`WebInstallService.#prompt()` cleared the deferred event and announced **before** awaiting, so
subscribers saw `promptToInstall: null` while the system dialog was still open — and
`InstallGuidance` renders the manual iOS steps in that case. A Chromium reader who pressed
"Install MyNet" watched the panel change to "tap the share icon" underneath the dialog.

**Fixed** in `packages/platform/src/web/install.ts`: cleared and announced in a `finally`, plus a
`#prompting` guard, so the port does not depend on callers remembering that `beforeinstallprompt`
may be used once.

#### C3 — IMPORTANT: `Messages.read()` had no sequence guard (FR-1012)

`usePoll` chains its ticks so they never overlap, but `retry()` calls `read` **directly** from a
handler while a tick may be in flight. The slower response won, so a successful retry could be
overwritten by the earlier tick's stale rows.

**Fixed** in `apps/web/src/app/messages/Messages.tsx` with the `issued`/`newest` refs — 006's
`newest`, the same guard `useConversation` carries and documents.

**Regression test added 2026-08-12**, closing the one gap this review left open.
`apps/web/tests/component/conversation-list-refresh.test.tsx` gained *"does not let a tick in flight
overwrite the retry that overtook it (FR-1012)"*, driving the real path — **failure → poll tick in
flight → retry pressed** — with a `racingRepository` double that answers by call number.

The first attempt was written and removed rather than left red: it drove the overlap through two
poll ticks, which **cannot** overlap, so it timed out proving nothing. That is worth recording,
because the shape looks correct and asserts nothing.

**Proven both ways**: with the `sequence !== newest.current` guard removed it fails with the message
describing the defect, and it is the **only** test in that file that fails — so it catches this
defect rather than a side effect.

---

## THE CRITICAL FINDING — and what makes it the most important thing this review produced

**Three of the five perspectives found the same defect independently**, by three different routes:
Production Readiness found the copy, Test Quality found the tests holding it in place, and Test
Quality separately found the comments. That convergence is the strongest signal a multi-agent review
produces — 010's review recorded the same phenomenon and called it the single most useful thing it
found.

### X1 — CRITICAL: the product tells the sharer the exchange did not happen, and two green tests require it to

`apps/web/src/app/network/ShareCardAction.tsx:117` renders, as the confirmation an attendee reads
the instant after sharing:

> Your card is now with {displayName}. They can see your profile in their Network. **You will hold
> theirs when they share it with you.**

The server now writes **both** rows (FR-1021, FR-1022). So the sentence is false at the moment it is
displayed, on the one surface whose stated purpose — in its own header at `:14` — is to *prevent* a
misreading of card direction. It now creates one. The contact then appears in the reader's Network
anyway, which reads as the product acting on its own.

`apps/web/src/app/network/NetworkStates.tsx:154` compounds it, instructing the reader to wait for
something that has already happened: *"theirs will arrive here when they share back."*

**None of these files are in the diff.** `git status` does not list `apps/web/src/app/network/` at
all.

**Two green tests pin the false copy**, which is why no gate caught it:

- `apps/web/tests/component/network-states.test.tsx:104` —
  `expect(confirmation).toHaveTextContent(/you will hold theirs when they share it with you/i)`
- `e2e/network.spec.ts:71` — `toContainText(/you will hold theirs/i)`

Both are titled and commented around *"nothing came back"*, a property C1 retracted. **The suite
makes both claims at once**: the e2e neighbour two screens down correctly asserts that Ada now holds
Grace's card.

**Why every gate passed.** FR-1052's scope is *"every comment, docblock and header"* — it does not
reach product copy. So the implementation satisfied FR-1052's letter while the screen said the
opposite of the feature's headline requirement, and spec compliance scored 100%. **The requirement
that would have caught this was written one word too narrow**, and the tests that would have caught
it were written against the old model and never revisited.

**Fix**: rewrite the confirmation to state the exchange, rewrite `NetworkStates`' empty state, and
rewrite both assertions **and their titles** — a retitle is not cosmetic here, because
"nothing came back" is the property that must stop being asserted.

---

## Architecture — 0 Critical, 3 Important, 4 Minor

**A1 — Important: the upscale exception measures a hand-maintained second inventory.**
`scripts/brand-audit.mjs` measures upscale against `markScaleFactors()` (`generate-install-icons.mjs:188`),
a literal list of 6 path/size pairs. The pipeline's real inventory is `buildInstallIcons()` (`:309`),
with 7 outputs. **Nothing ties the two together.** Add an `icon-1024.png` at `STANDARD_FILL` and
forget the scale list: it draws at ~6.46× from a 92px master, `scales` never sees it, `MAX_UPSCALE`
stays 3.23, and the audit passes green. FR-1045 requires an upscale outside the exception to fail the
build. **Independently found by Test Quality (T7).** The repo already has the answer pattern:
`deletion-coverage.test.ts` derives expectations from the schema so a new member **fails by
existing**. Fix by deriving the scale table from the pipeline, or asserting the two path sets are
equal.

**A2 — Important: FR-1050's anti-divergence mechanism does not cover the behaviour it was written
for.** The duplicated `PasswordField` is protected by twin tests, and that pair is genuinely
equivalent. But FR-1050 is about the **confirmation**, not the reveal control — and the mismatch
behaviour is implemented three times independently (`SignUp`, `ResetPassword`, `ReplaceCredential`),
each with its own derivation and its own copy of the same string. `password-confirm.test.tsx` imports
only `SignUp`; `apps/admin/tests/component/` has no `ReplaceCredential` test at all.
**The one behaviour FR-1050 names is the one with no cross-product guard**, on the screen that
guards the tier reading the report queue. **Independently found by Test Quality (T5).**

**A3 — Important: `useDisplayed` reaches browser globals that the lint denylist does not name.**
`getComputedStyle` and `MutationObserver` (`useDisplayed.ts:50,54`) are bare window globals. The DOM
set in `packages/config/eslint-plugin-mynet.js:143` lists `document, window, location, history,
navigator, matchMedia, alert, confirm, caches` — neither is there, so nothing is reported. Written as
`window.getComputedStyle(element)` — the identical call — it would error. **The asymmetry inside this
one feature is the point**: US5 was gated on **constitution v5.1.0** because `matchMedia` *is* on the
list. The only difference is which identifiers somebody thought to enumerate. That makes SC-008's
"zero direct platform calls" a count of what the denylist knows rather than of what is true.

**A4 — Minor**: the 007 "seventh capability" comment in `packages/platform/src/index.ts:19` now sits
above `InstallService` rather than `VisibilityService`, so it reads as documenting the wrong entry —
and says "the constitution names six", wrong twice over for that reading.

**A5 — Minor**: `CLAUDE.md` attributes the pipeline-disjointness assertion to `brand-audit.mjs`; it
actually lives in `generate-install-icons.test.mjs:230`, where it is real and non-vacuous. Record
defect, not a coverage gap.

**A6 — Minor**: `WebInstallService` announces only 2 of its 3 state components — neither media query
is subscribed — and its listeners detach when the last subscriber unmounts. **Independently found by
Production Readiness (P-m3)**, which draws the sharper consequence.

**A7 — Minor**: `installed` and `mobile` fall back in **opposite directions** when `matchMedia` is
missing, so the documented "show rather than hide" rule does not hold: `mobile: false` hides the
guidance regardless.

---

## Security — 0 Critical, 1 Important, 2 Minor

**Every guard the brief named as load-bearing is correctly enforced server-side.** The guard is
evaluated once inside `getDb().transaction()` and governs both inserts; FR-1053's discoverability +
verification + two-sided registration join is real and there is only one write path to
`shared_cards`; `requireHeldCard` stayed directional with no `OR`; blocking severs both ways; no new
enumeration oracle (guard failure, nonexistent attendee, malformed uuid, no shared conference and
unverified sharer all land on the same `notFound()`); the contract did not widen; no throttle
threshold changed.

**S1 — Important: the T044 throttle comment misstates what the reciprocal row confers.**
`apps/api/src/auth/throttle.ts:388` argues the doubled row is harmless: *"the second row is the
reciprocal one, and it lands in the sharer's own account — a contact they acquired by their own act…
which harms nobody."*

**The row's subject is the recipient.** `heldCardSelect` deliberately applies no discoverability, no
verification and no registration condition (the three absences are the feature), and the single-card
read serves avatar bytes. So the reciprocal row confers a **permanent, unrecallable, live-resolving**
read of the recipient's profile.

FR-1053's ground — *"the exchange moves **when** a co-attendee sees those fields, not **whether**"* —
holds for the **instant** of sharing. It does not hold for the **duration**: discoverability is
revocable and event-scoped, a held card is neither. Looping `POST /cards` over the directory
therefore converts a revocable publication into a permanent one, and the subject cannot enumerate
who holds their card (`GET /cards/shared` has no client consumer), so the only remedy — blocking —
requires knowing whom to block.

**The comment is the actionable half**: as written it is the sentence a later change would cite to
*raise* the ceiling. Whether the throttle tightens, and whether the residual becomes a register
entry, are owner decisions on ratified text.

**S2 — Minor**: the new confirmation inputs carry `name="confirmPassword"`, putting a second copy of
the credential in the form's native serialization. Latent only — `preventDefault()` is the first
statement of both handlers — but the field has **no** server-side purpose (FR-1019).

**S3 — Minor**: `blockStands` and `exchangePermitted` take no row locks, so under READ COMMITTED a
block or discoverability change committing mid-transaction is not seen. Impact is small (the
read-side filter covers the block case), but C1's licence rests entirely on this guard.

---

## Production readiness — 0 Critical, 4 Important, 5 Minor

**P1 — Important**: the share confirmation copy. **Promoted to X1 above.**

**P2 — Important: the deadlock fix converts a fast abort into an unbounded wait, and nothing bounds
it.** The ordering fix is correct and complete — `shareCard` is the only writer of `shared_cards`,
and the sort is total. But it works by making the loser **wait** on the winner's lock instead of
aborting with 40P01, and the application pool sets **no** `lock_timeout` or `statement_timeout`
(`db/client.ts:22`). `migrate.ts` sets one on a *separate* `max: 1` pool and its own comment says
"not the application pool". Fastify's `requestTimeout` bounds request receipt, not handler execution.
`shareCard` now holds one of ten pool connections across five round trips. Ten stalled shares exhaust
`max: 10` and **the entire API stops serving** — every route shares the pool. The throttle does not
bound this, because ten *different* attendees is enough.

**P3 — Important: `useDisplayed` cannot see a breakpoint change, so FR-1054 fails both ways.**
It observes `attributeFilter: ['class', 'style']`, but the pane's class is the constant
`'hidden min-w-0 tablet:block'` — crossing the `tablet` breakpoint changes the **computed** style
without mutating either attribute, so `measure()` never re-runs. Narrowing a window with a thread
open leaves the poll hammering a hidden list, **verbatim the failure the hook's header says it
exists to prevent**. Rotating a phone into tablet width leaves a visible list frozen, so FR-1054's
"MUST resume" is unmet. An `IntersectionObserver` reports `display: none` as `isIntersecting: false`
and re-fires on resize, staying element-level so Principle V is untouched.

**P4 — Important: `apps/web/public/icons/README.md` is the durable weight record and states four
false things.** Unmodified since 010. It says `assets/brand/logo.png` is *"the **only** input to
every file here… There is no second source"*; gives `generate-brand-assets.mjs` as the regeneration
command, which **no longer writes any of these files**; asserts the plate is navy `#0d1942` when it
is now white; and carries 010's weights. **FR-1048 is therefore unmet in substance** — the durable
record is stale. An operator following it runs a command, sees no change, and concludes the pipeline
is broken.

**P-m1 — Minor**: SC-1002's arithmetic omits a request duration. `schedule()` runs in `.finally`, so
the delay starts when the request *resolves*: worst case is `T_request + interval×1.2 + T_request`.
At a 2s round trip the real worst case is ~16s against a 15s bound — and it would fail looking like
flakiness, which is the exact outcome the spec's own note predicted.

**P-m2 — Minor**: a superseded read resets the failure count. It returns normally rather than
rethrowing, so `usePoll` records success: pressing Retry during an incident drops the backoff from
60s to 10s and clears the staleness notice while the retry itself is still failing.

**P-m3 — Minor**: a captured `beforeinstallprompt` is discarded when the last subscriber unmounts.
`InstallGuidance` renders only on sign-in, so for the whole authenticated session no listener is
attached — and Chromium fires the event once per page load, commonly after engagement heuristics
are met. Result: the event is missed, the mini-infobar is no longer suppressed, and a reader
returning to sign-in sees the **iOS manual steps on a Chromium phone**.

**P-m4 — Minor**: no package script regenerates the install icons. Only `brand:generate` exists, and
it writes none of them.

**P-m5 — Minor**: the white plate widens the manifest colour seam — `background_color` cream behind
a white-plated icon, framed by navy `theme_color`. 010 recorded a navy-vs-navy seam as accepted; this
is materially larger. No gate can see it; belongs on the T068 checklist.

**Clean**: no migrations added (`0009` still the last, schema diffs comment-only); poll teardown
sound; `includeManifestIcons: false` present with correct reasoning; a missing `dist/sw.js` is a
**failure**, not a skip; a declared icon with no file fails; error classification branches on
`error.code`.

---

## Test quality — 1 Critical, 6 Important, 6 Minor

**T1 — Critical**: two green tests pin the false share copy. **Promoted to X1 above.**

**T2 — Important: `composer-bound.test.tsx`'s growth case cannot fail.** `Composer.tsx` overwrites
the height only `if (field.scrollHeight > 0)`, which **jsdom never satisfies**, so
`expect(field.style.height).not.toBe('0px')` passes on `'auto'` — and passes on `''` if the entire
effect is deleted. The e2e only measures the *send control's* box, which is in the viewport whether
or not the field grew. **FR-1001 has no executable assertion anywhere.** Fix by stubbing
`scrollHeight` on the prototype and asserting the height tracks it on type and **shrinks** on clear.

**T3 — Important: `cards-atomicity.test.ts` is meaningful on only ~half of runs.** The trigger keys
on the *recipient*, but `shareCard` writes in **sharer-sorted** order and `attendees.id` is
`defaultRandom()`, re-rolled by every `resetDatabase()`. When `grace.id < ada.id` the failing row is
written **first**, so nothing had been written when the exception raises — **and the test passes
identically against a `shareCard` that never opened a transaction at all.** That is exactly the
"green test that asserts the property is checked while checking nothing" this file's own header warns
against. Fix by keying the trigger on the transaction's own prior write, so the failure is always the
second insert.

**T4 — Important: `cards-share.test.ts`'s reverse-direction idempotency case exercises the refusal
path.** A preceding test switches Grace to another conference and never restores it, so
`exchangePermitted` refuses, the insert loop is skipped, and the 200 comes from the read-back finding
the pre-existing row. **Reciprocal-direction idempotency is untested**: if `recordCard` lost its
`ON CONFLICT … DO NOTHING` on the reciprocal write, this test would stay green.

**T5 — Important**: no `ReplaceCredential` test, and nothing guards that a screen uses
`PasswordField` at all — so a future screen rendering a bare `<input type="password">` defeats
SC-1004. **Corroborates A2.**

**T6 — Important: FR-1052 is materially unmet — five files still explain card behaviour by the
retracted rule.** `ShareCardAction.tsx:14`, `packages/data/src/interfaces/cards.ts:9,94,123`,
`AttendeeProfile.tsx:401`. The API side *was* rewritten; the client package and two web components
were not. **`AttendeeProfile.tsx:401` is worse than stale**: the reason it gives for the scheduling
control — *"they do not become your contact"* — is now false, so the next reader may remove the
control on the strength of it. **This is what makes Stage 1 53/54.**

**T7 — Important**: `markScaleFactors()` drift. **Corroborates A1.**

**T-m8**: `cards-guard.test.ts` claims five indistinguishable refusals and compares four — the
not-registered case is asserted on status only, the one refusal held to the weaker standard.

**T-m9**: the board pipeline's "never upscales" test is now **vacuous** — re-pointed to 16px and 32px
favicons, which can never approach a 300px master, so no implementation change can make it fail.

**T-m10**: install-guidance negative assertions rely on an unguaranteed flush; the chosen sentinel
matches `<body>`, which exists on the first check, so it is a `waitFor` that succeeds immediately
rather than a barrier.

**T-m11**: FR-1018's mismatch rule is untested on `ResetPassword` — the e2e fills the *same* short
value into both fields, so the disabled state it observes comes from the length policy.

**T-m12**: FR-1009's backoff **ceiling** is unasserted — nothing fails if `Math.min(…,
MAX_POLL_INTERVAL_MS)` is dropped and the interval doubles without bound.

**T-m13**: `card-surfaces-absences.test.ts:52` header says seven cards above an eight-element array.

**Checked and sound**: no new `skipIf`/`it.skip`/`todo` anywhere in the diff; every new file is
reached by a configured project; the upscale exception is checked for **equality**, not as a ceiling,
and byte-identical regeneration is asserted two ways; **all six absence tests strip comments before
matching** and their patterns are narrowed with reasoning recorded; the two `password-field.test.tsx`
files are assertion-for-assertion equivalent; poll advances clear the ±20% jitter bound with margin;
`cards-concurrency.test.ts` genuinely races against a 10-connection pool rather than serialising.

---

## Tally

| Perspective | Critical | Important | Minor |
|---|---|---|---|
| Correctness | 1 | 2 | 0 |
| Architecture | 0 | 3 | 4 |
| Security | 0 | 1 | 2 |
| Production readiness | 0 | 4 | 5 |
| Test quality | 1 | 6 | 6 |
| **Total (X1 counted once)** | **2** | **15** | **17** |

**Convergent findings carry the most weight**: the share copy (3 routes, 2 perspectives),
`markScaleFactors` drift (A1/T7), the `PasswordField` screen-level gap (A2/T5), `useDisplayed`
(A3/P3), and the install listener lifetime (A6/P-m3).

---

## Fixes applied — **33 of 33, none deferred**

Closed 2026-08-13 on the owner's instruction to fix all findings, including the three that had been
recorded as needing an owner decision. Verified centrally afterwards: **all ten correctness gates
green**, unit 76/722, component 75/689, integration 123/1016, e2e 160/160, budget 98.1 KB of 150 KB.

### The Critical

**X1/T1 — the share confirmation now states the exchange.** Final copy:

> You and {displayName} have exchanged cards. You can each see the other's profile in Network.

and the contacts empty state:

> Sharing a card is an exchange: share yours with someone and you each hold the other's. Find people
> at your conference in Discover, share your card, and they will appear here.

Both tests that pinned the false sentence were rewritten **and retitled** — "nothing came back" is
the claim that had to stop being asserted, so leaving the title would have left the wrong claim in
place. Both now also assert the old phrasing is **absent**.

**Three files that were never in the diff** are now correct: `ShareCardAction.tsx`,
`NetworkStates.tsx` and `AttendeeProfile.tsx`. The last mattered most —
its justification for the scheduling control (*"they do not become your contact"*) was **false**, so
the next reader could have removed a working control on the strength of it.

**Two consequences found only by fixing it:**

- `e2e/responsive.spec.ts:274` asserted the old phrase and would have failed the responsive sweep
  for a reason having nothing to do with layout. Fixed.
- `specs/008-network-and-appointments/quickstart.md` still described one-directional sharing.
  **Annotated rather than rewritten** — it is also the record of what 008 shipped, and 008's own
  walkthrough has never been completed, so somebody may yet walk it and report the mutual behaviour
  as a defect.

**FR-1055 was added to the specification**, because the requirement that should have caught this was
written one word too narrow. **`apps/web/tests/unit/card-model-record.test.ts` is the new guard**,
and it was verified by **execution against the pre-fix tree**: 8 findings across 5 files before,
0 across 267 files after, with five legitimate historical notes correctly cleared. Its header records
one thing it would **not** have caught (`app.ts:224`, which used none of the canonical phrases), so
its coverage is stated rather than assumed.

### Architecture

- **A1/T7 — closed at the source.** `INSTALL_ICONS` is now one inventory; `buildInstallIcons()` and
  `markScaleFactors()` are both projections of it, and `MAX_UPSCALE` is **derived** rather than
  restated. A new output raises it and fails the equality check **by existing**. Proven by inducing
  it: an added `icon-1024.png` took `MAX_UPSCALE` from 3.228 to 6.456 and the audit failed **naming
  the file**. A coverage assertion covers the remaining escape hatch, placed in both the audit and
  the unit test **because they fail at different moments** — the unit layer needs no build. The
  equality check itself is untouched; only what it is applied to changed.
- **A2/T5 — the gap is closed and FR-1050 is confirmed met.** `ReplaceCredential` derives
  `matches`/`mismatch` identically and its user-facing string is byte-identical.
  `apps/admin/tests/component/replace-credential.test.tsx` is the twin;
  `password-confirm.test.tsx` is parameterised over `SignUp` **and** `ResetPassword`. Two new
  source-level guards assert `type="password"` appears **only** in each product's `PasswordField`,
  so a future screen with a bare input fails — the assertion that scales to screen six.
- **A3 — the denylist was widened and the rule was NOT weakened.** `getComputedStyle`,
  `MutationObserver`, `ResizeObserver`, `IntersectionObserver` and `requestAnimationFrame` added.
  It surfaced exactly **three** violations, all in `useDisplayed.ts` on the same element, resolved
  with **per-line** disables carrying reasons — deliberately not a file-level exemption, so a fourth
  platform call added later still fails.
- **A4, A5, A6, A7 — all fixed.** A5 was fixed by **making the claim true rather than editing the
  claim**: the disjointness check moved into `brand-audit.mjs`, where `CLAUDE.md` already said it
  was.

### Security

- **S1 — the false claim is retracted in place and the limit is tightened.** `freeAttempts` 10 → 5.
  The comment now says what the reciprocal row actually confers, and writes down the arithmetic so
  nobody re-derives it while raising the number — including that **the sustained rate is set by the
  six-minute ceiling, not by `freeAttempts`** (ten an hour either way).
  **A throttle bounds a rate, not a right**, so the residual is recorded in `CLAUDE.md`'s open
  questions rather than treated as closed. An absolute cap on *successful* exchanges needs a
  mechanism `THRESHOLDS` does not have; building one would change ratified throttle semantics.
- **S2** — `name="confirmPassword"` removed from both confirmation fields. No `PasswordField`
  signature change was needed (`name` was already optional).
- **S3 — the lock was taken.** `exchangePermitted` is now a row-returning `SELECT … FOR SHARE`,
  rewritten from `SELECT EXISTS (…)` so the locking clause belongs to the statement rather than a
  sub-select the planner may stop early. **No new ordering hazard**: every lock is *shared*, and
  shared locks do not conflict, so simultaneous exchanges lock in opposite orders and neither waits.
  A note records that a future `FOR UPDATE` here **would** break the pair sort.

### Production readiness

- **P2 — the unbounded wait is bounded.** `lock_timeout: 3s`, `statement_timeout: 10s`,
  `idle_in_transaction_session_timeout: 15s` on the application pool, as startup parameters so they
  hold from the first statement. Checked against the longest *deliberate* lock wait in the suite
  (009's `FOR KEY SHARE`/`FOR UPDATE` serialisation, ~1s — 3s is ~3× that and FR-714 still works).
  `statement_timeout` is deliberately **larger** than `lock_timeout` so a blocked statement fails as
  `55P03`, naming its cause, rather than an anonymous `57014`. A timeout answers **500 with a
  correlation id** and can never be rendered as the reasonless 409 or the uniform 404.
  **`migrate.ts` was updated too** — its header said a request-traffic `lock_timeout` "is a different
  decision nobody has made", and that decision has now been made. The two headers now read as two
  decisions: a migration prefers to **abort loudly**, a request to **fail one caller fast**.
- **P3 — `ResizeObserver`, not `IntersectionObserver`.** IntersectionObserver's default root is the
  **viewport** — the exact coupling this hook exists to forbid — and it would also pause the refresh
  for a list merely scrolled out of view. A `display: none` element has no box, so entering that
  state is a size change.
- **P4** — `apps/web/public/icons/README.md` rewritten with both sources, the correct regeneration
  command, the white plate **and its argument**, the named exception, and **re-measured** weights
  (`stat`, not estimates): the install set is **35,038 bytes** against 010's recorded 80,748.
- **P-m1, P-m2, P-m4, P-m5** — all fixed. P-m2 introduced `POLL_SUPERSEDED`; **FR-1012's screen
  guarantee is intact**, the sentinel throw standing exactly where the `return` stood, after the same
  guard, with no write between.

### Test quality

- **T2 — FR-1001 now has an executable assertion**, and the fix is better than the one proposed. A
  content-only `scrollHeight` stub cannot catch removal of the `height = 'auto'` reset, because it
  never reports the already-set height. The stub reproduces the browser's actual rule
  (`scrollHeight ≥ the element's own set height`), so three cases fail distinctly: effect deleted,
  reset deleted, or intact.
- **T3 — the atomicity test is order-independent and asserts its own precondition.** The trigger
  raises only when the opposite-direction row for the pair already exists, which inside one
  transaction can only be its own uncommitted first insert. **A sequence counts insert attempts and
  is not rolled back**, so both failure cases assert two attempts were made — a single attempt would
  make the case vacuous, and now says so.
- **T4, T-m8** — the leaked conference switch is restored in a `finally`, and the registration case
  is folded into the FR-1028 body comparison, making it genuinely five. Throttle counters across
  every other file were checked against the new allowance of 5; only `cards-guard.test.ts` exceeded
  it, and it is fixed.
- **T-m9, T-m10, T-m11, T-m12, T-m13** — all fixed. T-m9's vacuous test now derives its subjects
  from `buildAssets()` and carries a self-power assertion.

---

## What is outstanding

**T067 and T068 — the by-hand `quickstart.md` walkthroughs.** They need a person, and T068 needs a
physical phone. **SC-1001 and SC-1009 are explicitly not machine-checkable**, and this feature exists
because a person found what the gates could not.
