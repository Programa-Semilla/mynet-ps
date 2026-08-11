# Phase 0 Research: UAT Deployment and Pre-Public Hardening

**Feature**: 010 | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

Nine questions. Two of them change the shape of the work and are marked **load-bearing**; the rest
choose between options that all satisfy the requirement.

---

## R1 — How the automated deployment reaches the host *(load-bearing; spec Open Question 1, FR-833)*

**The problem, precisely.** `deploy/vm/provision-vm.sh` locks the port-22 NSG rule to the
provisioning operator's own public address, discovered at provision time. `deploy.sh` reaches the
VM over SSH and rsyncs a client bundle built on the runner. GitHub-hosted runners have dynamic
egress from a large published range. These three facts are mutually incompatible, and the
`deploy-uat` job's own comment says so — it lists the SSH key, the known-hosts value and the NSG
admission as prerequisites nobody has met.

**Decision: just-in-time NSG admission.** The deploy job discovers its own egress address, adds a
port-22 rule scoped to that single address for the duration of the run, and removes it in a
teardown step that runs on every exit path including cancellation. The service principal needs
network-write permission on that one NSG and nothing else.

**Rationale.** It is the smallest change to a deploy path that already works, it keeps the
"administrative access is one address at a time" property the provisioning script established, and
the mechanism already exists — the job would be editing a rule the provisioning script creates
rather than inventing an access model. The exposure is one address for the length of a deploy.

**Two things this decision must carry, or it is worse than the alternatives:**

1. **Teardown must be unconditional.** A cancelled job that leaves its rule behind converts a
   just-in-time allowlist into a permanent one, silently. The existing job already knows this shape
   — it sets `cancel-in-progress: false` precisely because a cancelled deploy leaves a maintenance
   flag on the VM that nothing else removes.
2. **A stale rule must be detectable.** Teardown that runs is not the same as teardown that
   worked. The job should assert at start that no rule from a previous run survives, and fail
   loudly if one does.

**Alternatives considered.**

- **Self-hosted runner on a known address** — removes the problem entirely, and adds a machine to
  maintain and patch. Putting it *on the UAT VM* was rejected outright: a two-vCPU box already
  sharing a database with a client build is the wrong place for a build agent.
- **Widen the rule to GitHub's published Actions ranges** — this is the option FR-833 exists to
  forbid. It is thousands of addresses belonging to anyone who can run a workflow.
- **Control-plane transport with no SSH at all** — run the deploy script on the VM through the
  Azure agent, with the built bundle fetched from the storage account R4 introduces. **This is the
  strongest option on security grounds and is genuinely tempting**, because it deletes port-22
  administrative access from the deploy path rather than time-boxing it, and it reuses storage the
  feature is adding anyway. It is not chosen because it rewrites `deploy.sh`'s transport in the same
  change that first proves the deploy works at all, and a rewrite whose failure mode is "the deploy
  does not work and we cannot tell which half is wrong" is the wrong risk to take on a first
  deployment. **Recorded as the intended successor**, and R4's storage account is deliberately
  provisioned in a way that does not preclude it.

---

## R2 — `SinkMailService` throws under production, so UAT cannot boot without real mail *(load-bearing)*

**Not a decision — a discovered constraint that sequences the work.**

`deploy/vm/docker-compose.yml:93` sets `NODE_ENV: production`. `SinkMailService`'s constructor
throws when the config reports production, deliberately and with a good argument: it holds
verification and reset links in memory and writes them to the log, and a reset link *is* the
account. `plugins/ports.ts:61` constructs it whenever no mail adapter is supplied.

**Therefore the deployed API cannot start until a real mail adapter exists.** The first deploy of
the current code would fail at boot with the sink's own error message.

**Consequences for the plan:**

- The Mailgun adapter is **not** a later story that improves a working environment. It is a
  prerequisite of the environment starting at all, and must land before the first deploy attempt.
- This inverts the naive ordering, in which one deploys an empty product and then adds mail.
- It also makes the failure *good*: the product refuses to run in a state where it would silently
  leak credentials, which is exactly what the sink's throw was written for. Nothing here should be
  softened to make the first deploy easier.

**Note a real discrepancy to reconcile**: `deploy/vm/.env.example` documents `MAIL_SMTP_URL`, and
the `mail` block in `apps/api/src/config.ts` reads only `MAIL_FROM` and `MAIL_OPERATOR_ADDRESS`.
The example file promises a knob the code does not read. R3 resolves which one is right.

---

## R3 — Mailgun transport: SMTP or HTTP API

**Decision: SMTP**, through a single connection URL, using a general-purpose SMTP client.

**Rationale.**

- `.env.example` already documents `MAIL_SMTP_URL` as the shape, so this closes R2's discrepancy by
  implementing the documented knob rather than replacing it.
- **It produces no vendor SDK at all.** FR-842 asks that the vendor be confined to the mail module;
  SMTP satisfies that more strongly than confinement would — there is no Mailgun package, no
  Mailgun type, and swapping providers is a change of URL. For a project whose defining deployment
  decision was to own its own infrastructure rather than adopt a vendor, this is the consistent
  choice.
- It keeps `MailService`'s two-methods-and-a-report shape untouched. The adapter renders bodies; the
  port keeps refusing to carry a generic `send`.

**Cost, accepted:** no delivery webhooks, no bounce or complaint callbacks, no per-message
analytics. None of these is required by any requirement, and a bounce path would need a route to
receive it — a route this feature is forbidden to add (FR-891).

**Alternative considered.** Mailgun's HTTP API gives structured errors and delivery events, at the
price of a vendor dependency in the tree and a second thing to mock in tests. Rejected on the
consistency argument above; revisit only if a bounce path is ever required.

---

## R4 — Off-host backup target

**Decision: an Azure Storage account in its own resource group, same subscription, same region**,
with a private container per environment. `backup.sh` uploads after its existing verification step
and before pruning; pruning is skipped unless the upload is confirmed.

**Rationale.** "Off-host" is the whole requirement — the failure being defended against is the loss
of the VM or its disk, and any target that is not that disk meets it. A separate resource group
means the blast radius of deleting the environment's group does not include its backups. Same
subscription keeps it inside the one credential and the one bill this project has decided to have.

**Two properties worth buying while it is cheap**: soft-delete on the container, so a faulty prune
cannot destroy history; and write-only credentials for the backup job, so a compromised VM can add
backups but not read or delete them.

**Alternative considered.** A second cloud or an off-cloud target would survive a subscription-level
failure. Rejected as larger than this feature: standing decision 17 asks for backups that survive
the event they exist for, not for multi-cloud durability, and adding a second vendor would
contradict D12's whole reasoning.

---

## R5 — Making the throttle bound a burst (FR-804, FR-805)

**The problem.** The current order is count → sleep → record. Concurrent requests all read the same
pre-burst count and all pass. It bounds a sustained rate, not a burst.

**Decision: record the attempt row *before* evaluating, and settle its outcome afterwards.**
`countFailures` counts non-successes among the rows it reads, so a row inserted up-front with
`succeeded = false` is counted immediately by every request behind it. An action whose outcome is
success then updates its own row, which restores the streak-reset semantics for the sequential case.

**Why this shape rather than the two obvious ones.**

- It is **one change for every action**, which is what FR-805 asks for. Actions like
  `question_vote` already record unconditionally through `recordRequest`, and for those this is
  purely a reordering. Outcome-dependent actions — `sign_in`, `sign_up`, `reset_submit` — gain an
  update, and their observable allowance is unchanged because a success still ends the streak.
- It keeps the counter in the database, which the module's own header insists on: an in-process
  counter is wrong the moment there is more than one instance.

**Alternatives considered.**

- **Fold count and record into one statement** (insert returning a windowed count). Strictly the
  most correct and the most invasive: it rewrites the query that four features' behaviour rests on,
  in a shared file, in the same change that first deploys the product. Recorded as the better
  end-state.
- **An advisory lock per key.** Correct, and it serialises a hot path on a two-vCPU box. Rejected on
  cost.

**Risk to carry into implementation.** This touches the mechanism every throttled action shares.
The existing per-action threshold table is read directly by a unit guard, and the integration suite
covers the sign-in streak semantics — those tests are the safety net, and **not one of them may be
adjusted to make the change pass** (SC-813). A test that needs changing is evidence the allowance
changed, which FR-805 forbids.

---

## R6 — The UAT indication (FR-828)

**Decision: a build-time flag, rendered as a static text element inside the existing application
shell** — not a new band above it, and not a runtime check of the hostname.

**Rationale.**

- **Build-time is what makes "MUST NOT appear in a production build" structural** rather than
  conditional. A runtime hostname check ships the element to production and relies on a comparison;
  a build-time flag means the production bundle does not contain it.
- **Inside the shell, not above it**, because mobile is where vertical space is scarce and
  Principle III puts a success criterion on the first viewport. A full-width band costs every
  screen; a marker within the existing header costs none.
- Text rather than colour alone, not focusable, not dismissible — a focus stop added to every view
  is a cost paid on every keyboard journey in the product, for something that is not interactive.

**Open sub-question for implementation, not for the plan**: whether the marker sits in the compact
mobile header without displacing anything. If it cannot, the honest outcome is a small header
adjustment declared as such, not a marker that pushes a primary action below the fold.

---

## R7 — Which routes take the read bound (FR-803, FR-803a)

**Decision: two actions, `directory_read` and `thread_read`, both configured to delay and never
deny**, with the route set enumerated in one place beside the existing threshold table.

**Rationale.** The threshold table is already the single enumeration of throttled behaviour and is
already read directly by a unit guard, so adding the read actions there gets FR-803a's "a later poll
cannot silently sit outside it" for free — the guard that fails a build when the table and the
routes disagree is the mechanism.

**Why never deny.** Both are reads on the product's central journeys. A denial refuses the directory
to somebody standing in a venue trying to find a person, or freezes a conversation mid-exchange. The
harvesting these bound is made expensive rather than impossible, which is the same trade
`reset_request` already makes and for the same reason: an identifier-keyed denial only ever harms
the victim.

**Alternative considered.** One shared read allowance across both. Rejected: a reader with a thread
open would have their directory browsing slowed by their own poll, which is a surprising coupling
between two unrelated surfaces.

---

## R8 — Machine size

**Decision: `Standard_B2als_v2`**, with the preflight FR-822 requires.

**Rationale.** `Standard_B2s` was checked during brainstorming and returns `restrictions: []` for
this subscription in `centralus` today, so this is chosen for longevity rather than necessity: the
B-series v1–v4 are under capacity-growth restrictions and retire in 2028, and the sibling project
sharing this subscription and region already moved for that reason and carries the preflight that
turns a late `SkuNotAvailable` into an early error naming the fix.

**Cost to check at implementation**: the v2 size has 4 GB where the older one has 4 GB — equivalent
— but the sibling project's comment warns 4 GB is tight for *its* stack, which runs a database
server and a headless browser. This stack is lighter: a Node API, PostgreSQL, and a reverse proxy
serving static files. Adequate, and worth watching rather than assuming.

---

## R9 — Seeding the deployed environment (FR-884, FR-885)

**Decision: seed once as an explicit provisioning step, and state plainly that re-seeding destroys
accounts.**

**Rationale.** FR-885 offers two outcomes — re-seeding without destroying accounts, or saying it
cannot be done. It cannot: the seed clears whole domains, including attendees, and 008 records that
it deliberately clears the entire Network domain rather than only what it seeded, because a
surviving card refuses `DELETE FROM events` and breaks the re-seed with an error naming neither
table. Making re-seed additive would be a redesign of the seed with no requirement asking for it.

**So the honest arrangement** is: seeding is a provisioning step rather than part of every deploy;
`deploy.sh --migrate` continues to migrate and not seed; and the runbook says in as many words that
re-seeding UAT destroys every account created against it, including a reviewer's. That sentence is
the deliverable, because the failure it prevents is somebody losing a reviewer's setup an hour
before a review.

**Related, and already correct**: the seed's production guard keys on the resolved target rather
than on `NODE_ENV`, which is stronger than the idea-inbox entry that raised it proposed. It needs no
change; it needs exercising (FR-881).
