# Feature Specification: App fixes, mutual card exchange, and the install icon

**Feature Branch**: `feat/016-app-fixes-and-install-icon`

**Created**: 2026-08-12

**Status**: Draft

**Input**: Six items the project owner reported after using the running product, recorded in
`brainstorm/10-app-fixes-and-install-icon.md` and ratified where they needed ratifying in
constitution **v5.0.0** (C1, C3, C4).

## Context and departures

**This feature departs from the delivery roadmap by existing.** The roadmap
(`docs/superpowers/specs/2026-08-06-mynet-delivery-roadmap-design.md`) ends at the attendee
programme, and brainstorm #09 opened an administrative programme of three features. This is neither:
it is repair and one reversal, arising from the owner using the deployed product. Governance requires
the departure to be stated, and this is the statement.

**It takes number 016 rather than the next sequential number.** `specs/` runs to `013`, so automatic
numbering would assign `014` — which is **reserved** for conference content authoring, with `015`
reserved for registration and invitations. Parallel reservations are why this project has now skipped
numbers three times, and the convention is settled: take the next free number, never renumber a
reservation.

**It is the first feature to exceed the three-digit requirement convention.** 013 reached FR-999.
This feature numbers from **FR-1001**.

**Two shipped guarantees change here, and both were ratified before any code was written** —
constitution v5.0.0, decisions C1 (mutual card exchange, reversing v3.2.0 N2) and C3 (the
administrative-counterpart declaration). The amendment gating the code is this project's established
order, followed by v3.1.0/007, v3.2.0/008, v3.3.0/009 and v4.0.0/013.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Send a message from a phone (Priority: P1)

An attendee at a conference opens a conversation on their phone, types a message longer than a line
or two, and sends it. The composer grows to fit what they are writing and then stops growing. The
send control stays where they can reach it, above the on-screen keyboard, however much they type.

**Why this priority**: This is the most severe of the six. Mobile is the primary context the product
was designed for — a person walking around a venue — and today the send control leaves the viewport
as the field grows, so a sufficiently long message cannot be sent at all. Every other item degrades
an experience; this one removes a capability.

**Independent Test**: Open a thread at the narrowest supported width with a keyboard raised, type
enough to exceed the composer's initial height, and confirm the send control remains within the
viewport and activatable. Delivers a working mobile composer with nothing else in this feature built.

**Acceptance Scenarios**:

1. **Given** a thread open on a mobile viewport with the on-screen keyboard raised, **When** the
   attendee types content exceeding the composer's initial height, **Then** the composer grows to
   accommodate it up to a bounded maximum and the send control remains fully within the viewport.
2. **Given** a composer already at its maximum height, **When** the attendee continues typing,
   **Then** the composer stops growing and its content scrolls internally, and no page-level
   horizontal scrolling is introduced.
3. **Given** a composer containing only whitespace, **When** the attendee looks at the send control,
   **Then** it is disabled rather than presenting an error after submission.
4. **Given** a thread open on desktop, **When** the attendee types a long message, **Then** the
   thread above the composer remains partially visible rather than being fully displaced.

---

### User Story 2 - See new conversations and unread state without leaving Messages (Priority: P2)

An attendee opens a conversation from someone's profile, sends a message, and returns to the
conversation list — the new conversation is there. An attendee sitting on the conversation list
receives a message and sees the unread indicator appear without touching anything.

**Why this priority**: This is the item the owner reported, and it is wider than reported. The list
loads once when the destination mounts and never again, so it is stale for *every* conversation while
Messages is open, not only newly created ones — unread indicators and last-message previews included.
The thread beside it polls every three seconds, so the product currently shows a live conversation
next to a frozen list of conversations.

**Independent Test**: With Messages open and untouched, have a second attendee send a message, and
confirm the list reflects it without navigation. Delivers list freshness with nothing else built.

**Acceptance Scenarios**:

1. **Given** the Messages destination is open and visible, **When** another attendee sends the reader
   a message, **Then** the conversation list reflects the new message and unread state without the
   reader navigating away and back.
2. **Given** the reader opens a new conversation from a profile and sends the first message, **When**
   they return to the list, **Then** that conversation appears in it.
3. **Given** the Messages destination is open, **When** the browser tab becomes hidden, **Then** the
   list stops requesting updates, and **When** it becomes visible again, **Then** it refreshes
   immediately rather than waiting for the next interval.
4. **Given** repeated refresh attempts fail, **When** failures continue, **Then** the interval backs
   off rather than holding steady, and the reader is told the list has stopped keeping up.
5. **Given** the list is refreshing in the background, **When** a refresh succeeds, **Then** the
   reader's scroll position and keyboard focus are preserved.

---

### User Story 3 - Enter a password correctly, on both products (Priority: P3)

Someone creating an account, resetting a password, or signing in can reveal what they have typed to
check it. Someone choosing a new password types it twice, and cannot submit until the two match.

**Why this priority**: Password entry with no reveal is a well-known source of failed sign-in on
phones, where touch keyboards mistype and autocorrect interferes — and this product's primary context
is a phone. The confirm field prevents an attendee locking themselves out of an account whose
recovery path is email they may not be able to reach at a venue.

**Independent Test**: On each screen carrying a password field, confirm the reveal control shows and
hides the value, and that mismatched confirmation blocks submission before any request is made.

**Acceptance Scenarios**:

1. **Given** a password field with content, **When** the reader activates the reveal control, **Then**
   the value becomes readable, and **When** they activate it again, **Then** it is masked.
2. **Given** a revealed password field, **When** the reader navigates away from the screen and
   returns, **Then** the field is masked again — the revealed state is never remembered.
3. **Given** a sign-up or password-reset form, **When** the password and confirmation differ, **Then**
   the submit control is disabled and the mismatch is described, rather than the form being
   submitted and refused.
4. **Given** a screen reader, **When** the reveal control is focused, **Then** it announces both what
   it does and the current state of the field.
5. **Given** the administrative sign-in screen, **When** an operator enters their credential, **Then**
   the same reveal behaviour is available as in MyNet.

---

### User Story 4 - Exchange cards mutually (Priority: P4)

An attendee shares their digital business card with someone they have met. Both people now hold each
other's card, and both appear in each other's contacts.

**Why this priority**: It is the one item requiring a reversal of ratified governance, which is why it
was ratified first (v5.0.0 C1). It is placed below the repairs because the current behaviour is
coherent and working rather than broken — an attendee can share a card today and the other person can
share back.

**Independent Test**: Share a card between two accounts and confirm both contact lists contain the
other, with no action taken by the recipient.

**Acceptance Scenarios**:

1. **Given** two attendees who share a current conference and hold no cards from each other, **When**
   one shares their card, **Then** both hold the other's card and each appears in the other's
   contacts, with no action required from the recipient.
2. **Given** an exchange in progress, **When** either record cannot be written, **Then** neither is
   written and the sharer is told the exchange did not happen.
3. **Given** two attendees who have exchanged cards, **When** one blocks the other, **Then** card
   resolution is severed in both directions.
4. **Given** a block is subsequently lifted, **When** either attendee views their contacts, **Then**
   both cards resolve again with no repair action, exactly as before the block.
5. **Given** an attendee who already holds a card from someone, **When** that person shares again,
   **Then** no duplicate contact is created and the existing relationship is unchanged.
6. **Given** attendees who no longer share any conference, **When** either views their contacts,
   **Then** the exchanged cards still resolve, because cards are cross-event.

---

### User Story 5 - Learn how to install, and why (Priority: P5)

Someone signing in on a phone that has not added MyNet to its home screen is told that installing
enables notifications, and how to do it on their device.

**Why this priority**: It is additive rather than corrective, and it unlocks a capability rather than
restoring one. It matters because notification delivery on iOS is *only* available to an installed
app, so an attendee on an uninstalled iPhone can grant permission and still receive nothing.

**Independent Test**: Open the sign-in screen on an uninstalled mobile browser and confirm the
guidance appears with instructions matching the platform; open it on an installed instance and on
desktop, and confirm it does not.

**Acceptance Scenarios**:

1. **Given** a mobile browser that has not installed MyNet, **When** the sign-in screen is shown,
   **Then** guidance explains that installing enables notifications and how to install on that
   platform.
2. **Given** MyNet is already running as an installed application, **When** the sign-in screen is
   shown, **Then** no guidance appears.
3. **Given** a desktop browser, **When** the sign-in screen is shown, **Then** no guidance appears.
4. **Given** a platform that offers a system install prompt, **When** the reader accepts the
   guidance, **Then** the system prompt is presented rather than instructions alone.
5. **Given** a platform offering no install mechanism to the page, **When** the guidance is shown,
   **Then** it gives steps the reader performs themselves and does not present a control that
   cannot work.
6. **Given** the reader dismisses the guidance, **When** they return to the sign-in screen, **Then**
   it does not reappear.

---

### User Story 6 - The installed icon is the new mark (Priority: P6)

Adding MyNet to a phone's home screen produces an icon showing the owner's new mark.

**Why this priority**: Cosmetic relative to the rest, and the only item whose acceptance cannot be
judged by any automated gate — it needs a person looking at a physical home screen.

**Independent Test**: Regenerate the icons, install on a device, and look at the result.

**Acceptance Scenarios**:

1. **Given** the new brand source, **When** the asset pipeline runs, **Then** install icons and the
   MyNet favicon are produced from it, cropped to the mark with the wordmark excluded.
2. **Given** the pipeline runs twice with unchanged inputs, **When** the outputs are compared,
   **Then** they are byte-identical.
3. **Given** a maskable icon, **When** a circular mask is applied, **Then** no part of the mark is
   clipped.
4. **Given** the application is running, **When** any in-app mark is viewed, **Then** it is
   unchanged — the coral mark on the rail, the top bar and the five authentication screens.
5. **Given** the administrative site, **When** its favicon is viewed, **Then** it is unchanged.
6. **Given** a declared icon whose file is missing, **When** the build runs, **Then** it fails.
7. **Given** an asset upscaled beyond the recorded exception, **When** the audit runs, **Then** it
   fails.

---

### Edge Cases

- **A message arrives while the reader is typing a reply.** The list refresh must not disturb the
  composer's content, selection, or focus.
- **A conversation is opened while the list is mid-refresh.** The reader's navigation wins; a
  late-arriving response must not change what is on screen.
- **Both attendees share a card with each other at the same moment.** The result is one relationship
  in each direction, not duplicates, and neither share fails.
- **An attendee shares a card with someone who has since deleted their account.** The refusal must
  remain indistinguishable from the other refusals this route already produces, disclosing nothing
  about whether that account existed.
- **The composer's maximum height exceeds the available viewport** on a very short screen with the
  keyboard raised — the send control must still be reachable, which means the bound is relative to
  available space rather than an absolute figure.
- **A password is revealed and the device is locked or the app backgrounded.** Reveal state is not
  persisted, so returning shows a masked field.
- **The reveal control on a field the browser has autofilled** must not expose a credential the
  reader never typed without their action, which it does not, because revealing requires activation.
- **An attendee installs the application after dismissing the install guidance.** The guidance must
  not reappear, and must not have been the only path to installing.
- **A platform reports itself as installable but the install is declined by the reader.** The
  guidance must not treat a declined install as an error.

## Requirements *(mandatory)*

### Functional Requirements

**The message composer (US1)**

- **FR-1001**: The message composer MUST grow to fit its content up to a bounded maximum, and MUST
  NOT grow beyond it.
- **FR-1002**: The bound MUST be expressed relative to the space available to the thread rather than
  as a fixed height, so that it holds on the shortest supported viewport with an on-screen keyboard
  raised.
- **FR-1003**: The send control MUST remain within the viewport and activatable at every composer
  height, at every supported width.
- **FR-1004**: Beyond the bound, composer content MUST scroll within the composer.
- **FR-1005**: The composer MUST NOT be resizable by direct manipulation, because a reader-chosen
  height can violate FR-1003.
- **FR-1006**: An empty or whitespace-only composer MUST leave the send control disabled rather than
  producing an error after submission.

**Conversation list freshness (US2)**

- **FR-1007**: The conversation list MUST refresh on an interval while the Messages destination is
  open and the document is visible.
- **FR-1008**: Refreshing MUST stop while the document is hidden, and MUST refresh immediately on
  becoming visible rather than waiting for the next interval.
- **FR-1009**: Consecutive refresh failures MUST increase the interval up to a ceiling, and MUST
  recover without the reader reloading.
- **FR-1010**: After a threshold of consecutive failures, the reader MUST be told the list has
  stopped keeping up, distinguishing being offline from a fault on the server side.
- **FR-1011**: A refresh MUST preserve scroll position and keyboard focus.
- **FR-1012**: A refresh response that arrives after the reader has navigated MUST NOT alter what is
  displayed.
- **FR-1013**: The conversation list MUST NOT be cached to device storage. The refusal to cache
  Messages is unchanged.

**Password entry (US3)**

- **FR-1014**: Every password field in both products MUST offer a control that reveals and re-masks
  its value.
- **FR-1015**: The revealed state MUST NOT persist across navigation, reload, or application restart.
- **FR-1016**: The reveal control MUST carry an accessible label describing both its action and the
  current state, and MUST be keyboard operable.
- **FR-1017**: MyNet's sign-up and password-reset forms MUST each carry a confirmation field.
- **FR-1018**: A mismatch between password and confirmation MUST disable submission and describe the
  mismatch, and MUST NOT be reported only after a submission attempt.
- **FR-1019**: The confirmation field MUST NOT be submitted to or stored by the server; it exists to
  catch a typing error before it becomes an account nobody can reach.
- **FR-1020**: Password strength rules, minimum lengths, and the credential policy itself are
  **unchanged**. This feature changes how a password is entered, never what is accepted.

**Mutual card exchange (US4)**

- **FR-1021**: Sharing a card MUST establish the relationship in both directions: the recipient holds
  the sharer's card and the sharer holds the recipient's.
- **FR-1022**: Both records MUST be written in one transaction, or neither.
- **FR-1023**: The recipient MUST NOT be asked, and MUST NOT be required to act for the exchange to
  complete. There is no pending state.
- **FR-1024**: Both records MUST record the conference at which the exchange happened as a
  **historical fact**, and neither MUST be **scoped by** it. Cross-event means a card resolves after
  either attendee leaves that conference or switches to another — not that the conference goes
  unrecorded. Both records carry the same conference, since both arise from one act at one place.
- **FR-1025**: Sharing where a relationship already exists in one or both directions MUST complete
  without creating a duplicate and without failing.
- **FR-1026**: A block MUST continue to sever card resolution in both directions, and lifting a block
  MUST restore both without a repair action.
- **FR-1027**: Card resolution is otherwise **unchanged**: a card still resolves the sharer's live
  profile rather than a snapshot, still bypasses the discoverability condition, still does not consult
  verification state, and still cannot be recalled.
- **FR-1028**: A refusal to share MUST remain indistinguishable from the refusals this route already
  produces, disclosing nothing about whether a given account exists.
- **FR-1029**: The exchange MUST NOT dispatch a notification. The trigger set remains a received
  message and nothing else.
- **FR-1030**: The recipient MUST be able to discover the new contact in the **Network destination**,
  which is the only surface that lists contacts. **There is no Home card for contacts and this
  feature MUST NOT add one**, and no notification is dispatched (FR-1029) — so a card acquired
  through somebody else's act is found on the recipient's next visit to Network and not before.
  That is an accepted consequence of C1 rather than an oversight, and it is recorded as an open
  question below rather than silently absorbed.
- **FR-1051**: The existing "cards you have shared" read path MUST have its meaning restated. It
  reads the sharer direction and has been documented since 008 as *cards you have given away*; under
  mutual exchange it returns rows the reader never gave. The feature MUST either redefine it as
  *people who hold your card*, or withdraw it — and MUST NOT leave it carrying its old description.
  **It has no consumer, so nothing else will catch this**: it is the route 008's review recorded as
  existing without a caller.
- **FR-1052**: Every comment, docblock and header that explains card behaviour by citing the
  one-directional rule MUST be rewritten to cite what is now true. This explicitly includes the
  export's own reasoning, which justifies disclosure by "the standing consent constitution v3.2.0
  (N2) established" — a clause C1 reverses. **The behaviour and the record of why MUST change in the
  same commit**: this project's discipline is that the comment is the record, and a header describing
  a rule that no longer exists is the defect class 013's review named its most transferable finding.

**Install guidance (US5)**

- **FR-1031**: The sign-in screen MUST present install guidance when, and only when, the reader is on
  a mobile-class device and the application is not running as an installed application.
- **FR-1032**: The guidance MUST state that installing is what enables notifications, rather than
  asking to be installed without a reason.
- **FR-1033**: Where the platform offers the page an install mechanism, the guidance MUST offer to
  invoke it.
- **FR-1034**: Where the platform offers no such mechanism, the guidance MUST give steps the reader
  performs themselves, and MUST NOT present a control that cannot work.
- **FR-1035**: The guidance MUST be dismissible, and a dismissal MUST be remembered.
- **FR-1036**: The guidance MUST NOT request notification permission, and MUST NOT become a second
  place that does. The existing permission surface remains the only caller.
- **FR-1037**: The guidance MUST NOT block, obscure, or delay signing in.

**The install icon (US6)**

- **FR-1038**: MyNet's install icons and favicon MUST derive from `assets/brand/new-logo.png` by a
  readable script.
- **FR-1039**: Every in-app mark MUST continue to derive from `assets/brand/logo.png` and MUST be
  visually unchanged.
- **FR-1040**: The administrative site's favicons MUST be unchanged.
- **FR-1041**: The wordmark MUST be excluded from every derived asset.
- **FR-1042**: Regeneration from unchanged inputs MUST be byte-identical.
- **FR-1043**: The maskable icon MUST place the mark entirely within the circular safe zone.
- **FR-1044**: The plate colour MUST be chosen deliberately and its choice recorded where it is
  defined, because the derivation used for the board's navy does not apply to a source with an alpha
  channel.
- **FR-1045**: The upscale MUST be recorded as an exception naming the source file, the scale factor,
  and the specific outputs it covers. An upscale outside that exception MUST fail the build.
- **FR-1046**: A declared icon with no file on disk MUST continue to fail the build.
- **FR-1047**: Install icons and favicons MUST remain excluded from the service worker's precache
  set, as established when the icons last changed.
- **FR-1048**: The weight of every changed install asset MUST be recorded in a durable place.

**Administrative counterpart (C3)**

- **FR-1049**: The administrative sign-in and credential-replacement screens MUST carry the same
  reveal control as MyNet's password fields.
- **FR-1050**: The administrative credential-replacement screen's existing confirmation field MUST
  behave identically to MyNet's new ones, so that one behaviour is described in one place rather than
  two implementations diverging.

### Key Entities

- **Card exchange record**: the existing record of one attendee giving their card to another —
  sharer, recipient, instant, and the conference at which it happened. This feature causes **two**
  such records to be written per share rather than one. No new attribute, no new table, no schema
  change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-1001**: An attendee can compose and send a message of at least 500 characters on the narrowest
  supported viewport with an on-screen keyboard raised, without scrolling the page and without losing
  sight of the send control.
- **SC-1002**: A message sent by another attendee becomes visible in the reader's conversation list
  within 10 seconds, without the reader navigating.
- **SC-1003**: Unread indicators in the conversation list reflect server state within the same
  interval, for every conversation rather than only recently created ones.
- **SC-1004**: Every password field across both products can be revealed and re-masked using the
  keyboard alone.
- **SC-1005**: A mismatched password confirmation is caught before any network request is made, in
  100% of cases.
- **SC-1006**: After one attendee shares a card, both attendees see each other in their contacts
  without either taking a further action.
- **SC-1007**: No partial exchange is observable: across repeated attempts including induced
  failures, contacts are either mutual or absent, never one-sided.
- **SC-1008**: A reader on an uninstalled mobile browser is told how to install and why, and a reader
  on an installed instance or a desktop browser is not.
- **SC-1009**: The home-screen icon on a physical device shows the new mark, legibly, judged by a
  person looking at it.
- **SC-1010**: No in-app mark changes anywhere in either product, verified against the shipped
  appearance.
- **SC-1011**: All ten correctness gates pass, and the brand audit fails if any asset is upscaled
  outside the single recorded exception.

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Actor and tier** (Principle III, added 4.0.0) | **Attendee**, in MyNet, for US1–US6. **Both administrative tiers**, in `apps/admin`, for FR-1049 and FR-1050 only — a password field serves whoever signs in, and the reveal control is not a privileged capability. No surface here renders differently by tier, and none reads or writes anything an administrator can see about an attendee. |
| **Administrative counterpart** (Principle IX, added 5.0.0) | **Item by item, because this is the first feature to answer this row.** *Composer bound* — none; the administrative product has no messaging surface. *Conversation list freshness* — none, same reason. *Password reveal* — **exists as a gap and is built here** (FR-1049): two administrative screens carry password fields and neither has a reveal control. *Password confirmation* — **already exists administratively and is the reference**: `ReplaceCredential` has carried a confirmation field since 013, and MyNet is the product missing it; FR-1050 aligns behaviour rather than adding a field. *Mutual card exchange* — **none, and the absence is required rather than incidental**: FR-970–FR-984 forbid any administrative view over attendee relationships, so an administrative surface for contacts would breach the amendment that permits administration at all. *Install guidance* — none; the administrative site is deliberately not installable, with no manifest and no service worker, and that absence is structural. *Install icon* — none for the manifest, which the administrative site does not have; its favicons exist and are **deliberately unchanged** (FR-1040), scoping the two-mark divergence to one product rather than spreading it to a third surface. |
| **Offline behaviour** (Principle VI) | **Unchanged in every respect.** Messages remains entirely uncached and its writes remain refused rather than queued (FR-1013). Card sharing is a write and is refused offline, as it is today. No repository member changes its live-or-cached classification, so the caching decorator's write-purges-the-prefix behaviour is not engaged. The install guidance reads no data. Password fields read no data. |
| **Desktop layout** (Principle IV) | Composer bound applies but is not load-bearing — the thread pane is tall. The two-pane Messages layout is unchanged, and the list refresh must not disturb either pane. Reveal controls sit inside existing password fields. Install guidance does **not** render. |
| **Tablet layout** (Principle IV) | As desktop. The composer bound is relative to available space, so it adapts without a second rule. Install guidance renders only if the device is mobile-class and uninstalled. |
| **Mobile layout** (Principle IV) | **The band this feature is about.** The composer bound and the send control's reachability (FR-1002, FR-1003) are mobile requirements first. Install guidance renders here. No content or primary action may require horizontal scrolling — and the composer at maximum height must not introduce any. |
| **Empty / loading / failure states** (Principle IV) | Conversation list: existing loading, offline, failed and empty states are retained; a **new** state is added for "refresh is failing repeatedly" (FR-1010), distinguished from being offline. Card exchange: an explained failure when the transaction cannot complete (FR-1022), and the existing indistinguishable refusal otherwise (FR-1028). Password confirmation mismatch is a disabled control with a description, never a post-submit error (FR-1018). |
| **Accessibility** (Principle IV) | Reveal controls carry accessible labels announcing action and state, and are keyboard operable (FR-1016). The composer remains labelled and its growth must not trap focus. Install guidance is dismissible by keyboard and is not a modal. The confirmation mismatch must be associated with its field for assistive technology, not only rendered near it. No new modal is introduced, so no new Escape handling arises. |
| **Validation checklist discharged** (Principle VII) | Discharges *message composition* and *keyboard focus visibility and accessible labels* in part, and *card-sharing feedback*. Explicitly does **not** discharge desktop and mobile rendering review (register entry 4) — SC-1009 requires a person, and this feature adds evidence to that entry rather than closing it. |
| **Identity scoping & server-side authorization** (Principle VIII) | The one server-side change is the card exchange, which writes a second record. Both records are written under the sharer's authenticated identity, and the recipient's card is established by that same act rather than by any claim the client presents. The existing branded card scope and its route audit are unchanged, and the reciprocal record MUST NOT introduce a path that lets a caller name which two attendees are related. Everything else in this feature is client-side. |
| **Deletion & export coverage** (Principle VIII) | **No new table and no new column**, so both coverage tests are satisfied by the existing declarations for card records. The reciprocal record is an additional row in a table already fully covered — reached by the deletion cascade from either attendee and already present in the export. The confirmation field is never stored (FR-1019), so it collects nothing to cover. |
| **Event scoping** (Standing decision D1/7) | **Cross-event, and this must be deliberate rather than inherited.** Card records have been cross-event since they shipped, and the reciprocal record follows the same rule (FR-1024). Neither is a default: the client repository for cards takes no conference identifier at all, which is what stops a later change scoping contacts to the conference on screen. |
| **Register position** (Governance) | **Blocked by**: nothing. **Resolves**: nothing. **Escalates**: entry 4 — this feature exists partly because a person found a layout defect no gate could see, and SC-1009 and SC-1001 both require human judgement rather than a passing test. **Relates to but MUST NOT resolve**: entry 28, opened by v5.0.0, which asks which of the two brand marks is MyNet's; this feature creates that condition under the owner's explicit direction and must leave the question open. Entry 23 (token adoption) is untouched. |
| **Reserved migration number** (Branching — parallel work) | **None claimed.** This feature adds no table and no column. `0010` remains reserved for 012, and the administrative programme's reservations are unaffected. |

## Assumptions

- **Mobile-class detection** is by viewport and pointer characteristics rather than by parsing user
  agent strings, which are unreliable and change without notice.
- **"Installed" detection** uses the display mode the browser reports. Where a platform reports
  nothing usable, the guidance shows rather than hides — a redundant hint is a smaller harm than an
  attendee who never learns notifications require installation.
- **The dismissal of install guidance** is remembered per device rather than per account, because it
  is a fact about the device, and because it must work before anybody has signed in.
- **The composer bound** is expressed as a proportion of available height rather than a pixel figure,
  which is what makes FR-1002 hold across viewports without a table of exceptions.
- **The list refresh interval** need not match the thread's three seconds. A list is lower-stakes than
  an open conversation, and the same request load applies to a two-vCPU host.
- **The reciprocal card record** records the same conference as the originating share, since it
  happened at the same moment and place. It is not re-derived from the recipient's own registrations.
- **`new-logo.png` is used as supplied.** The owner has confirmed no higher-resolution source exists
  and has licensed cropping. The resulting upscale is the recorded exception of FR-1045, not a defect
  to be repaired within this feature.
- **The gradient survives upscaling better than the mark's hard edges**, so the acceptance judgement
  in SC-1009 is about the white counter-form's crispness rather than about the gradient.

## Dependencies

- **Constitution v5.0.0** gates FR-1021–FR-1030 (C1), the administrative-counterpart row (C3), and
  FR-1038–FR-1048 (C4). Ratified 2026-08-12, before this specification.
- **`assets/brand/new-logo.png`**, supplied by the owner and tracked.
- **A physical mobile device and a person**, for SC-1001 and SC-1009. Neither is satisfiable by CI,
  and both are acceptance criteria rather than optional review.

### Known constraints planning will meet

Surfaced by the specification review and recorded so they are met early rather than late. Neither
changes a requirement.

- **FR-1022's atomicity requires restructuring how the share is issued.** The card share currently
  runs its statements against the connection pool, where **each statement autocommits** — so
  "both records or neither" cannot be satisfied by adding a second statement beside the first. This
  is the same trap recorded for the Q&A withdrawal lock in 013, where a statement handed the pool
  released its lock immediately and the type system could not say so. The requirement stands as
  written; the cost is that it is a restructure rather than an addition.
- **SC-1007 implies fault injection.** "No partial exchange is observable across repeated attempts
  including induced failures" cannot be demonstrated by a passing happy path — it needs a test that
  makes the second write fail and asserts the first is gone. That is the shape 013 used to prove an
  administrative act and its audit entry commit together.

## Out of Scope

Each is named because it is adjacent enough to be assumed in, and each has a reason.

- **Any change to the credential policy** — minimum length, strength rules, what the server accepts.
  This feature changes how a password is typed (FR-1020).
- **A rebrand.** The in-app mark does not change (FR-1039). The owner ruled explicitly that this is an
  icon change, and register entry 28 exists to hold the question open.
- **The administrative site becoming installable.** Its absence of a manifest and service worker is
  structural and stays.
- **Any notification arising from a card exchange** (FR-1029), and any second notification trigger.
- **A "cards you have given" surface.** Mutual exchange makes the given and held lists identical for
  most pairs; whether the unused read path gains a consumer is an idea-inbox question, not this
  feature's.
- **Requiring the recipient to be discoverable at the moment of sharing.** Constitution v5.0.0 leaves
  this explicitly undecided and requires the feature that builds mutual exchange to decide and declare
  it — see Open Questions, where it is the one item that must be settled before implementation.
- **Automatic grouping, moderation, or any Q&A change** — feature 017, blocked on register entry 27.

## Open Questions

- **Must the recipient be discoverable — and verified — for a mutual exchange to complete?** Sharing
  today requires the recipient to be **both** discoverable **and** to hold a verified address, plus
  both parties registered for the conference. Card *resolution* deliberately checks neither. A first
  acquisition is neither case, and constitution v5.0.0 requires this feature to decide and declare it
  rather than inherit either answer. **This is the one open question that must close before
  implementation**, because it changes the route's behaviour rather than its presentation.

  **Naming verification explicitly matters, because FR-1027 will otherwise look self-contradictory.**
  A share-time condition and a resolution-time prohibition are different things: verification gates
  discoverability and nothing else, so checking it *when deciding whether somebody can be reached* is
  consistent with never checking it *when resolving a card already held*. A reader who meets only the
  word "discoverability" here will think the two clauses conflict.

  The two candidate answers: require both, matching the current share check and preserving "you
  cannot acquire a card from someone who has chosen to be invisible"; or require neither, matching
  resolution and treating co-attendance plus the sharer's deliberate act as sufficient.
- **Is "found on your next visit to Network" enough** for a card acquired by somebody else's act?
  Under one-directional sharing the recipient's contacts only ever grew by their own reciprocation,
  so there was nothing to announce. Mutual exchange makes acquisition passive, and FR-1029 forbids a
  notification while FR-1030 records that no Home surface exists. Not blocking — the behaviour is
  fully specified — but it is the question C1 creates and nobody has yet asked.
- **The list refresh interval, as a number**, justified against request load on a two-vCPU host with
  a conference hall of clients. Not blocking: any value in a sane range satisfies SC-1002.
- **Whether the list refresh pauses while a thread is open.** The thread already polls the open
  conversation, so on mobile — where opening a thread replaces the list — a second poller is
  redundant. On desktop both panes are visible at once. Not blocking.
- **Whether the composer bound differs between the two-pane desktop layout and mobile.** FR-1002's
  relative expression may make one rule sufficient; if it does not, that is a finding for planning.
