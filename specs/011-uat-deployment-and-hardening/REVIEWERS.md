# Review Guide: UAT Deployment and Pre-Public Hardening

**Generated**: 2026-08-10 | **Spec**: [spec.md](spec.md)

## Why This Change

**MyNet has never been deployed anywhere.** Every feature from 001 to 009 is shipped and merged, the
delivery roadmap is complete, and the product runs only on developers' laptops. That was never a gap
in the code — `deploy/vm/` has been complete since 006 — but two owner decisions gated the first
deploy: no domain was registered, so the proxy could not obtain a certificate, and no cloud
subscription was named, so there was no host. Both were taken and ratified in constitution **v3.4.0**.

At the same time, six known abuse findings have been accumulating in the idea inbox, and every one
of them gets materially worse the moment a public URL exists. Today anyone who signs themselves up
and enters a join code — printed on badges and shown on slides — can page an entire conference
directory at a hundred rows a request with nothing counting the requests.

## What Changes

Six abuse paths close, then the first deployed environment appears at
`mynet-dev.programasemilla.com`: automatic TLS, real transactional mail, push signing keys,
continuous delivery on merge to `develop`, backups that survive the loss of the host, a restore
actually performed, and a seeded conference somebody can join.

**No schema, no migration, and nothing an attendee can see** — except two refusals (some requests
are now delayed; an unverified account can no longer share its card) and a UAT-only marker that by
requirement never appears in a production build. **No breaking change.** Success criterion SC-815
makes "nothing attendee-facing behaves differently" a thing the feature must prove, which is the
opposite shape from every other feature's criteria and is the point.

## How It Works

**Hardening** is server-side and lands before the DNS cutover. The shared throttle changes from
count → sleep → record to **record → evaluate → settle outcome**, so concurrent requests see each
other and a burst is bounded rather than only a sustained rate. Two read actions join the existing
threshold table with a **five-second ceiling rather than the six-minute one** — a long delay on a
read is a freeze, not a slowdown — and both may delay but never deny. Card sharing gains a
verification check **on the actor at write time**, deliberately not on resolution.

**Mail** is an SMTP adapter behind the existing `MailService` port, chosen so that no vendor package
enters the dependency tree at all and swapping providers is a change of URL. The port keeps its
shape: two account methods and an operator report, no generic `send`.

**Deployment** is one VM running the existing Compose stack, with an Azure Storage container in a
separate resource group as the off-host backup target, holding write-only credentials so a
compromised host can add backups but not read or destroy them.

**Continuous delivery** adds a just-in-time firewall rule scoped to the build runner's single
egress address, torn down on every exit path, with a start-of-run assertion that no rule from a
previous run survived.

## When It Applies

**Applies when**:

- Any authenticated attendee requests the directory listing or polls a message thread — both now
  carry a delay-only bound.
- An attendee attempts to share their digital business card — now refused if their own address is
  unverified.
- Anyone visits the UAT environment — the marker is present, and public sign-up is open.
- A change merges to `develop` — it now deploys.

**Does not apply when**:

- **Production.** No production value is filled and no production resource is created. The marker is
  absent from a production build by construction, not by a runtime check.
- **Card resolution.** The new verification condition governs sharing only. Resolution deliberately
  consults neither discoverability nor verification, and that must not change.
- **Any other notification trigger.** A received message remains the only one.

## Key Decisions

1. **The roadmap's 010 was split into 010 and 011.** Its two halves have different blockers: the
   deployment half is fully unblocked by v3.4.0, while the validation pass depends on register
   entries 2 (brand mark) and 4 (client layout review), neither decidable by anyone in this
   repository. Keeping them together would have held a working UAT hostage to a brand mark.
   *Alternative rejected*: one large phase, which stays blocked regardless.

2. **Mail must land before the first deploy.** `SinkMailService` throws under production — it holds
   reset links, and a reset link *is* the account — and the compose file sets `NODE_ENV: production`.
   So the API cannot boot without a real adapter. This inverts the obvious ordering. *Nothing here
   should be softened to make the first deploy easier*: the throw is doing exactly its job.

3. **SMTP rather than the provider's HTTP API.** Leaves no vendor package in the tree, so the
   confinement rule is satisfied structurally rather than by a lint boundary, and it implements the
   `MAIL_SMTP_URL` knob `.env.example` already documented but the code never read. *Cost accepted*:
   no delivery webhooks or bounce callbacks — and a bounce path would need a route this feature is
   forbidden to add.

4. **Just-in-time firewall admission for the deploy job.** Provisioning locks administrative access
   to one operator's address; hosted runners have no stable one. *Alternatives rejected*: widening
   to the runner provider's published ranges (thousands of addresses belonging to anyone who can run
   a workflow — the thing FR-833 exists to forbid), and a self-hosted runner (a machine to maintain;
   putting it on the two-vCPU box that also runs the database was rejected outright). *The stronger
   option is recorded rather than taken*: a control-plane transport with no SSH at all would delete
   the exposure instead of time-boxing it, and the storage account is provisioned so as not to
   preclude it.

5. **Read bounds may delay but never deny.** A denial refuses the directory to somebody standing in
   a venue trying to find a person, or freezes a conversation mid-exchange. Same trade
   `reset_request` already makes.

6. **Re-seeding UAT destroys every account created against it, and the runbook says so.** The seed
   clears whole domains and 008 records why it must. *Alternative rejected*: making the seed
   additive — a redesign with no requirement asking for it. The warning sentence is the deliverable.

## Areas Needing Attention

Ranked by where a reviewer's disagreement would be most valuable.

1. **The throttle rework touches a mechanism four features rely on.** Record-before-evaluate changes
   the shared path used by fifteen actions. The existing tests are the net, and **a test that needs
   adjusting is the finding, not an obstacle** — SC-813 forbids weakening any of them, and FR-805
   forbids altering any existing allowance. Read T012 specifically: it is a regression test asserting
   `report_submit` still denies, because that is the newest guard and the only action whose requests
   leave the product.

2. **The just-in-time firewall rule is the highest-risk thing here.** A leaked rule is permanent
   public SSH exposure that nothing else reports. Teardown running is not the same as teardown
   working — the start-of-run stale-rule assertion is the part that matters, and it is worth checking
   that it actually fails the job rather than warning.

3. **The threshold numbers are judgement, not derivation.** 120/1 200 for the directory and
   1 500/6 000 for the thread poll, with a five-second ceiling. The thread figure must exceed
   ~1 200 requests/hour or the three-second poll delays every legitimate attendee. If you think
   these are wrong, they are cheap to change and expensive to discover wrong in a venue.

4. **The by-hand first deploy precedes automating it** (Phase 5 before Phase 11), deliberately, so
   that when automation fails there is a known-good path to compare against. Reasonable people
   automate first. This is the ordering decision most worth overruling if you disagree.

5. **The UAT marker is the only visible addition in a feature that claims to add nothing visible.**
   It appears on every view, which *is* a layout change — the spec's first draft claimed it was not,
   and three declaration rows were corrected. Mobile is where it may not be free.

6. **The operator is the protagonist of six of seven user stories.** Every prior feature's stories
   are an attendee's. The constitution's sole-actor rule governs the product rather than who runs
   it, but the divergence is real and deliberate.

## Open Questions

Five, none blocking. Full text in [spec.md](spec.md).

1. **How the automated deployment reaches the host.** Decided as just-in-time admission (R1), but
   the alternatives are live and the obvious one quietly weakens a guarantee.
2. **What the UAT marker costs at the smallest supported width.**
3. **Whether register entry 12 (authentication ownership) should be closed by observation** — it is
   self-implemented and has shipped since 004.
4. **Whether the two read bounds should share one allowance.**
5. **What happens to UAT accounts over time.** The environment is permanent and openly reachable, so
   it accumulates sign-ups with no retention rule of its own.

**Explicitly not closed by this feature**: register entry 19 — nobody moderates uploaded avatar
images. v3.4.0 made it more urgent (an openly reachable environment with public sign-up and image
upload) and deliberately declined to resolve it. This feature must not be read as having closed it.

## Review Checklist

- [ ] Key decisions are justified
- [ ] Breaking changes are documented with migration guidance — **none claimed; verify SC-815**
- [ ] Scope matches the stated boundaries
- [ ] Success criteria are achievable
- [ ] No unstated assumptions
- [ ] **No migration was generated** — FR-890; the coverage tests failing is the signal
- [ ] **No existing test was weakened, disabled or made non-blocking** — SC-813
- [ ] **The `MailService` port emerged unchanged** — no generic `send` was added
- [ ] **The firewall teardown has a stale-rule assertion**, not only a teardown step
- [ ] **Card resolution still consults neither discoverability nor verification** — FR-807
- [ ] **No production value was filled and no production resource created** — FR-894

---

<!-- Code phase sections are appended below this line by the phase-manager command -->
