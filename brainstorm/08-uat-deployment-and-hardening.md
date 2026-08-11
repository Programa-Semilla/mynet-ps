# Brainstorm: UAT Deployment and Pre-Public Hardening

**Date:** 2026-08-10
**Status:** active
**Phase:** 010 — rescoped from the roadmap's "Launch Readiness", which becomes 011

## Problem Framing

The delivery roadmap is complete. Features 001–009 are shipped and squash-merged to `develop`, every
destination `requirements.md` names answers its question, and what the roadmap left was **010 —
Launch Readiness**: the full validation checklist, an accessibility sweep across five destinations,
a core-journey end-to-end test at three widths, PWA caching against real data volumes, a physical
iPhone test, confirmation that non-production points at no production data, and a performance pass.

Nothing has ever been deployed. That is not a gap in the code — `deploy/vm/` is complete, and has
been since 006 — but **two owner decisions gated the first deploy**: no domain was registered, so
Caddy could not obtain a certificate, and no Azure subscription was named, so there was no host.
The `deploy-uat` and `deploy-prod` jobs print what they are blocked on and exit 0 rather than
failing every merge.

**Both of those decisions were taken in this session**, along with three more that had been open
since 004 and 007. That changes what 010 can be.

It also collided with a second thing. The **idea inbox holds 34 entries** accumulated from every
deep review since 001, and the roadmap explicitly warns that 010 must not become the place they all
land: *"So that 010 does not become a dumping ground, each phase spec states…"*. Reading the inbox
against the shipped code found that **seven of the 34 are already closed** by work that never named
them, and that the remaining 27 fall into three groups with very different urgency. Only one group
gets worse the moment a public URL exists.

Finally, the owner's own steer pulled against the roadmap: **UAT only, and make it work like a
charm.** A deployment that works is a different deliverable from a validation pass over the whole
product, and pretending they are one phase would produce a phase that finishes neither.

## Approaches Considered

### A: Split — 010 is UAT deployment and hardening, 011 is validation and production *(chosen)*

- **Pros:** Each phase has a finish line it can actually reach. 010 is entirely unblocked — every
  decision it needs was taken today. 011 depends on register entries 2 (brand mark) and 4 (client
  validation of desktop and tablet), neither of which is decidable now and both of which need
  people outside this repository; splitting means those two do not hold a working UAT hostage.
  The roadmap is a plan rather than governance and permits revision, provided the spec says so.
- **Cons:** Adds a phase the roadmap does not have, so the numbering diverges from a document that
  has matched delivery since 002. Two PRs where one was planned.

### B: One phase, deploy-first

Harden, provision UAT, then run the entire validation sweep **against the deployed environment**
rather than locally.

- **Pros:** By far the strongest evidence. Every gate this product has passed so far ran locally,
  and this project's own history says that is not enough — the scheduling dialog rendered in the
  top-left corner after passing 135 e2e tests, five review agents and CodeRabbit, and the Proxy
  private-field defect was invisible to unit, component and integration alike. Real TLS, real push
  through a real push service, real Mailgun delivery, and real latency on two shared vCPUs are all
  things no local run produces. **The physical iPhone test is impossible without it** — iOS will
  not install a PWA from `localhost`.
- **Cons:** One very large phase that still ends up blocked on brand assets and the client review,
  which is precisely the problem A exists to avoid. The evidence argument survives into 011 anyway:
  011 will validate against the UAT that 010 built, so nothing is lost by splitting.

### C: One phase, validate-then-deploy

Run the sweep locally, fix what it finds, deploy UAT last as the proof.

- **Pros:** Nothing reaches a public URL until it has been validated. The conventional order.
- **Cons:** The iPhone test, PWA installation and the client layout review all **require** a URL, so
  they queue up behind the deployment with no slack. And it puts the riskiest, most-blocked, least
  rehearsed work last — provisioning, DNS, certificate issuance, a mail vendor and a restore drill,
  none of which this project has ever done. Leaving that to the end is the classic mistake, and the
  one the split most directly avoids.

## Decision

**Split.** Phase **010 becomes "UAT Deployment and Pre-Public Hardening"** and the roadmap's
validation pass becomes **011 — Launch Readiness and Production**. 010 adds **no schema**.

010's finish line is a sentence that can be checked: **`https://mynet-dev.programasemilla.com`
serves the product over a valid certificate, a person can sign up, receive a verification email,
join the seeded conference, and receive a push notification — and a backup taken from that host has
been restored to prove it can be.**

## Owner decisions taken in this session

These close or narrow five open register entries and are the reason 010 is buildable. Each needs
ratifying in a constitution amendment before 010's first line of code, the same way v3.2.0 gated
008 and v3.3.0 gated 009.

1. **The UAT domain is `mynet-dev.programasemilla.com`.** A subdomain of a domain already under the
   owner's control, so the A record and Mailgun's DNS verification can both happen today.
2. **The production domain is `mynetcr.com`, provisionally.** Not registered, not final. It is
   documented rather than committed to `prod.env`, so nothing depends on a name that may change.
   **This is a free win worth recording**: `programasemilla.com` and `mynetcr.com` are separate
   registrable domains, so a UAT session cookie is *structurally incapable* of reaching production.
   That is the strongest available form of the isolation FR-067 demands, and it arrived by accident
   of the naming rather than by design.
3. **The Azure subscription is `d428f98f-a3c4-49c3-ae24-06ec3de08477` (LinaSys-DevEnv)**, `centralus`,
   for both environments. The same subscription the `bds-ps` project uses. *Closes register entry 11's
   remainder in practice — the entry itself was resolved in v3.0.0, but no subscription was named.*
4. **The transactional email provider is Mailgun.** *Resolves register entry 18.* Its sender
   verification is DNS records on `programasemilla.com`, which is the same DNS session as the A
   record. Consider the EU region deliberately: decision 12 built retention, deletion and export to
   the strict standard specifically so that settling jurisdiction would not be a precondition, and
   choosing a region is the cheapest moment to keep that true.
5. **VAPID key custody: one pair per environment, generated once, held as a GitHub Actions
   environment secret and injected into the VM's `.env` by `deploy.sh`.** *Resolves the custody half
   of register entry 20.* This is identical to how `AUTH_PASSWORD_PEPPER` and every other secret is
   already handled — no new mechanism, no new resource. **Rotation only on compromise**, because
   rotating silently stops delivery for every attendee until their browser re-registers, and nothing
   in the product tells them to.
6. **Abuse reports are dispatched to `apps@programasemilla.com`.** *Resolves register entry 21.*
   The reporting dialog tells the attendee a person will read it; this is the address that makes
   that sentence true, and the obligation to actually read it travels with the decision.
7. **UAT is openly reachable, carrying seeded data only.** *Resolves register entry 14.* Public
   sign-up stays open. FR-067 is satisfied by the data, not by the access control: no real attendee
   data ever reaches UAT. Chosen over basic auth and an IP allowlist because both would break the
   two things 011 depends on — handing the client a link for the entry-4 layout review, and
   installing the PWA on a physical iPhone over cellular.
8. **010's finish line is UAT.** Production is 011's.

## Key Requirements

### Pre-public hardening — the six security and abuse entries

These land **before** the DNS cutover, because each of them gets worse the moment a URL is public.

1. **The directory listing has no rate limit.** Fifteen throttled actions exist and none of them is
   the directory. Anyone who self-signs-up and enters a world-readable join code can harvest a whole
   conference — names, employers, roles, headlines, interests and faces — in ten cheap keyset-paged
   requests. FR-404 concedes the listing to a human browsing; it does not concede it to a machine.
2. **Reads are unthrottled entirely.** The throttle is wired to write routes only. 007's spec left
   "what the poll costs on a phone at a venue" open and answered only the client half. Either add a
   `read`-class action configured `mayDeny: false`, or **record explicitly that read frequency is
   deliberately unbounded** so the next feature inherits it as a choice rather than an oversight.
3. **The throttle's read-then-write is not atomic.** It reads the counter, sleeps, then records — so
   a burst of concurrent requests all observe the same pre-burst count and all pass. It bounds a
   sustained rate, not a burst. Pre-existing since 001 and shared by every throttled route; it
   matters most for `question_ask`, which publishes free text to a whole conference.
4. **An unverified account can share a card.** `shareCard` requires the *recipient* to be
   discoverable and verified but places no verification requirement on the **sharer**, whose profile
   the row makes permanently and irrevocably readable. The project invariant says any profile that
   can be read already carries a verified address; card resolution deliberately omits the
   verification condition (FR-613) on the strength of that invariant, and nothing establishes it.
   The fix is a check on the **actor at write time**, which does not touch FR-612/FR-613's read-time
   rules.
5. **Verification proves reachability, not ownership.** Sign up with an address you do not own, have
   the victim click the link, and the *attacker's* account is verified — while FR-303's deliberate
   disclosure has already told the victim the address is taken. The mitigation is copy the product
   does not have: `MailService` takes only `to` and `link`, so nothing in the message can warn a
   recipient that clicking confirms an account they did not create, and there is no path to contest
   an address.
6. **Throttle clock provenance.** Attempt rows are stamped by the database's `now()` while the
   window and the served delay are computed from the API process's clock. Not a bug with NTP-synced
   hosts, but the delay calculation rests on two timestamps being comparable and nothing establishes
   that. Stamp from one clock, or move the computation into SQL.

### The two entries pulled in because 010 touches their files

Both come from a group deferred to 011. Leaving them would mean editing the exact file the finding
names and walking past it.

7. **Backups share a failure domain with the database.** `deploy/vm/backup.sh` has no off-host copy —
   every artifact sits on the same VM and the same disk as the database it protects, so the most
   likely event a daily backup exists for destroys all of them together. This is load-bearing for
   010 specifically: **the restore drill would otherwise validate a false sense of safety**, proving
   restore works from artifacts that die with the thing they protect. An off-host copy after the
   verification gate and before pruning, with local pruning conditional on a confirmed remote copy.
8. **VAPID configuration is duplicated.** Two of the four server-side `push` config members exist
   only to police each other; `PUSH_VAPID_SUBJECT` is read by nothing, and the API's
   `PUSH_VAPID_PUBLIC_KEY` is a second copy of a value the client reads from its own `VITE_`
   variable. The entry says to settle it *when the real adapter lands* — which is now. Two sources
   for one key is the drift this codebase refuses everywhere else.

### Deployment

9. **Fill `deploy/vm/envs/uat.env`**: `SUBSCRIPTION` and `APP_DOMAIN`, both currently blank by
   design, with the comment blocks explaining why updated rather than deleted.
10. **Settle the VM size.** `uat.env:20` says `Standard_B2s`. The `bds-ps` project — same
    subscription, same region — deliberately moved off the B-series v1–v4 because they are under
    Azure capacity-growth restrictions since 2026-07-31 and retire 2028-07-31, and it uses
    `Standard_B2als_v2`. **Checked during this session: `Standard_B2s` returns `restrictions: []` in
    `centralus` for this subscription today**, so it is not blocked — but a green-field provision
    being refused is a real failure mode, and `bds-ps/deploy/vm/provision-vm.sh` already carries the
    preflight that catches it. Decide deliberately rather than inheriting the default.
11. **A record** for `mynet-dev.programasemilla.com` to the VM's static public IP, before any deploy
    script runs — Caddy's certificate issuance is what fails otherwise, and FR-479 makes that the
    intended failure rather than silently serving plain HTTP.
12. **A Mailgun adapter behind `MailService`.** `apps/api/src/mail/` today holds the port, a
    `SinkMailService`, and nothing else. **This is not optional for UAT**: verification gates
    discoverability, so without real mail every UAT attendee is invisible to every other one and the
    product cannot be exercised at all. The shape is already proven — 007 built exactly this for
    `PushService` (a vendor-free port, a sink adapter, a real adapter, and **selection by
    configuration in every environment identically** so a local run exercises the production path).
    Follow it, including the lint boundary that confines the vendor SDK to `apps/api/src/mail/`.
13. **VAPID pair generated, stored as an environment secret, injected by `deploy.sh`**, and the
    client's public key served or configured from one source rather than two (see 8).
14. **`apps@programasemilla.com` wired** as the report destination, and the skipped-dispatch logging
    path exercised to confirm it is no longer skipping.
15. **Seed UAT**, and confirm the FR-485 guard — `_common.sh` refusing to run for `uat` when the
    resolved database host matches production's — actually fires when provoked. A guard nobody has
    seen fail is a guard nobody has tested.
16. **Backup and an exercised restore on the real host.** Standing decision 17 makes this a
    governance obligation *before production holds real attendee data*. Doing it at UAT discharges it
    early and against a real Azure disk rather than the throwaway local container
    `deploy/vm/OPERATIONS-LOG.md` records.
17. **Smoke the whole journey against the deployed URL**: sign up → verification mail → join by code
    → Home → save a session → discover an attendee → share a card → message → push notification
    arrives → activating it opens the conversation.

## What 010 explicitly does NOT do

Named so that 011 does not have to rediscover them, and so 010's review does not treat their absence
as an oversight.

- The `requirements.md` whole-product validation checklist.
- The accessibility sweep across five destinations.
- The desktop and tablet layout review, and the core-journey end-to-end test at three widths.
- The physical iPhone test.
- PWA caching validated against real data volumes.
- The performance pass.
- **Register entry 22** — a cached conference outliving a withdrawn registration by up to 24 hours.
- The three outstanding by-hand `quickstart.md` walkthroughs (007's T148, 008's T148, 009's T097).
- **Production.** No `prod.env` values are filled, and `mynetcr.com` is not registered.
- The **19 remaining inbox entries** — nine scale-and-cost, ten gate-honesty and state-machine gaps.

## Open Questions

- **Nobody moderates uploaded avatar images (register entry 19), and decision 7 makes it live.** UAT
  is openly reachable with public self sign-up and image upload, in a product with no administrative
  actor by construction. The owner declined to decide it in this session. **A precedent now exists
  that did not before**: #06 resolved the same shape for messages by routing reports to an *operator*
  mailbox out of band — and as of decision 6 that mailbox has an address. Whether avatars follow the
  same route is 011's or the owner's, not 010's. The interim position is that the URL is not
  published anywhere and UAT carries no real attendee data.
- **Whether Mailgun's EU region is chosen**, and what that implies for where verification links and
  report mail are processed.
- **Whether `mynetcr.com` is committed to `prod.env` as a placeholder or left blank.** Blank is what
  made the current gating honest; a placeholder that does not resolve fails at certificate issuance,
  which is the same honest failure one step later.
- **Whether the read-path throttle is added or its absence is recorded** (requirement 2). Both are
  legitimate; what is not legitimate is leaving it undecided a third time.
- **Register entries 2 and 4 — brand mark and client validation of desktop and tablet — remain open
  and now block 011 rather than 010.** Entry 4 becomes *cheaper* the moment UAT exists, because the
  client can review the real thing at their own screen width instead of a description.
- **Register entries 15 and 16 — server-side branch protection unconfigured, and the repository
  public — were not taken up.** Both were in the group the owner deferred. 15 is a configuration
  task, free on public repositories, and is now the only thing preventing a direct push to `develop`
  being purely client-side.

## Findings recorded during this session

Not decisions — things discovered while reading, which the spec phase should not have to rediscover.

- **Seven inbox entries are already closed** by work that never named them, and should be retired
  rather than specified: `session-topology-and-csrf` (v3.0.0's one origin), `security-response-headers`
  (`apps/api/src/plugins/security-headers.ts` plus the Caddyfile carry CSP, HSTS, nosniff and
  Referrer-Policy), `production-deployment-path` (`deploy/vm/`), `readiness-versus-liveness`
  (`/ready` at `apps/api/src/routes/health.ts:61`), `seed-production-guard`
  (`apps/api/src/db/seed/index.ts:114` — and it keys on the *target* rather than `NODE_ENV`, which is
  stronger than the entry proposed), and both `platform-registry-*` entries (006 removed the casts;
  `repository-casts.test.ts` holds the line).
- **`CLAUDE.md`'s "known unclaimed defects" is partly stale.** It says neither token table has an
  index on `attendee_id`; `apps/api/src/db/schema/identity-tokens.ts:105` creates one. The migration
  `0003` `lock_timeout` half appears to stand.
- **`bds-ps` is a usable reference for this deployment**, not merely a sibling project: same
  subscription, same region, same Caddy-plus-compose-on-one-VM shape, and its `provision-vm.sh`
  already carries the SKU preflight that turns a cryptic late `SkuNotAvailable` into an early error
  naming the fix.

## Register impact

**Resolved by the decisions above**, pending an amendment that cites them: **14** (UAT access
control), **18** (transactional email provider), **20** (VAPID key custody — the custody half; the
"push provider" half was already found not to exist, and the entry's wording should be corrected in
the same amendment), **21** (the operator address). Entry **11** is already resolved but gains the
named subscription it lacked.

**Unchanged and still open:** 1, 2, 3, 4, 12, 15, 16, 19, 22.

**Note on 19:** decision 7 does not resolve it but does make it live, which is a change in urgency
rather than in status and is recorded here so the amendment does not read as having closed it.
