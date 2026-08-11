# Feature Specification: UAT Deployment and Pre-Public Hardening

**Feature Branch**: `spec/010-uat-deployment-and-hardening`

**Created**: 2026-08-10

**Status**: Draft

**Input**: `brainstorm/08-uat-deployment-and-hardening.md`, ratified in constitution **v3.4.0**

## Context and Scope Note

Every feature 001–009 is delivered. Every destination `requirements.md` names answers its question.
**Nothing has ever been deployed**, and that has never been a gap in the code: `deploy/vm/` has been
complete since 006 — two Azure VMs, Caddy with automatic TLS, a loopback-only PostgreSQL container,
backups and an operator runbook — and what gated the first deploy was two owner decisions rather
than any missing mechanism.

Those decisions are taken. **Constitution v3.4.0 is what licenses this feature's first line**, in
the same way v3.2.0 licensed 008's and v3.3.0 licensed 009's.

### Departure from the delivery roadmap

The roadmap scopes **010 — Launch Readiness** as a validation pass: the whole `requirements.md`
checklist, an accessibility sweep across five destinations, a core-journey test at three widths, PWA
caching against real data volumes, a physical iPhone test, and a performance pass.

**This feature is not that, and the departure is deliberate.** Brainstorm #08 split the roadmap's
010 in two, because its halves have different blockers:

- **010 — this feature — is fully unblocked.** Every decision it needs was taken and ratified.
- **011 — Launch Readiness and Production — is not.** It remains blocked on register entries **2**
  (no brand mark or application icons exist) and **4** (the client has never validated the desktop
  or tablet experience), neither of which is decidable by anyone inside this repository.

Keeping them together would have held a working UAT hostage to a brand mark. The roadmap is a plan
rather than governance and may be revised without an amendment, provided the feature departing from
it says so — which this section is.

**One thing is worth stating in the other direction**: entry 4 has never been *answerable*, because
reviewing a layout requires a running product at a real screen width and there has never been one.
This feature is what makes it a question somebody can be asked. Sequencing it first is therefore how
011 gets unblocked, not a way of postponing it.

### The finish line, as one checkable sentence

**`https://mynet-dev.programasemilla.com` serves the product over a valid certificate; a person can
sign up, receive a verification email, join the seeded conference, and receive a push notification;
and a backup taken from that host has been copied off it and restored to prove it can be.**

### What this feature adds

**No schema. No migration. No new product capability, screen, route or destination.** An attendee
using MyNet after this feature ships sees what they saw before it, with three exceptions. Two are
refusals rather than features: some requests are rate-limited that were not, and an unverified
account can no longer share its card. The third is visible only in UAT — an indication that the
environment is not production (FR-828), which by requirement never appears in a production build.

Everything else is the environment the product runs in, the secrets it holds, and the mail it sends.

### What this feature does not do

Named here so its review does not read these absences as oversights, and so 011 does not have to
rediscover them.

- **It does not deploy production.** No `prod.env` value is filled, and `mynetcr.com` is not
  registered. Constitution v3.4.0 forbids committing it until it is.
- **It does not run the `requirements.md` validation checklist**, the accessibility sweep, the
  three-width core-journey test, the physical iPhone test, the PWA-caching-at-volume check, or the
  performance pass. All are 011's.
- **It does not address register entry 22** — a cached conference outliving a withdrawn registration
  by up to 24 hours. Product-wide, older than 009, and 011's.
- **It does not complete the three outstanding by-hand `quickstart.md` walkthroughs** carried by
  007, 008 and 009.
- **It does not resolve register entry 19** — nobody moderates uploaded avatar images. v3.4.0
  escalates it and explicitly declines to close it.
- **It does not take up the nineteen remaining idea-inbox entries** — nine scale-and-cost findings
  and ten gate-honesty and state-machine gaps.

## User Scenarios & Testing *(mandatory)*

The actor in most of these is **the operator**, not the attendee — this is a deployment feature, and
the constitution's sole-actor rule governs the *product*, not who runs it. Where an attendee appears
they are an ordinary attendee with no privileges, exercising the product against the deployed
environment.

### User Story 1 - Close the abuse surface before the door opens (Priority: P1)

Six known findings all become materially worse the moment a publicly reachable URL exists. Today
anyone who signs themselves up and enters a join code — which is printed on badges and slides — can
page the whole attendee directory at a hundred rows a request with nothing counting the requests. An
account created against an address its holder does not control can install a live-resolving profile,
bearing a chosen name and face, permanently into a verified attendee's Network. The throttle that
bounds every other abuse path bounds a sustained rate but not a burst.

**Why this priority**: these land *before* the DNS cutover, not after. Everything else in this
feature makes the product reachable; this is what makes reachable safe. Deploying first and
hardening second would mean a window in which the findings are exploitable and known.

**Independent Test**: fully testable locally against the existing test suite with no environment at
all — every item is a server-side rule with an integration or unit assertion. Delivers value on its
own: the product is safer whether or not it is ever deployed.

**Acceptance Scenarios**:

1. **Given** a signed-in attendee at a conference, **When** they request the directory listing far
   more often than a person browsing would, **Then** the requests are progressively delayed and the
   attempt is recorded, exactly as every other throttled action behaves.
2. **Given** an attendee whose email address has never been verified, **When** they attempt to share
   their card with anybody, **Then** the share is refused, and the refusal does not disclose
   anything about the intended recipient.
3. **Given** many requests to a throttled action arriving at the same instant, **When** each is
   evaluated, **Then** the allowance is not exceeded by the burst — the count each request observes
   reflects the requests already in flight.
4. **Given** somebody signs up using an address they do not own, **When** the owner of that address
   receives the verification mail, **Then** the message tells them what clicking will do and how to
   contest an account they did not create.

---

### User Story 2 - A reachable environment over a trusted certificate (Priority: P1)

The product is provisioned into the named subscription, DNS resolves to it, a publicly trusted
certificate is obtained without anyone touching it, and the environment serves the client with the
API on the same origin.

**Why this priority**: it is the feature's namesake and every remaining story is exercised through
it. It is also where the unrehearsed risk lives — this project has never provisioned a VM, never
issued a certificate, and never had a deploy succeed.

**Independent Test**: open the address in a browser from a machine that has never seen the project
and confirm the product loads over HTTPS with a publicly trusted certificate. Delivers value on its
own — it is the first time the product exists anywhere other than a developer's laptop.

**Acceptance Scenarios**:

1. **Given** the environment configuration names the subscription and the address, **When** the
   provisioning script runs, **Then** every cloud call targets that subscription by identifier and
   the script refuses rather than proceeding if it is not accessible.
2. **Given** a public DNS record resolving to the host, **When** the stack starts, **Then** a
   publicly trusted certificate is obtained without manual intervention and plain HTTP is redirected.
3. **Given** the deployed environment, **When** the client makes an API request, **Then** it is
   same-origin, so the session cookie is sent and its `SameSite` attribute remains a real defence.
4. **Given** the requested machine size is unavailable or restricted in the region, **When**
   provisioning is attempted, **Then** it fails immediately with a message naming the size, the
   region and the remedy — not with a late, generic cloud error.
5. **Given** a deployment whose database is unreachable, **When** the deployment gate is evaluated,
   **Then** it is refused on readiness rather than accepted on liveness.
6. **Given** a change merged to the integration branch, **When** the pipeline runs, **Then** it
   deploys to UAT without anyone running a script by hand.
7. **Given** the automated deployment path, **When** it reaches the host, **Then** it does so
   without widening host access beyond what that access is justified by — and the justification is
   written down.
8. **Given** a deployment that has completed, **When** its logs are read by anyone with access to
   them, **Then** no secret value appears in them.

---

### User Story 3 - An account somebody can actually create and use (Priority: P1)

A person reaches the address, signs themselves up, receives a verification email, verifies, joins the
seeded conference with its code, and is visible to other attendees.

**Why this priority**: without real mail the environment is unusable rather than merely diminished.
Verification gates discoverability, so every UAT attendee would be invisible to every other one, and
password recovery would not exist. It is the difference between a deployed product and a deployed
login page.

**Independent Test**: complete the sign-up journey end to end against the deployed address using a
real mailbox. Delivers value on its own — it is the first proof that the product's account lifecycle
works outside a test double.

**Acceptance Scenarios**:

1. **Given** the mail provider is configured, **When** somebody signs up, **Then** a verification
   message arrives at the address they supplied and the link in it verifies that account.
2. **Given** an attendee who has forgotten their password, **When** they request a reset, **Then**
   the reset message arrives and the link works.
3. **Given** the mail provider is not configured, **When** the same journeys run, **Then** the
   recording sink is used instead — chosen by configuration alone, with no environment branch — so a
   local run exercises the production path.
4. **Given** the mail provider is configured but unreachable, **When** a verification message cannot
   be sent, **Then** the failure is logged and surfaced honestly rather than silently swallowed.

---

### User Story 4 - A backup that outlives its host, and a restore that has been performed (Priority: P1)

Backups are taken on schedule, copied off the host, and local artifacts are pruned only once the
remote copy is confirmed. A restore is then actually carried out and written down.

**Why this priority**: the constitution makes an exercised restore a governance obligation before
production holds real attendee data. Doing it here, against a real cloud disk, discharges it early —
and against a real host rather than the throwaway local container the operations log currently
records. It is P1 rather than P2 because **the off-host half is what makes the drill mean anything**:
a restore proved from artifacts that die with the database proves the wrong thing.

**Independent Test**: destroy the database container on the host, restore it from a copy fetched from
off-host storage, and confirm the seeded conference and its attendees are present. Delivers value on
its own — it converts a documented procedure into a performed one.

**Acceptance Scenarios**:

1. **Given** a completed backup that has passed its verification step, **When** pruning runs,
   **Then** local artifacts are removed only after an off-host copy is confirmed present.
2. **Given** an off-host copy cannot be made, **When** pruning would run, **Then** it does not, and
   the failure is reported rather than absorbed.
3. **Given** a host whose database has been destroyed, **When** the documented restore procedure is
   followed using an off-host artifact, **Then** the product returns to service with its data intact.
4. **Given** the restore has been performed, **When** the operations log is read, **Then** it records
   what was restored, from where, when, and by whom.

---

### User Story 5 - Notifications that deliver from the real environment (Priority: P2)

The signing key pair exists for this environment, is held where every other secret is held, and a
message sent to somebody produces a notification on their device.

**Why this priority**: 007 verified delivery end to end on a desktop, so the capability is proven —
what is unproven is delivery *from a deployed host with a real certificate and a real service worker
scope*. Valuable, but the product is complete without it by the constitution's own rule that a denied
permission yields a complete product.

**Independent Test**: from a second browser profile, send a message to an attendee who has granted
permission, and confirm the notification arrives and opens the conversation. Delivers value on its
own — it is the first delivery through a production-shaped path.

**Acceptance Scenarios**:

1. **Given** a key pair configured for the environment, **When** an attendee grants permission and
   another attendee messages them, **Then** a notification is delivered and activating it opens that
   conversation.
2. **Given** no key pair is configured, **When** the same journey runs, **Then** the recording sink
   is used, the attendee is never asked for permission, and Messages is unaffected.
3. **Given** the public half of the key pair, **When** the client and the server are compared,
   **Then** there is exactly one source for it rather than two values nothing checks agree.

---

### User Story 6 - A report that reaches a person (Priority: P2)

An attendee reports conduct. The block is applied, the report is recorded, and mail carrying
identifiers and a timestamp arrives at the operator address.

**Why this priority**: the reporting dialog tells the attendee a person will read it, and until this
lands that sentence is not true anywhere. It is P2 rather than P1 because the safety behaviour that
protects the reporter — the block — already works and does not depend on this.

**Independent Test**: submit a report against a seeded attendee and confirm the operator mailbox
receives a message. Delivers value on its own.

**Acceptance Scenarios**:

1. **Given** an attendee reports another, **When** the report is submitted, **Then** the block is
   applied, the report is recorded, and mail is dispatched to the operator address.
2. **Given** the operator mail cannot be dispatched, **When** a report is submitted, **Then** the
   block is still applied, the report is still recorded, and the failed dispatch is logged.
3. **Given** any dispatched operator mail, **When** its contents are inspected, **Then** it carries
   identifiers and a timestamp only — never message or question text, and never the reporter's
   stated reason.

---

### User Story 7 - The tooling refuses to be pointed at the wrong database (Priority: P3)

The guard that stops a non-production environment reaching production data is provoked and observed
to fire.

**Why this priority**: the guard already exists and is believed correct. The value here is
converting a belief into an observation, which is cheap and has never been done. Lowest priority
because nothing is blocked on it, but it belongs in this feature rather than 011 — it is the one
moment two real environment configurations exist to compare.

**Independent Test**: point the UAT configuration at production's resolved database host and confirm
every script refuses to run. Delivers value on its own — it is the first evidence the constitution's
"MUST refuse rather than proceed" is met by a mechanism rather than a convention.

**Acceptance Scenarios**:

1. **Given** a UAT configuration whose resolved database host matches production's, **When** any
   deployment script is invoked, **Then** it refuses and names the reason.
2. **Given** the deployed UAT environment, **When** its data is inspected, **Then** it contains only
   seeded content and accounts created against it — no data originating from any other environment.

---

### Edge Cases

- **The DNS record has not propagated when the stack first starts.** Certificate issuance fails.
  This must be an obvious, named failure rather than a silent fall back to plain HTTP.
- **The requested machine size is restricted or retired in the region.** Must fail at preflight with
  the remedy, not at creation with a generic error.
- **The mail provider's sending domain is not yet verified.** Sign-up appears to succeed and no
  message ever arrives — the worst failure shape available, because nothing looks wrong.
- **A verification message is delivered to somebody who did not sign up.** They must be told what
  clicking does and given a way to contest it.
- **The signing key pair is regenerated by accident.** Every existing subscription is silently
  invalidated and no attendee is told. The configuration must make this hard to do unknowingly.
- **The off-host copy target is unreachable at prune time.** Pruning must not proceed.
- **A restore is attempted from an artifact that predates the current schema.** The procedure must
  say what happens when the schema has moved ahead of the application.
- **Somebody signs up on UAT believing it is the real product.** UAT is openly reachable; it must be
  evident which environment a person is looking at.
- **A throttled action is invoked concurrently from many connections.** The allowance must hold
  across the burst.
- **The directory throttle denies a legitimate reader at a busy venue.** A read allowance that can
  deny would harm exactly the journey the product exists for.

## Requirements *(mandatory)*

### Functional Requirements

#### Pre-public hardening — the abuse surface

- **FR-801**: The attendee directory listing MUST be rate-limited per requesting attendee, using the
  project's existing per-action throttle rather than a new mechanism.
- **FR-802**: The directory listing's throttle MUST NOT be able to deny a request. It MAY delay.
  Denial would refuse the product's central journey to a legitimate reader at a busy venue, and the
  harvesting this defends against is bounded by cost rather than prevented outright.
- **FR-803**: A read-frequency bound MUST be applied to **every authenticated read route that a
  client requests repeatedly without a person acting** — which today is the message-thread poll and
  the attendee directory listing, and no others. It MUST be configured so that it may delay but
  never deny. The system MUST NOT leave the frequency of these reads entirely client-controlled and
  unbounded.
- **FR-803a**: The route set named in FR-803 MUST be enumerated in one place, and a later feature
  adding a client-driven poll MUST be required to add its route to that set. An enumeration that a
  new poll can silently sit outside is not a bound.
- **FR-804**: The throttle MUST bound a burst as well as a sustained rate: concurrent requests
  arriving before any of them is recorded MUST NOT collectively exceed the allowance.
- **FR-805**: FR-804's change MUST apply to every throttled action, since the mechanism is shared,
  and MUST NOT alter the observable allowance of any existing action.
- **FR-806**: Sharing a digital business card MUST be refused when the **sharer's** email address is
  not verified. This is a check on the actor at write time.
- **FR-806a**: FR-806 MUST NOT require any backfill, repair or removal of cards already shared. No
  environment has ever been deployed, so no such card exists — and a card is irrevocable by
  requirement, so a rule that removed one would contradict a shipped guarantee. Stated because the
  absence of a backfill step is a deliberate consequence rather than an omission.
- **FR-807**: FR-806 MUST NOT introduce any verification condition into card *resolution*. Reading a
  held card continues to consult neither discoverability nor verification.
- **FR-808**: FR-806's refusal MUST NOT disclose anything about the intended recipient, and MUST be
  indistinguishable from the existing refusals in that path.
- **FR-809**: The verification message MUST tell its recipient that following the link confirms an
  account, and MUST give somebody who did not create that account a stated way to contest it.
- **FR-810**: FR-809 MUST NOT require the message to disclose anything about the account beyond what
  the recipient already knows by receiving the mail — no display name, no other address, no profile
  content.
- **FR-811**: All timestamps used to evaluate a throttle window and to compute a served delay MUST
  originate from a single clock.
- **FR-812**: Every **behavioural** requirement in this section — FR-801 through FR-808, FR-811 —
  MUST be covered by an automated assertion that fails the build if the behaviour regresses. A
  hardening change verified only by inspection is one a later feature can undo silently.
- **FR-812a**: FR-809 and FR-810 govern message **content** rather than behaviour, so their
  assertion is over the message a recipient would receive: that it states what following the link
  does, that it offers a contest path, and that it discloses nothing beyond what FR-810 permits.
  Asserting the copy exists is weaker than asserting behaviour and is stated as such rather than
  dressed up as equivalent.

#### The environment

- **FR-820**: The UAT environment configuration MUST name the Azure subscription
  `d428f98f-a3c4-49c3-ae24-06ec3de08477` and the address `mynet-dev.programasemilla.com`.
- **FR-821**: Every cloud call made by a deployment or provisioning script MUST be pinned to the
  configured subscription **by identifier**, and MUST refuse to proceed when that subscription is not
  accessible. A script MUST NOT inherit whatever subscription happens to be active.
- **FR-822**: Provisioning MUST preflight the requested machine size in the target region and fail
  immediately, naming the size, the region and a remedy, when it is unavailable or restricted.
- **FR-823**: The production environment configuration MUST leave its address blank. `mynetcr.com`
  MUST NOT be committed to it until the domain is registered.
- **FR-824**: The deployed environment MUST serve the built client and the API from **one origin**.
- **FR-825**: The deployed environment MUST obtain and renew a publicly trusted certificate without
  manual intervention, and MUST NOT serve the product over plain HTTP.
- **FR-826**: The database MUST NOT be reachable from outside its own host.
- **FR-827**: A deployment MUST gate on readiness — an endpoint that confirms the database is
  reachable — and MUST NOT gate on liveness alone.
- **FR-828**: Every rendered view of the deployed UAT environment MUST carry an indication that it
  is UAT and not production, conveyed in text rather than by colour or position alone, and available
  to assistive technology. It MUST NOT be interactive, MUST NOT be dismissible, and MUST NOT appear
  in a production build.
- **FR-829**: The UAT environment MUST be openly reachable. No credential, network allowlist or
  other access restriction may be placed in front of it.
- **FR-830**: Provisioning, deployment, and their prerequisites MUST be documented such that an
  operator who did not build the environment can reproduce it from the repository alone.

#### Continuous delivery to UAT

*This group closes a gap the specification's first draft left entirely: it filled the environment
configuration and said nothing about how a change reaches the environment. Standing decision 20 —
"a change reaches UAT on merge to `develop`" — is binding, and an environment deployed by hand
satisfies every other requirement here while leaving that rule unmet.*

- **FR-831**: A change merged to the integration branch MUST deploy to UAT automatically, without an
  operator running a script by hand.
- **FR-832**: Every credential the automated deployment needs MUST be held as a protected secret
  scoped to the UAT environment, and MUST NOT be committed.
- **FR-833**: The automated deployment MUST be able to reach the host **without weakening host
  access to admit an unbounded range of origins.** The provisioning path restricts administrative
  access to the operator's own address, and a hosted build runner does not have a stable one; the
  chosen resolution MUST be recorded with what it costs. **This is a design decision, not a
  configuration step**, and a plan that treats it as one will discover it at cutover.
- **FR-834**: The host's identity for the automated deployment MUST be verified out-of-band before
  first use, rather than accepted on first connection.
- **FR-835**: No secret value may appear in deployment output or logs.
- **FR-836**: The deployment path MUST refuse to proceed, with a message naming what is missing,
  when a required credential or configuration value is absent — rather than failing later at a point
  that names something else.
- **FR-837**: **Every** configuration value and secret the running product requires MUST be
  inventoried, and the inventory MUST state for each one what a blank value costs. This includes the
  values that predate this feature — the database password and name, the two authentication secrets,
  the certificate-registration address, and the sender address — not only the ones this feature
  introduces. *This requirement exists because it has already gone wrong once: register entry 17
  records two authentication secrets that were never set in the workflow at all, and were "invisible
  only because `db-branch` failed first."*
- **FR-838**: A rollback path MUST exist for the deployed environment, MUST state what happens when
  the schema has moved ahead of the application, and MUST be verified against the real host rather
  than asserted in documentation.

#### Transactional mail

- **FR-840**: A real transactional mail adapter MUST be provided behind the existing mail port.
- **FR-841**: The adapter MUST be selected by configuration alone, identically in every environment.
  There MUST NOT be an environment branch: credentials present selects real delivery, credentials
  absent selects the recording sink.
- **FR-842**: The mail vendor's SDK and credentials MUST NOT appear outside the mail module, enforced
  by the same boundary rule that confines the storage and push vendors.
- **FR-843**: The port MUST remain vendor-free: no vendor type may appear in its signature.
- **FR-844**: Account verification mail and password-reset mail MUST be delivered by the adapter.
- **FR-845**: Operator abuse-report mail MUST be delivered by the same adapter.
- **FR-846**: A dispatch failure MUST be logged with enough detail to diagnose it, and MUST NOT be
  silently discarded.
- **FR-847**: A dispatch failure MUST NOT fail the action that triggered it: a report still blocks
  and is still recorded, and an account is still created.
- **FR-848**: Mail content MUST NOT carry personal data beyond what its purpose requires. Operator
  mail carries identifiers and a timestamp only — never message or question text, never the
  reporter's reason.

#### Notification delivery

- **FR-850**: A signing key pair MUST exist for the UAT environment, held as a repository environment
  secret and injected into the host's runtime configuration at deploy time — the same path as every
  other secret.
- **FR-851**: The private half MUST NOT be committed, MUST NOT appear in any file tracked by the
  repository, and MUST NOT be reachable from the client bundle.
- **FR-852**: The key pair MUST NOT be rotated except on compromise, and the operator documentation
  MUST state that rotating it silently stops delivery for every attendee until their browser
  re-registers.
- **FR-853**: The public half MUST have exactly one source of truth. It MUST NOT be configured
  independently for client and server, where the two could disagree with nothing checking.
- **FR-854**: Configuration members that are read by nothing MUST be removed rather than retained.
- **FR-855**: With no key pair configured, the recording sink MUST be used, the attendee MUST NOT be
  asked for permission, and every other capability MUST be unaffected.

#### Reporting

- **FR-860**: Abuse reports MUST be dispatched to `apps@programasemilla.com`.
- **FR-861**: The report path MUST remain unreadable from inside the product: no route, no repository
  method, no screen.
- **FR-862**: Reporting MUST continue to block in the same action.
- **FR-863**: The report-submission action MUST remain throttled.

#### Backups and restore

- **FR-870**: A completed, verified backup MUST be copied to storage outside the host it was taken
  from, before any local pruning.
- **FR-871**: Local pruning MUST be conditional on the off-host copy being confirmed present. A
  failed or unconfirmed copy MUST prevent pruning.
- **FR-872**: A failure to copy off-host MUST be reported rather than absorbed.
- **FR-873**: The off-host copy MUST NOT be readable by anyone who is not already trusted with the
  database, and its credentials MUST be held as a secret on the same terms as every other.
- **FR-874**: A restore MUST be performed on the deployed host, from an off-host artifact, and the
  product MUST return to service with its data intact.
- **FR-875**: The performed restore MUST be recorded in the operations log: what was restored, from
  which artifact, when, and by whom.
- **FR-876**: The restore procedure MUST state what happens when the schema has moved ahead of the
  application, rather than assuming the database can always follow the code backwards.
- **FR-877**: The backup schedule and the written retention period MUST be unchanged by this feature
  except where FR-870 and FR-871 require.

#### Data separation and seed

- **FR-880**: The deployed UAT environment MUST contain seeded conference content and accounts
  created against it, and MUST NOT contain data originating from any other environment.
- **FR-881**: The guard that refuses to run a non-production script against production's resolved
  database host MUST be provoked and observed to refuse, and that observation MUST be recorded.
- **FR-882**: The seeding path MUST retain its existing guard against running against a production
  target.
- **FR-883**: Seeded accounts MUST NOT use credentials that also grant access to anything else, and
  the fact that UAT credentials are committed and world-readable MUST be treated as intended rather
  than incidental.
- **FR-884**: The deployed environment MUST be seeded, so that a conference with a join code, its
  sessions and its meeting slots exist for somebody arriving at the address. Migrating the schema is
  not seeding it, and every acceptance scenario that has a person "join the seeded conference"
  depends on this.
- **FR-885**: Re-seeding the deployed environment MUST be possible without destroying accounts
  created against it, or — if it cannot be — that MUST be stated, so that nobody discovers it by
  losing a reviewer's setup.

#### Absences, asserted rather than assumed

- **FR-890**: This feature MUST add no database migration, no table, and no column.
- **FR-891**: This feature MUST add no product route, screen, destination or Home card. FR-828's
  environment indication is none of those and is the single permitted exception to "adds nothing
  visible" — it carries no data, no interaction and no address, and it MUST NOT grow into any of
  them.
- **FR-892**: This feature MUST NOT introduce a second notification trigger. A received message
  remains the only one.
- **FR-893**: This feature MUST NOT add an administrative interface, a privileged role, or any
  in-product reader of reports.
- **FR-894**: This feature MUST NOT deploy production, and MUST NOT fill any production
  environment value.
- **FR-895**: FR-890 through FR-894 MUST be covered by assertions over the source, following the
  pattern established by 007's and 009's absence guards, including their rule that comments are
  stripped before matching — every one of these phrases also appears in the prose explaining it.

### Key Entities

**None. This feature introduces no entity, and that is a requirement rather than an observation**
(FR-890). The records it touches — attempt counters, subscriptions, reports, stored objects — all
exist and are unchanged in shape.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-801**: A person who has never seen the project can open the UAT address in a browser and load
  the product over a publicly trusted certificate, with no warning and no manual step.
- **SC-802**: A person can complete sign-up, receive the verification message, verify, join the
  seeded conference, and appear to other attendees — in under five minutes, using a real mailbox.
- **SC-803**: A password reset requested at the UAT address results in a working reset link.
- **SC-804**: A message sent to an attendee who has granted permission produces a notification on
  their device, and activating it opens that conversation.
- **SC-805**: A report submitted at the UAT address results in mail at the operator address carrying
  identifiers and a timestamp, and carrying no message text and no stated reason.
- **SC-806**: A backup taken on the deployed host is present in off-host storage, and no local
  artifact is pruned before that copy is confirmed.
- **SC-807**: The database on the deployed host can be destroyed and restored from an off-host
  artifact, returning the product to service with the seeded conference and its attendees intact —
  performed, not documented.
- **SC-808**: Requesting the attendee directory far more often than a person browsing would results
  in progressive delay, and never in a denial.
- **SC-809**: An attendee whose address is unverified cannot share their card, and the refusal
  discloses nothing about the intended recipient.
- **SC-810**: A burst of concurrent requests against a throttled action does not exceed that action's
  allowance.
- **SC-811**: Pointing the UAT configuration at production's resolved database host causes every
  deployment script to refuse, naming the reason.
- **SC-812**: The deployed environment's data contains nothing that did not originate from the seed
  or from accounts created against UAT itself.
- **SC-813**: The full correctness suite passes unchanged, and no existing assertion is weakened,
  disabled or made non-blocking to accommodate any change in this feature.
- **SC-814**: The documented provisioning and deployment procedure names every prerequisite,
  credential and configuration value the environment needs, with no step that exists only in the
  builder's head — verified by walking the written procedure against the built environment and
  finding no undocumented step.
- **SC-815**: No attendee-facing capability behaves differently after this feature than before it,
  except that some requests are delayed, an unverified account cannot share a card, and UAT carries
  an indication that it is not production.
- **SC-816**: A change merged to the integration branch appears at the UAT address without anyone
  running a deployment script by hand.
- **SC-817**: A deployment attempted with a required credential or configuration value missing is
  refused with a message naming that value, rather than failing later with an unrelated error.
- **SC-818**: A person arriving at the UAT address can tell, from what is on screen, that they are
  not looking at production.
- **SC-819**: A deployed release can be rolled back to its predecessor, including a statement of what
  happens to a schema that has already moved ahead — demonstrated on the real host, not documented.

## Feature Declarations *(mandatory — Constitution Principle IX)*

| Obligation | Declaration |
|---|---|
| **Offline behaviour** (Principle VI) | **Unchanged in every respect, and that is a requirement rather than an omission.** This feature adds no repository, no cached surface and no client data path, so there is nothing to classify. The existing rules stand exactly as their features declared them: Agenda and the conference programme cached with a 24-hour lifetime and a retrieval stamp; Discover, Messages, cards and Q&A uncached, each for a reason recorded at its own composition root; every write refused offline rather than queued. **Register entry 22 — a cached conference outliving a withdrawn registration — is explicitly not addressed here** and is 011's. The one thing this feature *could* have changed and must not: FR-803's read bound MUST NOT alter what any repository caches or when it revokes. |
| **Desktop layout** (Principle IV) | **One layout change, and it is the only one: FR-828's environment indication, present on every rendered view.** Stated as a change rather than waved through — the specification's first draft called this "no layout change", which was wrong: an element on every view is exactly what a layout declaration is for. The rail, contextual top bar and multi-column workspace are otherwise untouched, and FR-891 makes adding any product surface a violation. The indication MUST NOT displace or overlay a control, and MUST NOT occupy a position a product surface needs. Space is least contended here, so desktop is the width where this is cheapest. |
| **Tablet layout** (Principle IV) | Same single change at the reduced rail, with the same constraints. The two-column card arrangement and stacked detail are unchanged. |
| **Mobile layout** (Principle IV) | Same single change, and **this is the width where it is most likely to cost something**: compact header, bottom navigation and a single column leave the least vertical space, and the first viewport is where Principle III puts a success criterion. The indication MUST NOT push a primary action below the fold, MUST NOT introduce horizontal scrolling, and MUST NOT reduce any touch target. Whether that is achievable without adjusting the header is Open Question 5. |
| **Empty / loading / failure states** (Principle IV) | **No new surface crosses the network, so no new state is introduced.** Three existing states change meaning rather than appearance, and each must stay honest: a **throttled directory request** presents as the existing loading state and then results, delayed — never as an error, because FR-802 forbids denial; a **throttled poll** (FR-803) likewise delays and never fails, so a thread with a slowed poll looks like a thread, not a broken one; and a **card share refused for want of verification** (FR-806) uses the existing refusal presentation, which FR-808 requires to be indistinguishable from its neighbours. Mail dispatch has no attendee-facing state at all — FR-847 makes a failure invisible to the attendee by design and FR-846 makes it visible in the log. FR-828's indication has no loading or failure state: it is static, or it is absent from that build. |
| **Accessibility** (Principle IV) | **No modal, no new interactive control, and no change to any existing one.** FR-828's indication MUST convey its meaning in text rather than by colour or position alone, MUST be available to assistive technology, and MUST NOT be focusable or dismissible — it is not interactive, and a focus stop added to every view would be a real cost paid on every keyboard journey in the product. Everything else — accessible labels, visible focus, keyboard operability, Escape dismissal on every existing modal — is unchanged and MUST remain so; the correctness suite's accessibility gate is what asserts it (SC-813). |
| **Validation checklist discharged** (Principle VII) | **Discharges the production-build item, against a real host rather than a local build.** Contributes evidence toward, without discharging, desktop and mobile rendering — the environment now exists for a person to look at. **Deliberately leaves to 011**: the whole-product checklist sweep, the accessibility sweep across five destinations, the three-width core-journey test, the physical iPhone test, PWA caching at real data volumes, brand assets, and the performance pass. **This feature is not the validation pass**, and its review MUST NOT treat those as gaps — see "Departure from the delivery roadmap". |
| **Identity scoping & server-side authorization** (Principle VIII) | **No new read or write of attendee data, so no new scoping rule.** Every existing rule is unchanged and MUST remain enforced: the branded event scope demanded by every per-event query, participation for conversations, held-card for cards, and the three route audits that fail a build when a route slips the guard. **Two changes touch authorization and both tighten it**: FR-806 adds a server-side condition on the card-sharing actor, checked server-side regardless of what the interface offered; and FR-801/FR-803 add server-enforced rate limits keyed on the requesting identity. **FR-807 is the sharp edge** — the new condition governs the *actor at write time* and MUST NOT migrate into card resolution, where the three deliberate absences (no discoverability, no verification, no registration join) are the feature and not an oversight. |
| **Deletion & export coverage** (Principle VIII) | **No new attendee-data record, so no new coverage obligation** — FR-890 makes adding one a violation, and the two coverage tests that fail a *future* feature's build for an uncovered table or column are what enforce it. Existing coverage is unchanged: cascades from `attendees`, the declared retention rules for records no cascade can reach, and the export's per-column derivation from the schema. **Two records this feature makes more numerous are already covered and stay so**: throttle attempt rows, which are deliberately not deleted with an account and expire on the existing two-hour sweep whose interval MUST NOT be lengthened; and push subscriptions, which hold credentials rather than content and MUST NOT enter the export. **Backups are a new copy of attendee data in a new place** — FR-873 puts the off-host copy under the same access terms as the database, and UAT holds seeded data only (FR-880), so this feature never places real attendee data off-host. |
| **Event scoping** (Constraints — data scoping) | **Not applicable, because no table is added** (FR-890). The hybrid rule — conference content per-event, relationships cross-event — is untouched, and no existing table's rule changes. Stated rather than omitted because the constitution requires every new table to declare its rule and neither is a default; there is no new table to declare one for. |
| **Register position** (Governance) | **Blocked by no open register entry.** Entries **14, 18, 20 and 21 were resolved by constitution v3.4.0, ratified 2026-08-10**, which is what licenses this feature's first line — the same precondition v3.2.0 set for 008 and v3.3.0 for 009. Entry **11** gained the subscription it never named. **This feature resolves no further entry and raises none.** It **implements** the binding text v3.4.0 added: the addresses, the subscription pinning, the separate-registrable-domain rule, the UAT access rule, the off-host backup requirement, the key-custody and rotation rules, and the operator address. **Entry 19 (avatar moderation) is escalated by v3.4.0 and explicitly not resolved here** — an openly reachable environment with public sign-up makes it a present fact, and this spec MUST NOT be read as closing it. **Entries 2, 4 and 22 block 011, not this feature.** Entries 12, 15 and 16 remain open and block nothing. |
| **Reserved migration number** (Branching — parallel work) | **None — no schema change** (FR-890). The roadmap reserves no number for 010, and this feature claims none. Migrations remain at `0008`. Anyone who nonetheless finds themselves regenerating the Drizzle snapshot must move `apps/api/migrations/meta/README.md` aside first and must not "correct" the journal's deliberate `0003`/`0004` ordering — but doing so at all would be a violation of FR-890. |

## Assumptions

Reasonable defaults chosen where the brainstorm and the amendment did not specify. Each is a
decision a reviewer may overturn; none is silent.

- **The mail region is the provider's US infrastructure**, not its EU region. The product's
  provisional production name and its audience are Costa Rican, the hosts are in `centralus`, and
  routing mail through Europe would add latency and a data-transit story for no benefit. Standing
  decision 12 built retention, deletion and export to the strict standard precisely so that settling
  jurisdiction is not a precondition, so this choice does not foreclose anything.
- **The machine size moves to the current-generation burstable equivalent** rather than staying on
  the size the environment file names today. The sibling project sharing this subscription and region
  moved deliberately, on the ground that the older series is under capacity-growth restrictions and
  retires in 2028, and a green-field provision being refused is a real failure mode. The older size
  was checked during brainstorming and is *not* restricted for this subscription today, so this is
  chosen for longevity rather than necessity — and FR-822's preflight is what makes either choice
  fail early rather than late.
- **FR-803's read bound is added rather than its absence recorded.** Both were legitimate; what was
  not legitimate was leaving it undecided a third time. It is configured so it may delay but never
  deny, which makes it safe to apply broadly.
- **The off-host backup target is storage in the same subscription, in a separate resource group and
  a separate host.** "Off-host" is the requirement; a second cloud or a second vendor would be a
  larger decision than this feature is entitled to take, and the failure this defends against — the
  host or its disk being lost — is met by any target that is not that disk.
- **UAT's seeded credentials are committed and world-readable**, as they are today, and this is
  intended. The repository is public, UAT holds no real attendee data, and a credential that grants
  access to nothing else is not a secret. FR-883 makes that explicit so it is never quietly reused.
- **The operator address is a real monitored mailbox**, not a black hole. The product's dialog says a
  person will read it, and constitution v3.4.0 records that naming an address does not discharge
  that obligation.
- **A single UAT environment is provisioned; no second non-production environment is created.**
- **Attendees on UAT are the team and invited reviewers.** The environment is openly reachable
  because restricting it would break the validation 011 needs, not because it is being advertised.
  The address is not published anywhere.

## Open Questions

None of these blocks this specification, its plan, or its implementation. Each is recorded so it is
not resolved silently.

1. **How the automated deployment reaches the host, given that provisioning locks administrative
   access to one operator's address and a hosted build runner has no stable one** (FR-833). Four
   shapes, none free: a self-hosted runner on a known address (an extra machine to maintain and
   patch); widening the access rule (the thing FR-833 exists to constrain); refreshing an allowlist
   per run from the runner's current address (a race, and a window); or a control-plane transport
   that avoids administrative access altogether (the least-trodden path, and the one that leaves the
   access rule untouched). **This is the sharpest open question in the feature** — it is the only
   one where the obvious answer is the one that quietly weakens a guarantee. Resolve at planning
   with the cost recorded, as FR-833 requires.
2. **What happens to UAT accounts and their content over time.** UAT is permanent and openly
   reachable, so it accumulates real people's sign-ups indefinitely with no retention rule of its
   own — the product's per-attendee retention rules cover records, not environments. A periodic
   reset is the obvious answer and would invalidate anything a reviewer had set up. Not urgent;
   worth deciding before the environment is a year old.
3. **Whether register entry 12 — authentication ownership — should be closed by observation.**
   Authentication is self-implemented and has shipped since 004. The entry asks whether that is
   settled or an unratified default, and this feature deploys it. Blocks nothing.
4. **Whether FR-803's two routes should share one allowance or hold separate ones.** The bound now
   names exactly two routes and requires the set to be enumerated (FR-803a), so the scope question
   is settled; what is not is whether a reader with a thread open should have their directory
   browsing slowed by the poll's own traffic. Separate allowances are more precise and are two
   things to maintain. Blocks nothing — either satisfies FR-803.
5. **What FR-828's indication costs at the smallest supported width.** It appears on every view, and
   mobile is where vertical space is scarcest and where a persistent element is most likely to push
   a primary action below the fold. The declaration rows bind it not to do so; whether that is
   achievable without a layout change, or whether it needs one, is a planning question.
