# Architectural invariants — full record

**Moved verbatim from `CLAUDE.md` on 2026-09-24** (constitution 5.4.1), where it had grown too large
to load every session. `CLAUDE.md` now carries a one-line index of these rules; this file carries
the reasoning. The constitution is authoritative over both. Invariants established by 010, 014 and
016 that `CLAUDE.md` recorded under its status section are in `delivery-log.md` beside this file.

Established by shipped features. A later feature inherits these; changing one is a decision, not a
refactor.

**Server-side enforcement**

- **Event scope is a branded type only `requireEventAccess` can construct**, demanded by every
  per-event query. A route audit fails when a route declaring an event parameter lacks the guard,
  and a lint rule closes the brand's type-assertion escape hatch.
- **Two coverage tests fail a *future* feature's build.** `tests/unit/deletion-coverage.test.ts`
  fails when a table storing attendee data has neither a cascade from `attendees` nor a declared
  retention rule; `tests/unit/export-coverage.test.ts` fails when a collected column has no export
  coverage. Both derive expectations from the Drizzle schema, so **a new table or column fails by
  existing**. Allow-listing requires writing down why.
- **Verification gates exactly one thing: discoverability.** An unverified attendee uses the
  product fully and appears to nobody — so any profile that can be read already carries a verified
  address, and no feature may use verification state for anything else.
- **`sign_in_attempts` is deliberately not deleted with an account.** It has no foreign key by
  design; deleting a departing attendee's rows would let an attacker clear their own trail by
  registering and deleting. It expires on the two-hour sweep, which FR-382 forbids lengthening.
- **Throttling is per action.** Reset-request is configured so it **may delay but can never deny** —
  an identifier-keyed denial only ever harms the victim.

**Append-only extension points** — contribute a line and your own file; never edit a neighbour's.

- `apps/web/src/app/home/registry.ts` — Home cards.
- `apps/web/src/app/navigation.ts` — a destination declares its own element and nested addresses.
  `routes.tsx` names no address literally.
- Repository interfaces, API route registration, and the seed are split per domain.
- `Repositories` in `packages/platform` — adding a repository is one line; `registry.tsx` is
  untouched. Platform takes a **type-only** dependency on `@mynet/data` so the registry names real
  interfaces; `apps/web/tests/unit/repository-casts.test.ts` keeps the unchecked casts gone.

**Client behaviour**

- **Offline reads come from a caching decorator at the repository boundary** — no component knows
  it exists — keyed `(attendeeId, eventId, resource)` with a **24-hour lifetime**. Every cached
  surface states when it was retrieved. Writes are **refused, never queued**: no write queue, no
  optimistic update, no conflict merging.
- **Discover is deliberately not cached**, and the refusal is declared rather than omitted: age is
  the wrong clock for a discoverability setting that takes effect on the next request, and a cached
  directory is other people's personal data ageing on a device after they chose to be invisible.
- **`CatalogRepository` is read-only in perpetuity**, asserted by name-shape over its exports.
  Attendee state *about* conference content belongs in its own repository.
- **A modal `<dialog>` is centred by the base rule in `theme/tokens.css`, not by each dialog.**
  The user agent centres a `showModal()` dialog with `margin: auto`; Tailwind's Preflight sets
  `margin: 0` on every element and takes it away, pinning the dialog to the **top-left corner**.
  005 and 006 each rediscovered this and patched it locally with `m-auto`; 004's `ConfirmDialog`
  and 008's `ScheduleDialog` did not, and both shipped mispositioned. It is invisible to every
  behavioural test — the dialog opens, traps focus, closes on Escape and reads correctly — so
  `e2e/responsive.spec.ts` now measures the gap on either side. The existing width assertion
  never looked at position, which is how it survived.
- **The detail panel is a native `<dialog>` with `showModal()`** — focus trap, background inertness
  and Escape come from the platform. Focus restoration to the opener is explicit, because
  `<dialog>` does not do it reliably. **007's confirmations reuse `ConfirmDialog` rather than
  opening a second one**: the ordering is what is easy to get wrong (restore focus *after*
  closing, because an inert element cannot take it), and a duplicate is a second place for it to
  drift.

**Directory (006)**

- **The directory is one query** — three visibility conditions, search, both filters, the
  shared-interest count, ordering and the keyset bound. They are not separable because the page is
  chosen *by* rank. Its only input from outside the conference is the reader's own interest set,
  which is what makes "ranking may read only what the card shows" structural.
- **Pagination's guarantee is asymmetric by design**: no duplicate ever, omissions permitted.
  Keyset cannot cover a score that *falls* below the cursor; the only server-side fix is a snapshot
  nothing may retain. `useDirectory` de-duplicates against the list it is rendering — not a cache.

**Messages (007)**

- **Participation replaces event scope as the authorization predicate.** A conversation has two
  owners and is cross-event, so `EventScope` cannot reach it — and worse, `event-scope-audit`
  *silently passes* a route naming no conference. A branded `ConversationScope`, a
  `requireParticipation` guard and a **second route audit** replace it. 008's appointments inherit
  this.
- **Refusals are indistinguishable by construction, and the shapes differ deliberately.** A
  conversation you are not in is **404**, identical to one that does not exist (a 403 confirms two
  specific people are talking). A blocked send is a **reasonless 409** (FR-537). A conversation
  closed by the counterpart's deletion is **403 with an explanation** — a fact about a thread the
  caller can already read in full.
- **Nothing in Messages is cached, and the refusal is declared per member** at the composition
  root. Message content is the most sensitive data in the product; the decorator revokes on age
  alone, and every write here is refused rather than queued.
- **Deleting an account removes its messages from every conversation**, including the other
  person's view. The survivor keeps a one-sided read-only thread with `counterpart: null` — no
  name, no avatar, no identifier. A conversation nobody is left in is removed, which no cascade
  can do because `conversations` deliberately holds no attendee foreign key.
- **The message cursor carries microseconds while the wire carries milliseconds.** A millisecond
  bound silently skips every row sharing the page boundary's millisecond; it failed
  *intermittently* until fixed.
- **`VisibilityService` is a seventh device capability**, added for the visible-only poll and
  argued in `packages/platform/src/interfaces/index.ts`. `substitution.test.ts` is what forced it to
  be declared rather than added quietly; **v3.1.0 ratified it** into Principle V.
- **Absences with tests**: no message edit or delete route or column (FR-516), no report read
  surface anywhere (FR-548), no read receipt, delivery tick, typing indicator or presence (M5), no
  notification bell or notification centre (FR-560), and **a received message is the only thing
  that dispatches a notification** (FR-561). That last one is a source-level audit over
  `apps/api/src`, and it exists to stop 008 and 009 adopting the platform for appointments and Q&A
  without a decision: **a second trigger has to edit the test, and editing it is the conversation.**

**Notification delivery (007)**

- **The platform is vendor-free at the port, and there was never a vendor to choose.** `PushService`
  in `apps/api/src/notifications/` returns `'delivered' | 'gone' | 'failed'` — the three outcomes
  that differ in what the caller must *do*. Two implementations: `WebPushService` signs with the
  VAPID pair and POSTs to the endpoint **the browser issued** (`fcm.googleapis.com` for Chromium,
  Mozilla's for Firefox), and a **sink adapter** records rather than sends. The port is what made
  the phase buildable before either existed.
- **The adapter is selected by configuration, in every environment identically.** VAPID pair
  present → real delivery; absent → the sink. No environment branch, so a local end-to-end test
  exercises the production path. `web-push` is confined to `apps/api/src/notifications/` by the same
  lint boundary that confines storage vendors.
- **The service worker runs in `vite dev` too, and `main.tsx` registers it explicitly.** 001 left
  `devOptions: { enabled: false }` because only `vite preview` needed a worker; **Web Push is
  impossible without one**, so `pnpm start` could not test notifications at all. `injectRegister`
  only injects at build time, which is why registration moved into source — it now happens
  identically in dev and production.
- **A dead subscription is discarded; a failing one is not.** The asymmetry is deliberate:
  over-retrying a dead endpoint costs a request, while wrongly discarding a live one silently stops
  that person receiving anything ever again.
- **A subscription is keyed on the endpoint alone, never on `(attendee, endpoint)`.** The same
  browser profile signed into two accounts in turn issues the *same* endpoint; keyed on the pair,
  the first account's row survives and one attendee's messages are delivered through another
  attendee's registration. Re-registering **reassigns** the device to whoever holds it now.
- **The service worker is hand-written source** at `apps/web/src/sw.ts` (`injectManifest`, not
  `generateSW`): a `push` handler is code and configuration cannot express one. Everything the
  generated worker did is carried across explicitly, **the API denylist most of all** — without it
  the HTML shell is served in answer to API requests, and a failed request looks like a successful
  page load. It is typechecked by its own `tsconfig.sw.json`, because a `lib="webworker"` file
  inside the application program redefines the application's DOM globals.
- **Permission is explained before it is requested, by construction.** `NotificationPrompt.tsx` is
  the only caller of `requestPermission` in the client, and a unit test asserts that. It renders
  nothing at all once it has been answered — there is no bell to become.
- **Denial is a complete outcome, not a degraded one.** It is recorded so nobody is asked twice, and
  `push-denied-fallback.test.tsx` re-runs the US1–US4 surfaces with permission denied to assert they
  are unchanged.

**Network (008)**

- **A third branded scope, because a card route names no conference.** `CardScope` and
  `requireHeldCard` mirror 007's participation guard, and `card-audit.test.ts` is a **third** route
  audit — `event-scope-audit` examines a route only if it names an event and **reports success
  otherwise**, so it walks straight past `/cards/…`. The predicate is **directional** where
  participation is symmetric: it asks whether the reader holds a card *from* the named attendee,
  never the reverse, which is what stops sharing your own card granting you a read of theirs.
- **Appointments are per-event and deliberately named so in the URL.** `/events/:eventId/…` puts
  them *inside* the guarantee that already exists. Registering them as `/appointments/:id` would
  name no conference and the event audit would silently pass them. **007 predicted the opposite**
  — that appointments would inherit its guard — and 008 corrected that comment in both files it
  appears in.
- **One feature, two scoping rules, and neither is the default.** `shared_cards` is cross-event;
  `appointments` and `meeting_slots` are per-event. The client mirrors it exactly: `CardRepository`
  takes no `eventId` **at all**, so no later edit can scope contacts to the conference on screen.
- **The three absences in card resolution are the feature.** No discoverability condition
  (FR-612), no verification condition (FR-613), no registration join (FR-614) — each looks like a
  forgotten `WHERE`, and the directory query one file over has all three. Sharing checks them;
  *resolving* must not. Discoverability governs being **found**, not being **remembered**.
- **Availability is computed from the reader's commitments alone**, and a **received** proposal
  consumes nothing. Two separate guarantees that read alike: one stops the reader learning the
  invitee's schedule from which options vanish (a leak *by omission*), the other stops anyone
  consuming a stranger's whole day by proposing into it. Double-booking is caught at acceptance
  instead — the one refusal in this feature that **carries a reason**, because it describes the
  reader's own diary to the reader.
- **Blocking suspends a relationship and ends a commitment, and those are different.** A card is
  severed **read-side**, so lifting the block restores the contact with no write; an appointment is
  **cancelled** by a write and stays cancelled. Read-time filtering was rejected precisely because
  lifting a block would resurrect a cancelled meeting. This is the single place 008 edits a file
  007 owns — one call in `db/queries/blocks.ts`.
- **`lapsed` is derived from the slot instant and stored nowhere**, which is what keeps this feature
  free of any background job. A stored fifth status would need a sweep, and `RETENTION_SWEEPS` is
  for data no cascade can reach — which this is not.
- **A card cannot be recalled**, and appointments cascade away entirely with either account. Unlike
  007's conversations there is **no one-sided survivor**: a conversation holds the survivor's own
  words, a card whose subject is gone has nothing to preserve.
- **Contacts must never be derived from conversations or appointments** (constitution v3.2.0 N1),
  asserted over the source. 007's open send makes a conversation unilateral, so deriving them would
  let a stranger insert themselves into somebody's Network with one message.
- **Withdrawing from a conference cancels the live meetings you had at it**, in the same
  transaction. Not doing so was the trap: the departing attendee fails `requireEventAccess` and so
  can no longer see or cancel the meeting, while the other party can still accept it and turn up.
  This is the **second** place 008 writes into a file another feature owns, after `blocks.ts` —
  both are one statement, both are cancellations, both for FR-637a's reason.
- **A read that must stay live has to SAY so.** The caching decorator treats every method not
  named in `reads` as a **write**, and a write purges the whole conference prefix. `slots` is a
  live read, and omitting it looked right while silently wiping the cached programme, saved
  sessions and notes every time the scheduling dialog opened. `CacheOptions.passThrough` is the
  declaration; the next uncached read must use it. **Its handler binds to `target`** like every
  other branch — every HTTP repository holds its client in a `#private` field, and a Proxy does
  not carry one, so returning the bare method throws `TypeError: Cannot read private member`. The
  decorator's own test therefore uses a **class with a private field**, not an object literal:
  the double's shape is the assertion.
- **Client error classification branches on `error.code`, never on the class.** `ApiError extends
  RequestRefusedError` and *every* non-2xx throws `ApiError`, so `instanceof` catches 400, 404,
  429 and 500 alike — which rendered the deliberately reasonless refusal for all of them and
  swallowed the messages routes wrote to be read.
- **A refusal's follow-up question must be about the READER.** Asking whether the *invitee* was
  registered, to choose between 400 and 404, made proposing an enumeration oracle for another
  attendee's presence — the caller controls the slot, so the invitee was the only variable.
- **The seed clears the whole Network domain, not only what it seeded.** `shared_cards.event_id` is
  `ON DELETE NO ACTION` deliberately, so a surviving card refuses `DELETE FROM events` and breaks
  the re-seed with an error naming neither table. The next feature with a non-cascading reference
  to seeded content will meet this.

**Session Q&A (009)**

- **No fourth branded scope and no fourth route audit, and that is an outcome rather than a
  saving.** A question always belongs to a session and a session to exactly one event, so
  `EventScope` reaches it — **provided every address says so**. Three of the five routes could
  find their question from `:questionId` alone and name their conference anyway, because
  `event-scope-audit` examines a route only if it declares an event parameter and **reports
  success otherwise**. Tidying `/events/:eventId/questions/:id` to `/questions/:id` would remove
  these routes from the only guard covering them while the whole suite stayed green. A dedicated
  assertion now pins the naming rule, which is the cheapest of the three mechanisms 007 and 008
  each had to build.
- **The audit's conference-content predicate was narrowed, and the narrowing is a decision.** It
  matched any path *containing* `/sessions`, which flagged `POST …/sessions/:id/questions` — a
  write to **attendee state about conference content**, which is 005's distinction. It now asks
  what a path *addresses*: the last non-parameter segment. 005 dodged this only by accident of
  naming (`/agenda/saved/:sessionId`); Q&A is the first attendee-owned resource that genuinely
  nests under a session. The predicate is checked against a table of paths that must still be
  caught, because a guard exercised only by the routes that happen to exist stops guarding when
  they change.
- **The author join applies NONE of the directory's three conditions**, and each absence is the
  feature: not discoverability (FR-734), not verification (FR-735), and no registration join.
  `listDirectory` one file over has all three, so a reader arriving from it will see this query
  as incomplete. Attribution has no opt-out — that is what v3.3.0 records — and consulting
  verification would be a second use of a signal the constitution reserves for discoverability
  alone.
- **A vote count is `count(*)` at read time and must never become a column.** A denormalised
  counter is a second source of truth for a number the rows already answer, and the one that
  drifted would be the one displayed. 008 records the same reasoning for `lapsed`.
- **The composite primary key on `question_votes` IS one-vote-per-attendee.** Enforced by the
  schema rather than by handler logic, so a double-tap is the same request twice and no code path
  exists that could produce a duplicate by forgetting to check.
- **Withdrawal re-checks "no votes" inside the deleting transaction, with the question row
  locked.** `SELECT … FOR UPDATE` conflicts with the `FOR KEY SHARE` a vote insert takes on its
  parent, so a vote arriving between the reader seeing "you can withdraw this" and pressing the
  control blocks until the transaction ends. Checking before the transaction is the race FR-714
  exists to close, and it is the one property no layer but a real database can test.
- **Every write returns the full re-ordered list.** The only shape satisfying immediate update,
  server-side ordering and focus preservation at once — and the last of those is why rows are
  keyed on the question id: focus is lost when a node is **unmounted**, not when it is moved.
- **The repository is undecorated, which makes the offline rules structural rather than
  classified.** `cached` treats every method not in `reads` as a write and a write purges the
  whole conference prefix — 008's defect. Not decorating removes the mechanism instead of
  configuring it: there is no `reads` map to omit from and no `args[0]` to misread. **Do not add
  `cached` here to gain `passThrough`.**
- **Two explained refusals, and both pass the same test — the follow-up question is about the
  READER.** Withdrawal refused because a vote exists, and a vote refused because the caller is
  the author. Everything else is the indistinguishable 404. The client classifies on
  `error.code`, never on the class, and a test requires all five outcomes to be **different from
  each other** — the property `instanceof` classification destroys, and the one that would have
  caught 008's swallowed messages.
- **Blocking filters the read and enters no aggregate.** Bidirectional, pair never ordered,
  nothing written — so lifting a block restores the questions with no repair path, the deliberate
  opposite of what a block does to an appointment. A block changes **no other reader's count**,
  including a vote the blocker already cast.
- **A nested dialog's `cancel` reaches ancestor React handlers.** The DOM event does not bubble;
  React's synthetic system delivers it anyway. `SessionPanel` compares `event.target` against its
  own dialog, and without that one Escape on an inner confirmation closes the panel and changes
  the address. Invisible to every component test, because jsdom has no top layer.
- **Eleven requirements are absences**, gathered in `apps/api/tests/unit/qa-absences.test.ts` and
  `apps/web/tests/unit/qa-absences.test.ts`: no edit route, no downvote or reaction, no voter
  disclosure, no answer/pin/moderation route, no Home card, no destination, no de-duplication,
  nothing that polls, no contact derived from a question, no bell, no column on the attendee
  record. **Both guards strip comments before matching**, because every pattern also appears in
  the prose explaining the absence — matching raw text fails on a correct implementation, and the
  natural repair is to weaken the pattern until it checks nothing.

**Administration (013)**

- **A second product, not a second surface.** `apps/admin/` is its own Vite application on its own
  origin. The cheaper option — a second entry point inside `apps/web` with the PWA plugin
  configured to exclude it — was rejected because **an exclusion is configuration a later change
  can widen, while a separate application has nothing to exclude.** There is no manifest to omit an
  entry from, no worker to scope away, and no precache glob that could pick these assets up.
- **A subdomain, because it is the only topology that is both same-site and different-origin.**
  `SameSite` is evaluated against the **registrable domain**, so `admin.<host>` keeps decision 19's
  CSRF defence with no synchroniser token, while still getting its own storage, worker scope and
  CSP. A path shares the origin and the attendee worker is registered at **root scope**, so it
  would intercept administrative navigations; a separate registrable domain stops `SameSite=Lax`
  being sent, which is the exact v3.0.0 failure where nobody could sign in.
- **A fourth branded scope, and the tier is a TYPE-level refinement.** `VerifiedPlatformScope`
  extends `VerifiedOperatorScope` and adds a **second private field**, which makes a platform scope
  usable where an operator scope is wanted and not the reverse. A subclass adding nothing would be
  assignable both ways with every test still green, and the thing that gets through is a conference
  organizer reading the report queue. Asserted with `@ts-expect-error`, so it fails the
  **typecheck** rather than the test run.
- **The minting functions are exported, and a sole-importer test is what replaces a private
  constructor.** The other three scopes hold their class and guard in one file, so `new` is simply
  unavailable elsewhere; 013 splits them across two files and pays for it with one reviewable test.
  That test scans `src/` **only** — a test fabricating a scope proves nothing about what a request
  can reach.
- **The report queue is the third recorded Principle VIII exception**, and every bound is visible
  in the query: platform tier only, only what was reported, only in the queue, and the reporter is
  still told nothing. **`content unavailable` is a first-class state, not an error** — reported ids
  are a plain array rather than a foreign key precisely because the content is usually gone before
  anybody looks.
- **Reading one report writes an audit entry; reading the queue does not.** The list carries no
  content, so an operator scrolling has disclosed nothing, and a trail recording it would be a
  record of *scrolling* rather than of disclosure.
- **An administrative act and the entry accounting for it commit in one transaction** (FR-994).
  This was the headline post-review fix: `appendAuditEntry` had taken an executor from the start
  and no caller passed one, so a failing entry left the act committed and unrecorded. Guarded
  twice — a source assertion that every call passes the transaction, and a behavioural test that
  fails the insert and asserts the act is gone.
- **`removeQuestion`'s `FOR UPDATE` lock must be given a TRANSACTION, and the type cannot say so.**
  Handed the pool, each statement autocommits, the lock is released by the `SELECT` itself, and the
  vote it exists to serialise slips in before the `DELETE` — invisibly, because the question is
  still removed and what breaks is an attendee's upvote 500ing later.
- **FR-918 is the one uniqueness rule in the product enforced by application code.**
  `attendees.email` and `operators.email` are two unique indexes on two tables and no constraint
  spans them, so it is checked inside the caller's transaction on **both** create paths — and the
  refusal is the *same* 409 an attendee-held address gives, or sign-up becomes an oracle for which
  addresses hold administrative accounts. **FR-915 depends on it**: administrative sign-in resolves
  an address with a single lookup and no branch.
- **The bootstrap never resets a password an operator chose**, expressed as
  `WHERE credential_is_initial = true` rather than a prior read. An idempotent upsert would be a
  credential reset triggered by an environment variable that stays on the host forever. This is
  what makes `pnpm start` safe to run repeatedly while issuing a credential.
- **The seed creates operator identities with NO credential**, and that is the requirement: this
  repository is public, so a committed administrative password is a *published* credential for the
  tier that reads the report queue.
- **An organizer's authority cannot outlive their access.** Deleting an account revokes every
  assignment in the same transaction; withdrawing from a conference revokes that one. A conference
  left with no organizer enters an explicit derived **`unassigned`** state rather than silently
  reverting to the platform tier — a tidier invariant that would hide the event nobody is prompted
  to act on.
- **Absences with tests**: no admin surface, privileged view or role-dependent rendering in MyNet
  (FR-970–FR-984); no route that suspends, removes or restricts an *attendee* — an operator acts on
  content and on authority, never on a person; no profile edit at any tier; and no read path over
  the audit trail (FR-999).

**App fixes, mutual exchange and the install icon (016)**

- **A card exchange is MUTUAL, atomic, and guarded once.** `shareCard` opens
  `getDb().transaction()` and writes **both rows or neither** (FR-1022) — a restructure rather than
  a second insert beside the first, because statements handed the pool autocommit. The guard is
  evaluated **once** and governs both inserts: per-insert it would run twice, and a registration
  withdrawn between them writes one row and not the other. `cards-atomicity.test.ts` induces the
  failure with a **real `BEFORE INSERT` trigger** on the reciprocal row — mocking the query layer
  would prove the property is checked while checking nothing, since the subject *is* the transaction.
- **FR-1053's discoverability guard is load-bearing for the amendment, not inherited convention.**
  C1 licenses taking somebody's card without asking on one ground: a card resolves only what its
  owner already published to co-attendees. Against a non-discoverable recipient that ground does not
  exist, so **relaxing the condition needs another amendment**. The physical-card metaphor is
  explicitly *not* the argument — it was available to v3.2.0 (N2) and cannot unmake it.
- **`requireHeldCard` stays DIRECTIONAL even though exchanges are now mutual**, and the reason
  changed with C1. It used to be *"sharing gives; it does not take"* (FR-602, retracted). It is now
  that **the row is the authority**: a symmetric `OR` would grant a read from a *single* row, which
  is the state of every card written before 016 and of any pair whose second insert never happened.
- **The conversation list polls at 10s; the thread stays at 3s.** `usePoll` carries 007's four
  properties (visible-only, jittered, backing off to a ceiling, three-failure threshold) so a second
  caller cannot re-argue them. **SC-1002's 15-second bound is arithmetic, not slack** — a poll of
  interval N has a worst case of N plus jitter plus the request.
- **FR-1054's pause condition asks the LIST, never the width.** `useDisplayed` observes the pane's
  own `class`/`style` with a `MutationObserver` and reads `display`. A first version re-measured on
  navigation and a test hiding the pane directly caught it: the address is not what determines
  whether an element is displayed, and that version was the width-coupling one step removed.
- **Messages stays entirely uncached, and a refresh loop is what will tempt somebody to change it.**
  `messages-absences.test.ts` fails if `conversations` or `messages` is wrapped in `cached`.
- **The password reveal control is implemented TWICE, deliberately.** `apps/admin` depends on
  `@mynet/data` and `@mynet/config` only, and a `packages/ui` holding one component would give the
  administrative site its first dependency on shared *presentation*. **What prevents divergence is
  the test, not the code**: the same assertions run in both products, so a drift fails a build.
  Revisit when a *second* shared control appears. `type="button"` on the toggle is load-bearing —
  without it, revealing a password submits the sign-in form and spends a throttle attempt.
- **An eighth device capability, `InstallService`, ratified in constitution v5.1.0.** The second
  added by an implementation rather than a product decision, on `VisibilityService`'s precedent —
  **the listing is the ratification act**. It exists because iOS delivers notifications only to an
  installed application, and asking needs `matchMedia` plus `beforeinstallprompt`, both refused in
  feature code. **The interface models both platform halves as first-class**: `promptToInstall` is
  `null` where the platform offers none, so FR-1034's "no control that cannot work" is enforced by
  the type rather than remembered.
- **Two brand pipelines, two sources, one `public/` directory — and the boundary is the fragile
  part.** `generate-install-icons.mjs` owns MyNet's install icons and favicons from
  `new-logo.png`; `generate-brand-assets.mjs` keeps the board and owns **every in-app mark in both
  products and every administrative asset**. A separate path rather than a parameterisation, because
  a flag-selected constant set is how the wrong crop applies silently. `brand-audit.mjs` asserts the
  two write **disjoint** sets.
- **The ~3.23× upscale is a named exception with three coordinates — this source, this factor, these
  outputs — and a second upscale still fails.** Checked for **equality**, not as a ceiling: a
  ceiling is what quietly absorbs the next one. **Weakening it until it stops checking anything is
  forbidden.** The home-screen icon now visibly differs from the in-app coral mark: **knowingly
  accepted, and register entry 28 is why that is recorded rather than rediscovered.**

**016's deep review — 33 findings, all fixed. What it changed that is now invariant:**

- **A requirement whose subject is PROSE cannot be verified by searching for its own number**, and
  this is the review's most transferable finding. FR-1052 required every comment citing the retracted
  one-directional rule to be rewritten. It scored **compliant** because the number appears wherever
  the work was done — and nowhere it was missed. **The check is brightest exactly where it is
  blindest.** Five files still asserted the old rule as current fact.
- **The product told the sharer the exchange had not happened, and two green tests required it to.**
  `ShareCardAction` said *"you will hold theirs when they share it with you"* while the server wrote
  both rows, on the one surface whose header says it exists to prevent a misreading of card
  direction. It passed every gate because **FR-1052 was scoped to comments and never reached product
  copy** — now **FR-1055** — and because the suite was *enforcing* the retracted model.
  `apps/web/tests/unit/card-model-record.test.ts` is the guard. Unlike every other absence test here
  it reads **prose rather than stripping it**, because prose is its subject, and it exempts
  explicitly-marked historical notes by paragraph — a sentence window produced false positives on
  correct paragraphs, and **a guard that cries wolf gets weakened until it checks nothing**.
- **An inventory that is read twice must be DERIVED twice, never written twice.** The upscale
  exception measured a hand-maintained list of 6 while the pipeline emitted 7, so a new icon at
  6.46× would have passed green. Both readers are now projections of one `INSTALL_ICONS`, and
  `MAX_UPSCALE` is derived — a new output fails **by existing**, which is `deletion-coverage`'s
  property. The coverage assertion is deliberately in **both** `brand-audit.mjs` and the unit test:
  they fail at different moments, and the unit layer needs no build.
- **The application pool now carries `lock_timeout`, `statement_timeout` and
  `idle_in_transaction_session_timeout`.** 016's deadlock fix traded a fast `40P01` abort for a
  **wait**, and nothing bounded it — `shareCard` holds 1 of 10 connections across five round trips,
  so ten stalled shares exhaust the pool and **every route stops serving**. `statement_timeout` is
  deliberately larger than `lock_timeout` so a blocked statement fails as `55P03`, naming its cause.
  `migrate.ts`'s header — which had said this was "a different decision nobody has made" — now points
  here: **a migration prefers to abort loudly, a request prefers to fail one caller fast.**
- **A lint denylist is a list of what somebody remembered.** `getComputedStyle` and
  `MutationObserver` were absent, so `useDisplayed` reached them freely — while `matchMedia`, one
  identifier away, required **constitution v5.1.0 and an eighth capability**. Five identifiers added;
  the three violations resolved with **per-line** disables carrying reasons, never a file-level
  exemption, so a fourth platform call still fails.
- **`useDisplayed` observes size, not attributes, and `IntersectionObserver` was REJECTED for it.**
  Its default root is the **viewport** — the exact coupling FR-1054 forbids — and it would pause the
  refresh for a list merely scrolled out of view. A `MutationObserver` on `class`/`style` could not
  see a breakpoint change at all, because the class string is constant and only the *computed* style
  moves.
- **A superseded read must report "superseded", not success.** Returning normally let `usePoll`
  reset the failure count and clear the staleness notice while the retry was still failing — a
  load-amplification path during an incident. `POLL_SUPERSEDED` is the third outcome; FR-1012's
  screen guarantee is unchanged.
- **`exchangePermitted` takes `FOR SHARE`, and it must never become `FOR UPDATE`.** Shared locks do
  not conflict, so simultaneous exchanges lock each other's rows in opposite orders and neither
  waits. An exclusive lock here would break the pair sort that fixed the deadlock.

**Deployment**

- **`deploy/vm/` is the whole platform**: Caddy with automatic Let's Encrypt TLS serving the built
  client and reverse-proxying `/api/*`, an API container, and a **loopback-only** PostgreSQL
  container. `deploy/vm/README.md` is the operator runbook; read section 6 before rolling back.
- **`/ready` is what a deployment gates on**; `/health` is deliberately unchanged. A container with
  an unreachable database answers `/health` perfectly and every attendee request with a failure.

