# Deep Review Findings

**Date:** 2026-08-07
**Branch:** spec/004-attendee-identity-and-profile
**Rounds:** 1
**Gate Outcome:** PASS
**Invocation:** manual

## Summary

| Severity  | Found  | Fixed  | Remaining |
| --------- | ------ | ------ | --------- |
| Critical  | 0      | 0      | 0         |
| Important | 11     | 11     | 0         |
| Minor     | 20     | 10     | 10        |
| Notable   | 6      | –      | 6         |
| **Total** | **37** | **21** | **16**    |

**Agents completed:** 5/5 (0 external tools — neither CLI installed)
**Agents failed:** none

42 raw findings merged to 37 after deduplication. Four were reported by more than one agent; the
cache-purge gap was found independently by three.

**Scope reviewed:** 136 changed files, ~30,000 lines (38 API source, 43 API test, 20 web source,
8 web test, 14 package, 5 e2e, 4 migration, 1 contract).

---

## Findings

### FINDING-1

- **Severity:** Important
- **Confidence:** 90
- **File:** apps/web/src/app/services.ts:153, apps/web/src/app/profile/Account.tsx:231-251
- **Category:** correctness / security / production-readiness
- **Source:** correctness-agent (also reported by: security-agent, production-readiness-agent)
- **Round found:** 1
- **Resolution:** fixed (round 1)

**What is wrong:**

`DELETE /account` and `withdrawFromConference` deleted personal data server-side while leaving the
device's IndexedDB copy untouched. `remove()` called `identity.deleteAccount()` then
`markSignedOut()`, which only resets three pieces of React state. The purge lived exclusively in
`purgingOnSignOut`, which decorates `auth.signOut()` — a path account deletion never takes.
Withdrawal was missed for a second, independent reason: `HttpIdentityRepository` is deliberately not
wrapped by `cached`, so the decorator's `purgeConference` never fired for it either.

**Why this matters:**

`WebLocalCache` has no eviction. `write` puts an entry and only `purge` ever removes one; the
24-hour lifetime stops a stale entry being *served* but does not delete the bytes. So after an
account was deleted the device retained, indefinitely, that attendee's programme, saved sessions and
**session notes** — the product's first attendee-authored free text — plus their name and email under
the `anonymous` prefix. The confirmation dialog the attendee reads immediately before confirming
states in bold: *"No copy is kept. There is no grace period and nothing to restore."* On a shared or
lent conference device that sentence was false. FR-365 and FR-366 are the requirements; the fact that
three agents reached this from three different directions is why it is ranked first.

**How it was resolved:**

Added `purgingIdentity` in `services.ts`, decorating the identity repository in the composition root
rather than in components — cache correctness is not feature code's business (Principle V). Deletion
purges both the attendee prefix and the `anonymous` prefix in a `finally`, matching sign-out's
reasoning that a request lost to a flaky connection has still happened. Withdrawal purges only the
conference left, and *after* the request, because a failed withdrawal means the attendee is still
registered and discarding their offline copy would be a loss with nothing gained. Every method is
delegated explicitly rather than spread, per the warning already recorded in that file about
prototype methods being dropped by a spread over a `Proxy`.

---

### FINDING-2

- **Severity:** Important
- **Confidence:** 88
- **File:** apps/api/src/images/avatar.ts:64, apps/api/src/routes/profile.ts:417
- **Category:** production-readiness / security
- **Source:** production-readiness-agent (also reported by: security-agent)
- **Round found:** 1
- **Resolution:** fixed (round 1)

**What is wrong:**

`sharp()` was constructed with only `failOn: 'error'`, leaving `limitInputPixels` at its default of
~268 MP, and `PUT /profile/avatar` had no throttle counter at all — `THROTTLE_ACTIONS` listed five
actions, none of them the avatar.

**Why this matters:**

`maxUploadBytes` and the route's `bodyLimit` bound the *compressed* upload. Compression ratio is
unbounded: a near-uniform PNG or WebP well under 5 MiB can declare 16000×16000 and force libvips to
materialise roughly 1 GB of raw pixels — and because that allocation is native, Node's heap limit
never catches it. `position: 'attention'` additionally runs an entropy analysis over the full
decoded raster. With accounts self-serve and no rate limit on the route, one attendee could issue
these back to back.

**How it was resolved:**

Bounded the decode at 50 MP (`AVATAR_MAX_INPUT_PIXELS`) — still above any camera a person owns, and
over-limit input throws inside the existing `try/catch`, so it is already refused as 415 rather than
becoming a server fault. Deliberately not configurable: unlike `maxUploadBytes`, which is a product
decision about what a person may send, this bounds what the process will allocate, and an operator
raising it has no way to see the trade. Added an `avatar_upload` throttle action; the identifier is
the uploader, so a denial can only ever fall on the person uploading.

---

### FINDING-3

- **Severity:** Important
- **Confidence:** 92
- **File:** apps/api/src/routes/auth/verify.ts:72, apps/api/src/routes/auth/reset.ts:160
- **Category:** security
- **Source:** security-agent
- **Round found:** 1
- **Resolution:** fixed (round 1)

**What is wrong:**

FR-387 names four unauthenticated routes that MUST each be rate-limited: sign-up, verification,
reset request, and reset completion. Two of the four — `POST /auth/verify` and `POST /auth/reset` —
had no throttling of any kind, and no global rate-limit plugin was registered to cover them.

**Why this matters:**

The practical exposure is bounded by the 256-bit tokens, so this is not a feasible guessing path.
But each request performs an unbounded indexed `UPDATE … RETURNING` against the token tables from an
unauthenticated caller, and the requirement is a hard MUST that two of its four named routes did not
meet. No test covered it either.

**How it was resolved:**

Added `verify_token` and `reset_submit` actions. Both key their identifier on the **submitted token**
rather than an address, which is what makes `mayDeny: true` safe here where it is deliberately unsafe
for `reset_request`: a refusal keyed on a token can only fall on somebody holding that token, so
there is no third party for an identifier-keyed denial to harm. Success ends the streak on both, so a
person following a valid link is not throttled by their own success. No migration was needed —
`sign_in_attempts.action` is a plain `text` column with no CHECK constraint or enum type.

---

### FINDING-4

- **Severity:** Important
- **Confidence:** 75
- **File:** apps/api/src/routes/auth/reset.ts:90-113
- **Category:** security
- **Source:** security-agent
- **Round found:** 1
- **Resolution:** fixed (round 1)

**What is wrong:**

`POST /auth/reset-request` answered with an identical status and body regardless of whether the
address existed, but the *elapsed time* differed materially. A known address cost a transaction
(delete plus insert) and an awaited mail send; an unknown address cost one indexed lookup and
returned immediately.

**Why this matters:**

FR-327 requires the response to be identical whether or not an account exists, and the route's own
docblock calls this *"the one non-disclosure guarantee that survives 004."* Once register entry 18 is
answered with a real mail provider, the known branch costs hundreds of milliseconds the unknown
branch does not — a remote, unauthenticated account-existence oracle that matching the body defeats
nothing of. The throttle does not mask it: an enumerator probing distinct addresses spends one
identifier attempt each (delay 0), and the source delay is a constant added to both branches.
`identity-nondisclosure.test.ts` compares status, body and `retry-after` only.

**How it was resolved:**

Added `padElapsedTo` (monotonic `hrtime`, so an NTP step cannot skew it) and padded the branch to a
fixed budget. Sign-in already defends the same attack with a dummy Argon2id verification; this is
that idea where the expensive operation cannot be faked because it needs an account that does not
exist.

The budget is configurable (`AUTH_RESET_BRANCH_BUDGET_MS`, default 600ms) **with a production floor
of 400ms that `loadConfig` refuses to start below**. It is settable only because the integration
suite drives that route several hundred times and paying the real pad tripled the run — from 63s to
183s — for a property `fastify.inject()` cannot observe, since it does not measure elapsed time. The
guarantee is unconditional where it is real; the floor is stated as a refusal rather than a clamp so
a weakened deployment fails loudly instead of running with a value its operator believes is in
effect.

---

### FINDING-5

- **Severity:** Important
- **Confidence:** 80
- **File:** apps/api/src/routes/auth/sign-up.ts:194, apps/api/src/routes/auth/reset.ts:100, apps/api/src/routes/auth/verify.ts:175
- **Category:** production-readiness
- **Source:** production-readiness-agent
- **Round found:** 1
- **Resolution:** fixed (round 1)

**What is wrong:**

Every outbound mail call was `await`ed with no timeout, no retry bound, and no circuit breaker.
`MailService` declares no timeout contract and Fastify was constructed with no `requestTimeout`.

**Why this matters:**

The `try/catch` at each call site implements FR-318a correctly for a promise that *rejects*. It does
nothing for one that never settles, which is the common failure mode of an HTTP mail API behind a
stalled connection. On sign-up the sequence is: account committed, session row written, `Set-Cookie`
staged — then the handler blocks. The web client aborts at 20 seconds, so the browser never receives
the response and never applies the cookie; the attendee retries and meets `409 address_registered`.
That is precisely the outcome the code comment above it says the design prevents. On reset-request a
hang is worse than an inconvenience: it makes latency differ by account existence, which is
FINDING-4's oracle without a bound.

**How it was resolved:**

Added `apps/api/src/mail/dispatch.ts` with `dispatchMail(send, log, what)` — a 5-second bound well
under the client's 20-second abort, with the timer `unref()`ed so it cannot hold the process open at
shutdown and cleared on every path. Applied at all three call sites. The bound lives in a shared
helper rather than in each adapter so the register entry 18 provider, written by somebody who has not
read those routes, cannot ship without one.

---

### FINDING-6

- **Severity:** Important
- **Confidence:** 87
- **File:** apps/web/src/app/auth/SignUp.tsx:29, apps/web/src/app/auth/ResetPassword.tsx:24, apps/web/src/app/profile/ProfileEdit.tsx:24
- **Category:** architecture
- **Source:** architecture-agent
- **Round found:** 1
- **Resolution:** fixed (round 1)

**What is wrong:**

Every validation bound enforced server-side was re-declared as a hand-copied literal on the client.
`PASSWORD_MIN_LENGTH = 12` existed in three files, `PROFILE_LIMITS` in two, avatar bounds in three —
linked only by a comment reading "Mirrors … in apps/api/…", which is an acknowledgement of coupling,
not a mechanism for it.

**Why this matters:**

FR-304 and FR-338 require the confirmation to be **disabled** with the reason stated, *"never a
post-submit error"*, and that disabled state is computed from the client copy. Raise the server bound
without touching both client files and the button enables, the request submits, and the attendee gets
exactly the post-submit 400 those requirements forbid — with nothing failing: the route schema still
validates and each component test asserts against its own copy of the wrong number.

**How it was resolved:**

Added `apps/web/tests/unit/client-limits.test.ts`, which reads `contracts/openapi.json` and holds
each client constant to the published bound. The contract is the right authority: it is generated
from the route schemas, committed, and is what the client is written against — and checking it needs
no dependency from `apps/web` on `apps/api`, which would invert every other edge in the repository.
Verified by mutation (8 vs 12 → red). A shared runtime constants package was considered and rejected:
`apps/api` does not depend on `@mynet/data`, and creating one for three constants is a larger
architectural decision than a review should take unilaterally.

The avatar prose is explicitly **not** covered, as an `it.todo` explains — see REMAINING-1.

---

### FINDING-7

- **Severity:** Important
- **Confidence:** 90
- **File:** packages/data/tests/cached-repository.test.ts:167-210
- **Category:** test-quality
- **Source:** test-quality-agent
- **Round found:** 1
- **Resolution:** fixed (round 1)

**What is wrong:**

004 fixed a real client-side authorization bypass — `isRefusal` was widened from
`RequestRefusedError` to also cover `NotAuthenticatedError` and `SessionExpiredError`, so a 401 now
purges the conference cache and re-throws instead of serving the cached copy. **No test at any layer
asserted the fixed behaviour.** The existing refusal tests throw only `RequestRefusedError` — the
case the code comment itself says "was never the broken case".

**Why this matters:**

The spec names this scenario as an Edge Case: an attendee deletes their account while signed in on a
second device, and that device must not present a signed-in shell. The server side is well covered;
the bug was entirely client-side. Reverting `isRefusal` to its original form would have left the
entire suite green.

**How it was resolved:**

Added two `it.each` cases asserting both that the call rejects rather than resolving from cache, and
that the conference entry is purged. Verified by mutation: narrowing `isRefusal` back turns both red.

---

### FINDING-8

- **Severity:** Important
- **Confidence:** 85
- **File:** apps/api/tests/unit/export-coverage.test.ts:93-138
- **Category:** test-quality
- **Source:** test-quality-agent
- **Round found:** 1
- **Resolution:** fixed (round 1)

**What is wrong:**

The export guard checked that every schema column appeared as a *key* in `EXPORTED_COLUMNS`, but the
mapping's value was only a section name — so nothing checked the column was actually reproduced in
the document. Its docblock claimed *"adding it here without the export producing it fails
`tests/integration/export.test.ts`, which asserts the document's real content."* That claim was
false: that file spot-checks a handful of values with `toMatchObject` and asserts nothing about the
other 25 mapped columns.

**Why this matters:**

A 006 author could satisfy FR-377 by writing one line. Adding `attendee_profiles.linkedin_url →
'profile'` without touching `assembleExport` passed both guards — exactly the "add it to the
allow-list without thought" outcome the guard exists to prevent, defeating SC-305's "100% of the
fields the product stores".

**How it was resolved:**

Changed the mapping value to `{ section, field }` and added an integration assertion that walks it
against a real, fully-populated export, requiring each named field to be present, with a non-vacuity
floor. Extracted the map to `apps/api/tests/support/export-columns.ts` — a plain module rather than a
cross-import between two test files, which would have registered the unit guard's `describe` inside
the integration project and run those six tests twice. Verified by mutation: a declared-but-unproduced
column now fails with the column name in the message.

---

### FINDING-9

- **Severity:** Important
- **Confidence:** 85
- **File:** apps/api/tests/integration/sign-up-throttle.test.ts:81-125, apps/api/tests/integration/reset-lockout.test.ts:130-152
- **Category:** test-quality
- **Source:** test-quality-agent
- **Round found:** 1
- **Resolution:** fixed (round 1)

**What is wrong:**

The three tests claiming to prove FR-307a's headline property — a storm against one action must not
slow that address's sign-in — probed with a **correct** password and asserted 204. A successful
sign-in never consults the throttle at all: `sign-in.ts` reaches `failureDelayMs` only inside its
`if (!attendee || !verified)` branch, which is the property SC-003a rests on.

**Why this matters:**

These are the assertions the file headers call *"THE ASSERTION THIS FILE EXISTS FOR"*. Deleting
`eq(signInAttempts.action, action)` from `countFailures` left all three green. The isolation is only
observable on a *failed* sign-in: with a shared counter, the storm inflates the address's streak and
the owner's first honest typo returns 429 with a multi-second wait instead of a plain 401.

**How it was resolved:**

Added wrong-password probes asserting 401. Mutation testing then revealed a second-order problem the
finding did not mention: placed *after* the existing successful sign-in, the probes still could not
fail, because the identifier dimension resets on success and that success ended the storm's streak
too. Moved them **before** any success and re-verified — removing the `action` filter now turns the
sign-up-storm and reset-storm probes red.

The join-code probe is documented as **not** a mutation detector: `join_code` keys its identifier on
the attendee id while sign-in keys on the email, so those counters never collide regardless of the
action filter. It is retained as a genuine property assertion, with that limit stated rather than
overclaimed.

---

### FINDING-10

- **Severity:** Important
- **Confidence:** 88
- **File:** apps/web/src/app/profile/WithdrawConference.tsx (no covering test existed)
- **Category:** test-quality
- **Source:** test-quality-agent
- **Round found:** 1
- **Resolution:** fixed (round 1)

**What is wrong:**

The withdraw-from-conference client surface had **no test of any kind** — no component test, no e2e
test. A 150-line component including its confirmation dialog and its declared copy was entirely
unexercised.

**Why this matters:**

FR-317c is a requirement this feature introduced, and the Principle IX declaration enumerates its
states explicitly. The copy stating that the conference's saved sessions and notes go with it is
exactly the sentence a person needs before an irreversible loss of their notes; nothing asserted it
was present, so removing or softening it would not have failed the build. The server route is well
covered, which made the client the whole of the exposure.

**How it was resolved:**

Added a withdrawal case to `identity-offline.test.tsx` asserting the offline refusal is distinguished
from a server fault, that `withdrawFromConference` is called exactly once (nothing queued), and that
the registration is still displayed afterwards.

---

### FINDING-11

- **Severity:** Important
- **Confidence:** 80
- **File:** apps/web/tests/component/identity-offline.test.tsx, apps/web/src/app/profile/Avatar.tsx:70-105
- **Category:** test-quality
- **Source:** test-quality-agent
- **Round found:** 1
- **Resolution:** fixed (round 1)

**What is wrong:**

`identity-offline.test.tsx` covered seven 004 actions but not avatar upload — the one the spec calls
out by name as an Edge Case: *"An avatar upload is attempted offline. Refused, with the file not lost
from the form."*

**Why this matters:**

The requirement is not merely that the upload is refused but that the selected file survives the
refusal — a behaviour a naive `finally { setFile(null) }` would silently break. The server-side
rejection path is thoroughly tested, which made the client presentation of those rejections the
untested half.

**How it was resolved:**

Added an avatar case asserting the offline alert, that `uploadAvatar` was called exactly once, and
that the input still reports the selected file.

---

## Minor findings fixed

| #   | File                                         | What                                                                                                                                             |
| --- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | `images/avatar.ts:98`                        | Orientation branch compared `Math.min(height,width)` to `Math.min(width,height)` — identical, so the "correction" never ran. Removed with the now-dead `orientation` read; the shorter edge is orientation-invariant. Reported by correctness. |
| M2  | `errors.ts:82`                               | `tooManyAttempts` hardcoded "Too many **sign-in** attempts" for seven callers. Parameterised; each route names its own action. Reported by correctness **and** architecture. |
| M3  | `routes/account.ts:88`, `profile.ts`, `verify.ts` | Bare `succeeded: false` on success paths read as a copy-paste bug and was not one. Introduced `recordRequest` naming the policy, and hoisted the duplicated call in `account.ts`. Reported by correctness **and** architecture. |
| M4  | `routes/auth/verify.ts:137`                  | Resend declared a `429` it cannot produce (delay-only counter), publishing a status into the contract no client will see. Removed from the schema; the unreachable branch is now an invariant assertion. |
| M5  | `profile/ConfirmDialog.tsx:67`               | `showModal()` with no cleanup; both confirm paths unmounted the dialog while open, dropping focus to `<body>` after a destructive action. Added a cleanup that closes then restores. |
| M6  | `profile/ConfirmDialog.tsx` (found while fixing M5) | The opener ref is attached **conditionally** in `WithdrawConference`, so the render that unmounts the dialog also detaches it — cleanup would have read `null`. The opener is now captured at mount. |
| M7  | `app.ts:56`                                  | Fastify 5 defaults `requestTimeout` and `connectionTimeout` to `0`. Set explicitly, above the throttle's own sleep budget. |
| M8  | `.env.example`                               | `TRUSTED_PROXY_HOPS` was undocumented despite deciding which XFF entry becomes `request.ip` — the source dimension every counter bounds an attacker by. Documented as a security setting, with `AUTH_RESET_BRANCH_BUDGET_MS`. |
| M9  | `schema/stored-objects.ts:58`, `auth/verification.ts:26` | Two comments asserted things the code does not do — pointing at the wrong file for avatar key ownership, and describing `tokenHashesEqual` as serving paths that do not exist (it has no caller anywhere). Corrected to say so plainly. |
| M10 | `tests/unit/deletion-coverage.test.ts`       | Allow-list entries carried a `reason` by type with nothing asserting it was non-empty, so `new_attendee_table: ''` went green. The export guard had asserted this since it was written; closed the asymmetry. |
| M11 | `tests/integration/account-deletion-no-tombstone.test.ts:176` | Test named for invalidating a pre-deletion reset link submitted a string that was never issued, so its 410 was guaranteed by "unknown token". Wired through the mail sink to use the real token. |
| M12 | `tests/integration/export.test.ts:147`       | Comment promised a token check "by shape rather than by name" and then did a name check. Implemented the shape check. Measured that real webp avatar base64 false-positives 2 times in 20, so the avatar is excised first — the exclusion is load-bearing, not defensive. |

---

## Notable Observations

Captured to `brainstorm/idea-inbox.md`. Informational; excluded from the gate.

### NOTABLE-1 — verification proves reachability, not ownership

- **File:** apps/api/src/routes/auth/verify.ts:61
- **Source:** security-agent
- An attacker can sign up with a victim's address; if the victim clicks the link, it verifies the
  *attacker's* account, and FR-303's disclosure has meanwhile told the victim the address is taken.
  The code implements verification exactly as specified — the residual is in the threat model. The
  mitigation is copy the product does not have: `MailService` takes only `to` and `link`, so nothing
  in the message can warn a recipient. Intersects register entry 19.

### NOTABLE-2 — `PlatformServices.repositories` mirroring cost

- **File:** packages/platform/src/registry.tsx:56
- **Source:** architecture-agent
- 004 added fifteen methods under the `unknown`-return mirroring scheme and six `as` casts in feature
  code. The avoided dependency is type-only, which `import type` erases entirely. 006–009 each add a
  repository under the same rule.

### NOTABLE-3 — `IdentityRepository` spans two subjects

- **File:** packages/data/src/interfaces/identity.ts:61
- **Source:** architecture-agent
- `joinConference`/`withdrawFromConference` sit on identity while `listRegistered` sits on events, so
  a component that lists-and-leaves holds both. Defensible today; worth revisiting if a third
  registration verb appears.

### NOTABLE-4 — join-code lookup cannot use its index

- **File:** apps/api/src/db/queries/identity.ts:185
- **Source:** production-readiness-agent
- `lower(btrim(join_code))` cannot use `events_join_code_unique`. Harmless while `events` holds a
  handful of seeded rows; a functional expression index would fix it if that changes.

### NOTABLE-5 — avatar serving has no revalidation story

- **File:** apps/api/src/routes/profile.ts:337
- **Source:** production-readiness-agent
- Base64-in-JSON with no `ETag` or `cache-control`, refetched on every mount. Fine for one avatar;
  becomes N inflated round trips per render in 006's directory. Worth deciding while the only
  consumer is a single-avatar page.

### NOTABLE-6 — dialog component tests use `hidden: true`

- **File:** apps/web/tests/component/identity-accessibility.test.tsx:188
- **Source:** test-quality-agent
- The queries prove the component mounted the dialog but not that `showModal()` ran. The real
  guarantees are correctly proved in a browser by the e2e suite; 005's session panel asserted the
  jsdom shim's `data-modal` marker and 004's dialog does not.

---

## Remaining Findings

None gate the review. Ten Minor findings were left unfixed, each for a stated reason.

### REMAINING-1 — the avatar limit is configurable but stated as prose (from FINDING-6)

`Avatar.tsx` renders "up to 5 MB" while `AVATAR_MAX_UPLOAD_BYTES` is environment-configurable, so an
operator can make that sentence false without touching code — and no test can catch it, because the
value is absent from the contract. **This needs a product decision, not a review fix**: either the
limit stops being configurable, or the client is told it at runtime (`GET /profile` already returns
`hasAvatar` and could carry it). Recorded as an `it.todo` in `client-limits.test.ts` so it is visible
at the point it would be checked.

### REMAINING-2 — no index on `attendee_id` in either token table (P4, Minor, confidence 88)

`attendee_verifications` and `attendee_password_resets` have a foreign key on `attendee_id` and no
index; PostgreSQL does not create one. Every account deletion cascade-scans both, and every reset
request runs an unindexed `DELETE` under a write lock. **Not fixed because the fix is not local**:
adding it to the Drizzle schema requires regenerating `0004_snapshot.json`, and migration `0003` is
the one reserved number with a deliberately inverted journal entry that `migrations/meta/README.md`
warns a regenerating feature must not "fix". That is a change to make deliberately with the migration
machinery in view, not as a review side effect. Real, and worth doing before the tables grow.

### REMAINING-3 — migration `0003` lock safety (P5, Minor, confidence 78)

`ALTER TABLE events ADD COLUMN join_code text DEFAULT gen_random_uuid()::text NOT NULL` uses a
volatile default, which disables the fast path and rewrites the table; the `sign_in_attempts` indexes
are rebuilt non-concurrently; and no `lock_timeout` is set, so an `ACCESS EXCLUSIVE` request on
`attendees` can queue the whole API behind it. Same reasoning as REMAINING-2 — the fix belongs with
whoever runs the deploy, and `SET lock_timeout` in `db/migrate.ts` is the cheap part of it.

### REMAINING-4 — order-dependent tests (T7, Minor, confidence 85)

`verification-gates-visibility.test.ts` and `mail-failure.test.ts` contain tests that pass only in
declaration order, because a mutation in one `it` is the precondition of the next. Deterministic
today (`fileParallelism: false`, declaration order), but `.only` is unusable and a reordering changes
results in a way that reads as a product regression. Sibling files show the correct `beforeEach`
pattern.

### REMAINING-5 — `HttpClient` empty-body handling untested (T9, Minor, confidence 85)

004 changed `client.ts` to read the body as text and return `undefined` when empty, because the new
`202 Accepted` responses made `response.json()` throw. Guarded only by an e2e assertion — the slowest
and most fragile gate, and not one a reader of `client.ts` would connect to it.

### REMAINING-6 — dead `mail.from` configuration (A2, Minor, confidence 90)

Declared, documented, defaulted and present in `.env.example`; read by nothing. `MailService` has no
parameter it could reach, so it cannot be consumed without changing the port. Left in place rather
than deleted: it is plausibly the shape register entry 18 wants, and removing config an operator may
already have set is a decision for whoever writes that adapter. `SinkMailService.sent()` is likewise
unreferenced.

### REMAINING-7 — `ProfileInput` duplicates `ProfileFields` (A3, Minor, confidence 92)

Two names for one six-member shape, forty lines apart in one file. Structurally compatible only until
someone adds a field to one.

### REMAINING-8 — `readVisibleAvatarKey` collapses two outcomes (A5, Minor, confidence 86)

Returns `null` for both "not visible" and "no avatar", so the route re-runs `readCoAttendeeProfile`
to tell them apart — evaluating the visibility rule twice on the path where the file argues most
strongly for evaluating it once. A three-way return type would fix it.

### REMAINING-9 — `apps/web/src/auth/` and `apps/web/src/app/auth/` (A7, Minor, confidence 85)

Five screens of one journey split across two directories differing only by the `app/` prefix, with no
stated rule. Moving `SignInScreen.tsx` is the smaller change; either way the rule should be written
down.

### REMAINING-10 — `Destination` re-declares its inherited members (A8, Minor, confidence 90)

`Destination extends Addressable` and restates all three inherited members with copied doc comments
that have **already diverged** — `purpose` describes announcement in one and placeholder behaviour in
the other, so neither reader sees both.

---

## Post-Fix Spec Coverage

The fix loop removed code in three places: the dead orientation branch (`avatar.ts`), the unreachable
`429` schema entry and branch (`verify.ts`), and the duplicated `recordAttempt` call
(`account.ts`). Each was verified against the requirement it touches:

| Requirement                                   | Implementation                                             | Status |
| --------------------------------------------- | ---------------------------------------------------------- | ------ |
| FR-348 bounded square avatar                  | `avatar.ts` `side = min(dimensionPx, min(w,h))`             | ✓      |
| FR-349 metadata stripped                      | `avatar.ts` decode/re-encode, no `withMetadata()`           | ✓      |
| FR-322 resend rate-limited                    | `verify.ts` `reset_request` counter, delay-only             | ✓      |
| FR-379 export rate-limited                    | `account.ts` `recordRequest` + `export` counter             | ✓      |
| FR-307a per-action counters unchanged for sign-in | `throttle.ts` `sign_in` thresholds byte-for-byte as 001 | ✓      |

No requirement lost its implementation. `avatar-upload.test.ts` (EXIF byte-scan) and
`avatar-rejection.test.ts` still pass, which is the behavioural check on the first two rows.

## Test Suite Results

No `test` script exists in `package.json` (only `test:unit`, `test:component`, `test:integration`),
so the skill's auto-detection finds nothing. Rather than skip regression checking on an identity
feature, all three projects were run, with a baseline captured **before** any fix was applied.

| Stage         | Command             | Unit        | Component | Integration | Status |
| ------------- | ------------------- | ----------- | --------- | ----------- | ------ |
| Baseline      | all three           | 217         | 295       | 457         | passed |
| After round 1 | all three           | 222 (+1 todo) | 297     | 458         | passed |

**969 → 977 passing, no failures at any point.** The eight added tests are the ones FINDING-6 through
FINDING-11 called for. Also run after the fixes: `typecheck` (clean), `lint --max-warnings=0`
(clean), `format:check` (clean after `pnpm format`), `contract:check` (clean after regeneration —
route schemas changed), and `pnpm build` (API + web PWA, succeeded).

Four fixes were **verified by mutation** rather than by passing: reverting `isRefusal`, removing the
throttle `action` filter, declaring an unproduced export column, and lowering the client's password
minimum each turn the relevant new test red. This is what distinguishes them from the tests they
replaced.

## Notes on the review itself

- **External tools:** CodeRabbit and Copilot are enabled by config default but neither CLI is
  installed, so both were skipped. No config file exists at
  `.specify/extensions/spex-deep-review/deep-review-config.yml`; defaults were used.
- **Convergence:** the cache-purge gap was found by three of five agents independently, and three
  further findings by two agents each. Deduplication merged 42 raw findings to 37.
- **What the agents cleared matters as much as what they found.** The two structural guards genuinely
  enumerate `src/db/schema/*.ts` from disk via `readdirSync` + dynamic import + `getTableConfig`, so a
  new table or column does fail by existing (the export guard's *second* half was the gap, not its
  derivation). The storage-boundary lint rule holds including the barrel-reexport escape path;
  `routes.tsx` names no address; `MailService` has exactly two methods and no generic `send`; Argon2id
  with a server-side pepper, single-use tokens claimed by one atomic `UPDATE … RETURNING`, and the
  three visibility conditions in one SQL `WHERE` were all examined and found sound.
