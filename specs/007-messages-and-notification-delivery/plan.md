# Implementation Plan: Messages, and the Notification Delivery Platform It Needs

**Branch**: `feat/007-messages-and-notification-delivery` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-messages-and-notification-delivery/spec.md`

## Summary

Deliver the fourth destination — private 1:1 conversations between attendees, permanent and
independent of the active event — together with the Web Push platform that notifies an attendee when
the application is closed, and the block and report mechanisms that make open send safe to ship.

The technical approach in one line per subsystem:

- **Participation replaces event scope as the authorization predicate.** Six new tables on migration
  `0006`, none reachable by `requireEventAccess`, all reachable by the deletion cascade.
- **Two new ports, both extending interfaces that were deliberately built to resist this.**
  `NotificationService` gains subscription and server-initiated delivery; `MailService` gains a third
  message. Both extensions are justified below rather than performed quietly, because both
  interfaces carry comments explaining why they were shaped to prevent exactly this.
- **The service worker changes strategy.** VitePWA runs `generateSW` today; a push handler needs
  `injectManifest` and a source service worker this project owns.
- **Two freshness paths, per M7**: Web Push for the closed application, and short-interval polling
  for an open thread. Neither depends on the other, and the product is complete with only the
  second.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22 (API) and the browser (client), ESM throughout.

**Primary Dependencies**: Fastify + Drizzle ORM over PostgreSQL 17 (API); React 19 + React Router +
Vite + `vite-plugin-pwa` (client). New: a Web Push encryption/dispatch library on the API side and a
push provider — **provider undecided, spec open question 2, blocks implementation of User Story 5
only**.

**Storage**: PostgreSQL, project-owned, loopback-only container on each VM. Migration `0006` is
reserved for this feature. Six new tables.

**Testing**: Vitest across `unit`, `component`, `integration` and `contract` projects; Playwright for
e2e and accessibility. Integration and e2e run against `postgres:17` service containers in CI.

**Target Platform**: Installable PWA served same-origin behind Caddy, alongside the API at `/api/*`.
Two Azure VMs (`uat`, `prod`).

**Project Type**: pnpm monorepo — web application plus its own API, with two shared packages.

**Performance Goals**: An open thread reflects a new message within five seconds (SC-502). A
notification reaches a device within thirty seconds of send (SC-503). A 1,000-message conversation
renders its most recent page without transferring the whole history (SC-518).

**Constraints**: No offline capability anywhere in this feature, by decision (FR-563). No write
queueing (FR-565). The client asset budget (`scripts/asset-budget.mjs`) fails the build on
regression, and 006 already had to code-split Discover to stay under it. Push permission is
deniable, so every capability except notification delivery must work without it (FR-552).

**Scale/Scope**: Conference scale — up to ~1,000 attendees per event (FR-401c), tens of
conversations per attendee, hundreds of messages per conversation. Six tables, one new repository
domain, one new destination, one new Home card, two extended platform ports.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I** — Requirements define the product | No requirement may be resolved by inference; divergences are recorded | **PASS with one declared breach, below.** FR-504b and FR-578 convert two silent divergences into declarations. |
| **II** — Prototype is reference, not architecture | Prototype defects are corrected, not preserved | **PASS.** FR-580 replaces the horizontally-scrolling switcher; the "last message isn't mine" unread rule is replaced by FR-526's read position. |
| **III** — Attendee experience first | No organizer administration, no privileged role | **PASS, and it is the tightest gate in this feature.** FR-548 forbids any in-product route, role or screen that reads a report. Reports leave by mail; the operator acts out-of-band. |
| **IV** — Accessibility and responsiveness | All three layouts, labels, focus, keyboard, Escape — declared, never deferred | **PASS.** FR-580–FR-586 and four declaration rows. |
| **V** — Abstraction before platform and data APIs | No component calls the network or a browser API directly | **PASS, conditional on R1 and R2.** Push is the first capability whose natural implementation lives in a service worker, outside the React tree the registry injects into. The seam has to be designed, not assumed. |
| **VI** — Web-first delivery | PWA; offline behaviour declared per feature | **PASS.** FR-563 declares a refusal rather than omitting the question. |
| **VII** — Verified on Linux CI | All ten correctness gates, integration against a real database | **PASS.** FR-522 adds the non-participant refusal proof; the coverage guards fail by existence. |
| **VIII** — Attendee data is personal data | Server-side scoping, deletion and export coverage | **PASS, with the largest new surface in the product.** Participation is a new predicate (FR-523); six tables need classification (FR-576). |
| **IX** — Every feature declares its own completeness | Twelve declaration rows filled | **PASS.** All twelve filled in the spec. |

### The one declared breach

**Register entry 10 places engagement notification delivery out of product scope, and M4 reverses
it.** The constitution has not yet been amended. This is recorded in the spec's Context section, its
Register position row, and its Open Question 1.

This is not a gate failure to be justified in Complexity Tracking — it is a governance action
outstanding. Planning and task generation may proceed; **implementation of User Story 5 and merge of
this branch may not, until the amendment lands.** Entry 10's surviving half — the notification bell
must not be reproduced — is carried forward unchanged by FR-560 and is not affected.

### Post-design re-check *(after Phase 1)*

Re-run against the completed design. Two gates changed status; one hardened.

| Principle | Change after design |
|---|---|
| **V** — Abstraction | **Was conditional, now PASS.** R1 keeps the port to one capability by extending `NotificationService` rather than inventing a seventh name, and `DeviceSubscription` is a domain shape so no browser type crosses the seam. R2 confines service-worker code to `apps/web/src/sw.ts`, which is infrastructure rather than feature code. R8 gives the server a vendor-free `PushService`. `mynet/no-direct-platform-access` should still count zero. |
| **VIII** — Personal data | **PASS, and materially stronger than at the pre-check.** R9 found that the existing route audit *silently passes* conversation routes, because it matches on conference identifiers and these have none — so the design adds a branded `ConversationScope` and a second audit rather than inheriting a protection that does not reach. R10 removed a retained identifier that the obvious schema would have left behind. Every one of the seven tables is cascade-reached; **no allow-list entry is needed**. |
| **III** — Attendee experience | **PASS, unchanged, and now checkable.** FR-548's prohibition became a negative test in the quickstart: a reviewer looking for the report-reading surface must find nothing. |

**One thing got bigger during design and should be said plainly.** The data model has **seven**
tables, not the six the spec names. `conversation_pairs` is research R10's, and it exists because the
obvious way to enforce one-conversation-per-pair would have retained a deleted attendee's identifier
in `conversations`, breaching FR-573. The spec's requirement is unchanged; the count in its
Deletion & export declaration row is one short, and `deletion-coverage` will fail until the seventh
is classified too.

**No new violation was discovered.** The Complexity Tracking table below is complete as written.

## Project Structure

### Documentation (this feature)

```text
specs/007-messages-and-notification-delivery/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
├── checklists/
│   └── requirements.md  # Spec quality checklist (gate passed)
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
apps/api/
├── migrations/
│   └── 0006_*.sql                      # Reserved. Six tables + indexes.
├── src/
│   ├── db/schema/
│   │   ├── conversations.ts            # conversations, conversation_participants
│   │   ├── messages.ts                 # messages
│   │   ├── blocks.ts                   # attendee_blocks
│   │   ├── reports.ts                  # abuse_reports
│   │   └── push-subscriptions.ts       # push_subscriptions
│   ├── db/queries/
│   │   ├── conversations.ts            # list, open, create-on-first-message, unread counts
│   │   ├── messages.ts                 # keyset page, append
│   │   ├── blocks.ts
│   │   ├── reports.ts                  # write only — no read function exists (FR-548)
│   │   └── push-subscriptions.ts       # upsert by endpoint, list by attendee, delete
│   ├── routes/
│   │   ├── conversations.ts            # participation-scoped; NOT under routes/events
│   │   ├── blocks.ts
│   │   ├── reports.ts
│   │   └── push.ts                     # subscribe / unsubscribe
│   ├── notifications/                  # NEW. The push port + its adapters.
│   │   ├── service.ts                  # PushService interface (vendor-free)
│   │   ├── dispatch.ts                 # failure isolation, mirrors mail/dispatch.ts
│   │   └── sink-adapter.ts             # test/dev adapter, mirrors mail/sink-adapter.ts
│   ├── mail/service.ts                 # EXTENDED: third method for operator abuse mail
│   └── maintenance.ts                  # EXTENDED if reports are swept (research R3)
└── tests/
    ├── unit/                           # deletion-coverage + export-coverage extend by existence
    └── integration/                    # FR-522 non-participant refusal proof

packages/data/src/interfaces/
├── messages.ts                         # NEW domain: ConversationRepository, MessageRepository
├── safety.ts                           # NEW domain: BlockRepository, ReportRepository
├── notifications.ts                    # NEW domain: PushSubscriptionRepository
└── index.ts                            # APPEND to Repositories — one line per member

packages/platform/src/
├── interfaces/index.ts                 # EXTENDED: NotificationService gains subscription
└── web/devices.ts                      # EXTENDED: real implementation replaces the no-op

apps/web/
├── src/sw.ts                           # NEW. Source service worker (injectManifest).
├── src/app/
│   ├── messages/                       # Destination: list, thread, composer, safety controls
│   │   ├── Messages.tsx                # Two-pane desktop/tablet, stacked mobile
│   │   ├── ConversationList.tsx
│   │   ├── Thread.tsx
│   │   ├── Composer.tsx
│   │   ├── MessagesEmptyStates.tsx     # Empty and failure states for list and thread
│   │   ├── useConversation.ts          # The 3s visible-only poll (research R4)
│   │   ├── NotificationPrompt.tsx      # Explanation shown BEFORE any permission prompt
│   │   ├── BlockConfirm.tsx
│   │   └── ReportDialog.tsx
│   ├── home/cards/UnreadMessages.tsx   # NEW card + one line in home/registry.ts
│   ├── profile/Blocks.tsx              # FR-541a — on the existing account surface
│   └── navigation.ts                   # APPEND: Messages destination + nested thread address
└── vite.config.ts                      # CHANGED: generateSW → injectManifest

e2e/                                    # Journey + accessibility specs for the destination
```

**Structure Decision**: The existing monorepo layout is used unchanged. Three points are worth
stating because they are choices rather than defaults:

1. **Conversation routes do not live under `routes/events/`.** Every per-event route registers there
   and is audited for the event-scope guard. Conversations are cross-event (FR-507), so registering
   them there would either fail the route audit or invite someone to satisfy it with a guard that
   does not apply. They get their own top-level registration, and research R9 covers how the audit
   is kept honest about the difference.
2. **Three new repository interface files, not one.** The per-domain split is an established
   invariant, and messaging, safety and push subscriptions are three subjects. 004's review already
   recorded the cost of letting one interface span two (`identity-repository-spans-two-subjects`).
3. **`apps/api/src/notifications/` mirrors `apps/api/src/mail/` exactly** — port, dispatch wrapper,
   sink adapter. The mail module already solved the same problem: an unprovisioned external
   dependency must be the expected state, not an exceptional one.

## Complexity Tracking

> Filled because the Constitution Check records one breach and two deliberate interface changes that
> a reviewer should see argued rather than discover.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Engagement notification delivery, against register entry 10** | Owner decision M4. A networking product's value is a timely reply; a message discovered an hour later is worth little. | Polling alone was specified and recommended, and rejected by the owner. Not re-litigated — recorded, with the amendment named as an outstanding governance action that gates merge. |
| **Extending `NotificationService`, whose comment says the implementation MUST NOT be wired to real delivery** | The same decision. The interface's prohibition was a restatement of register entry 10, so it lapses with the entry — but only once the amendment lands. | Bypassing the port and calling the Push API from feature code was rejected outright: Principle V, and the `mynet/no-direct-platform-access` lint rule with SC-008 requiring zero violations. |
| **Extending `MailService`, which has exactly two methods so that a third requires editing it** | Operator abuse mail (FR-547). The guard worked as designed — this is the deliberate act it was built to force. | A generic `send(to, subject, body)` was rejected: it would dissolve the guard entirely. The third method is narrow and named for its one purpose, and it goes to the **operator**, not to an attendee, so it is not the engagement notification the guard exists to prevent. |
| **Switching VitePWA from `generateSW` to `injectManifest`** | A `push` event handler cannot be expressed in generated-service-worker config. | Registering a second, separate service worker was rejected: one scope, one worker; two would race over control of the same clients. |
| **Two freshness mechanisms rather than one** | Owner decision M7, and FR-552 — permission is deniable, so the non-push path is not optional. | A single mechanism was offered both ways (push-only, poll-only) and rejected: push-only gives the least-privileged attendee the worst product; poll-only was the option the owner declined. |
