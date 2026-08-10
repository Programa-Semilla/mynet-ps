# Code review: 007 — Messages, and the notification delivery platform

**Spec**: [`spec.md`](./spec.md) · **Date**: 2026-08-08 · **Gate**: `speckit.spex-gates.review-code`
**Tree**: `feat/007-messages-and-notification-delivery`, uncommitted, `pnpm verify` green.

---

## Compliance summary

**92 functional requirements, 18 success criteria. Compliance: 100% after the four corrections
below — 96% as found.**

| | Total | Compliant as found | Corrected here | Outstanding |
|---|---|---|---|---|
| Functional requirements | 92 | 88 | 4 | 0 |
| Success criteria | 18 | 15 | 3 | 0 |
| Deliberate absences with a test | 8 | 8 | — | 0 |

The four corrections are **one real coverage gap and three traceability gaps**. No behavioural
deviation from the specification was found, and nothing was implemented that the spec does not ask
for.

---

## Method, and its limits

Requirements were extracted from `spec.md` mechanically (92 `FR-` and 18 `SC-` identifiers) and each
was traced to an implementation site and a test. That trace is a **starting point, not the finding**:
a requirement can be named in a comment and not enforced. Every identifier that resolved to only one
kind of evidence — a name in a source comment, or a policy assertion with no behavioural counterpart
— was opened and read.

That is exactly how the one real gap was found, and it is worth stating plainly: **the reference
count said SC-506a was covered.** Two unit tests named it. Both read a configuration table. Neither
called a route.

---

## Finding 1 (real, fixed) — a cap that was configured and never exercised

**SC-506a**: *one account cannot open conversations with an entire conference; attempts to create
beyond the limit are refused.*

`tests/unit/throttle-actions.test.ts` asserted the policy twice, and correctly:
`conversation_create` carries `mayDeny: true`, and its allowance is strictly below `message_send`'s.
Both assertions read `THRESHOLDS`. **Nothing called `POST /conversations` until it was refused.**

A correct table wired to a route that never consults it passes both unit tests. SC-506a would have
been false with its coverage green — and this is the *one* throttle in the feature permitted to
genuinely deny, so it is the one where the difference between policy and enforcement matters most.

**Fixed** by `tests/integration/conversation-create-throttle.test.ts`: opens conversations with
distinct attendees until refused, asserts the refusal arrives, that everything before it succeeded,
that it *stays* refused, and — separately — that a capped account can still send into a thread it
already has. That last one is the asymmetry M1 is actually about: the harm is breadth of contact,
not volume, and an account that could no longer answer its own conversations would be a worse
product than the one the cap protects.

**Observed on the way, and deliberately not "fixed":** `freeAttempts: N` permits **N + 1** attempts.
`delayFor` compares the streak recorded *before* the current attempt and returns zero while
`failures - freeAttempts <= 0`, so the attempt that makes the count equal the allowance is still
free. This is the meaning the name has carried since 001 — `sign_in`, `join_code` and `export` all
behave this way — so it is not a defect this feature introduced, and correcting it is a change to
four other actions' behaviour. The new test asserts *that a refusal arrives near the declared
allowance* rather than pinning the exact attempt, so a future correction does not read as a
regression in Messages.

---

## Findings 2–4 (traceability, fixed) — requirements satisfied but not traceable

Three requirements and two criteria were structurally satisfied with **no reference anywhere in the
tree**. Each is now tagged at the site that enforces it. None was a behavioural gap; all three would
have been invisible to the next reviewer.

| Requirement | Satisfied by | Was traceable? |
|---|---|---|
| **FR-525** — identity bound from the session; no message operation accepts an attendee identifier from the client | `tests/integration/identity-isolation.test.ts`, which walks the **live route table** unauthenticated and as the wrong attendee — so 007's routes were covered the moment they registered | No. Tagged FR-385/FR-386 in 004's numbering |
| **FR-567** — the repositories registered through the existing registry | `Repositories` in `packages/data/src/interfaces/index.ts`, five members appended | No |
| **FR-571** — deletion removes participation in every conversation | `conversation_participants.attendee_id` cascade | No |
| **FR-576** — every new table classified by the deletion-coverage guard | Six of seven classified by cascade, read from the schema; `conversations` is the seventh and carries an explicit entry | No |
| **SC-507** — 100% of reports store a record and block, including when mail fails | `tests/integration/report-effects.test.ts`, which throws from `MailService` and asserts both survive | No |
| **SC-511** — list and thread identical across a conference switch | `e2e/messages-conference-switch.spec.ts` | No |

FR-525 deserves a note. Its guarantee is inherited rather than reimplemented, and the inheritance is
load-bearing: `identity-isolation.test.ts` reads routes from the running application, so a 007 route
taking its acting attendee from the client fails there as a cross-attendee breach. The `attendeeId`
that `POST /conversations` and `POST /blocks` accept is the **counterpart**, never the caller — FR-525
is about who you are, not who you are addressing. That distinction is now written where the test is.

---

## Absences, checked as absences

Eight things the spec requires *not* to exist. Each has a test that fails if it appears, and each was
confirmed present and passing:

- no message edit or delete route, and no edit column (FR-516) — `no-message-mutation-routes.test.ts`
- no surface anywhere reads a report (FR-548) — `no-report-read-surface.test.ts`, four directions
- no read receipt, delivery tick, typing indicator or presence (M5) — `messages-absences.test.ts`
- no notification bell and no notification centre (FR-560) — `no-notification-surface.test.ts`
- a received message is the only notification trigger (FR-561) — `notification-triggers.test.ts`
- nothing is cached in Messages (FR-563) — declared per member at the composition root
- `CatalogRepository` stays read-only — `catalog-read-only.test.ts`
- every route naming a conversation carries the participation guard — `participation-audit.test.ts`

The last two exist because of this feature and bind the *next* one: `notification-triggers.test.ts`
in particular is the gate that stops 008 and 009 adopting the push platform for appointments and Q&A
without an amendment. **A second trigger has to edit that test, and editing it is the conversation.**

---

## Beyond the task list

Eight changes were made that no task asked for. None is a product feature; each is an enabler for
something a task did ask for, and each is listed so a reviewer can disagree with it individually.

| Change | Why it was not optional |
|---|---|
| `apps/web/tsconfig.sw.json` | `lib="webworker"` merges across a *program*, so the worker in the app's tsconfig redefined the client's DOM globals. The visible symptom was one test losing `KeyboardEvent`; the invisible half was every DOM global acquiring a worker meaning |
| `eslint.config.js` — service-worker exemption | `mynet/no-direct-platform-access` passed on `sw.ts` only because it does not inspect `self.*`. An exemption resting on a detector's blind spot is not an exemption |
| `SinkPushService` logging (development only, `warn`) | "The sink records what would have been sent" was true and unobservable: a *successful* dispatch produced no log line, no response change and no database change. `quickstart.md` asked the reader to inspect something with no referent |
| `registration()` bounded at 3s (`packages/platform`) | `navigator.serviceWorker.ready` never resolves when nothing is registered — it does not reject. `vite dev` registers no worker, so granting permission there left `subscribe()` pending forever with the button disabled and no error |
| `e2e/support/api-process.ts` — wait on `/ready` | The harness waited on `/health`, the exact mistake `deploy/vm/README.md` warns about in its own words. `durability.spec.ts` failed once in a full run and passed in isolation. **The fix is right on its own terms; one intermittent failure does not prove it was the cause** |
| `deploy/vm/.env.example`, `docker-compose.yml`, `deploy.sh` | The deployment platform named none of the new configuration, so a deployed environment could not turn on delivery or operator mail at all. `deploy.sh` reads the public VAPID key back out of the VM's own `.env`, so the pair cannot drift across two files |
| `.env.example` — `VITE_PUSH_VAPID_PUBLIC_KEY` | The client half of the pair was undocumented, and without it scenario 5 cannot be walked |
| `e2e/agenda-saved.spec.ts`, `agenda-offline.spec.ts` | `allTextContents()` is a snapshot that does not auto-wait, read straight after a helper that waits only for the `<h1>`. Passed on timing until the service-worker change shifted it |

**`quickstart.md` was also rewritten**, because reviewing it against the built feature found it had
never been walked: commands `pnpm start` already runs, `/api/...` paths that only exist behind Caddy,
a column named `sender_id` that is `author_id`, controls placed on the wrong screen, and a scenario 1
that checks a table is empty when the seed guarantees it is not. Two of its steps were impossible
rather than merely wrong, and those two produced the sink-logging and service-worker-timeout changes
above.

---

## Code quality notes

Secondary to compliance, and none of these blocks anything.

- **The participation guard is the right shape and the right size.** A branded `ConversationScope`
  only `requireParticipation` can construct, plus a route audit — mirroring `EventScope` exactly,
  which is what makes it reviewable by anyone who has read the 002 version. The audit was necessary
  rather than decorative: `event-scope-audit` *silently passes* a route naming no conference, so
  without a second audit the whole domain would have been unguarded and green.
- **The refusal shapes are consistent and each is argued at its site** — 404 for a conversation you
  are not in, reasonless 409 for a blocked send, 403-with-explanation for a thread closed by
  deletion. The third differing from the first is the interesting decision, and the reasoning (it is
  a fact about a thread the caller can already read in full) is written where the code is.
- **`notifyRecipient` awaits rather than floating**, with the reason recorded: a detached promise
  would make SC-503's latency unmeasurable and let an error escape as an unhandled rejection.
- **The cursor carrying microseconds while the wire carries milliseconds** is the kind of defect that
  fails intermittently forever. It is fixed and the reasoning is in the file.

---

## Recommendations

### Critical
None.

### Before merge
- [ ] **T148** — walk `quickstart.md` by hand with two browser profiles. It is the only task left,
      it needs a person, and it is also the only review the two-pane desktop layout will have had.

### Carried forward, not resolved here
- [ ] **Register entry 20** — the push provider and VAPID key custody. The shipped code runs on the
      sink; this gates delivery in a deployed environment and nothing else.
- [ ] **Register entry 21** — the operator address abuse reports are sent to. With none set, a report
      still blocks and is still recorded, and the skipped dispatch is logged.
- [ ] The `freeAttempts` off-by-one, if it is ever to be corrected, is a change to five actions and
      belongs in its own change with its own reasoning.

---

## Conclusion

**100% compliant.** No behavioural deviation from the specification, no unspecified behaviour, and
every deliberate absence enforced by a test rather than by intention.

The one real gap this review found is worth remembering for the next feature: **SC-506a had two
tests, and neither of them exercised the requirement.** Both read a table. The requirement was about
a refusal, and nothing refused anything. Reference counts measure whether somebody wrote the number
down; they do not measure whether the guarantee holds.
