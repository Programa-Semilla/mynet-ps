# Quickstart: Validating 010 — UAT Deployment and Pre-Public Hardening

**Feature**: 010 | **Date**: 2026-08-10

Nine scenarios. **Scenarios 1–3 run locally and gate the deploy**; 4–9 run against the deployed
environment and cannot be run before it exists.

A note this project has earned the right to make: 007, 008 and 009 each shipped with their
walkthrough outstanding, and the first defect a person found by looking — a dialog rendering in the
top-left corner — had passed 135 end-to-end tests, five review agents and an automated reviewer.
**Scenarios 4–9 here cannot be discharged by any test suite**, because there is no way to assert
against an environment that does not exist yet.

---

## Prerequisites

```bash
pnpm install
pnpm start          # local stack, for scenarios 1-3
```

For scenarios 4–9: `az` authenticated against subscription
`d428f98f-a3c4-49c3-ae24-06ec3de08477`, a mailbox you can read, and two browser profiles.

---

## Scenario 1 — The abuse surface is closed *(local, gates the deploy)*

**Covers**: US1, FR-801–FR-812a, SC-808, SC-809, SC-810

1. Sign in and request the attendee directory repeatedly, far faster than a person browsing.
   → Requests are **progressively delayed**. **They are never refused** — a denial here would
   refuse the product's central journey to somebody standing in a venue.
2. Open a conversation and leave it polling; request the directory at the same time.
   → Both are bounded, and slowing one does not slow the other (R7's separate allowances).
3. Create an account, **do not verify it**, join a conference, and try to share your card.
   → Refused. The refusal says nothing about the recipient — compare it against sharing with a
   nonexistent attendee; they must be indistinguishable.
4. Fire a burst of concurrent requests at one throttled action.
   → The allowance is **not exceeded by the burst**. This is the one that fails before the fix.
5. Read the verification mail in the development sink's log.
   → It says what following the link does, and offers a way to contest an account you did not
   create. It does **not** disclose a display name or any other address.

```bash
pnpm test            # every gate must pass, unchanged
```

**No existing assertion may be adjusted to make this pass** (SC-813). A test needing a change is
evidence the allowance moved, which FR-805 forbids — that is a finding, not an obstacle.

---

## Scenario 2 — Mail is real, and the sink refuses production *(local, gates the deploy)*

**Covers**: US3, FR-840–FR-848

1. With no SMTP URL configured, start the stack in development.
   → The sink records. A warning names register entry 18. Nothing is sent.
2. Configure the SMTP URL and repeat.
   → Mail is **sent**. Same code path, no environment branch — selection is by configuration alone.
3. Set `NODE_ENV=production` with no SMTP URL and start the API.
   → **It refuses to boot**, with the sink's own error about holding reset links.

Step 3 is not a bug to work around. It is why mail must land before the first deploy (R2), and
softening it would trade a credential-leak guard for a slightly easier first deployment.

---

## Scenario 3 — Configuration fails at the point that names it *(local, gates the deploy)*

**Covers**: FR-836, FR-837, SC-817

For each required value in [`contracts/configuration.md`](./contracts/configuration.md), blank it
and attempt a deploy.

→ Refused, with a message **naming that value**. Not a failure three steps later naming something
else. This is the scenario register entry 17 exists to prevent repeating: two auth secrets were once
never set at all and were invisible because an unrelated step failed first.

---

## Scenario 4 — The environment is reachable over a trusted certificate

**Covers**: US2, FR-820–FR-830, SC-801

1. Confirm DNS resolves `mynet-dev.programasemilla.com` to the static IP **before deploying**.
2. Provision, then deploy by hand.
3. Open the address on a machine that has never seen this project, ideally on a phone on cellular.
   → Loads over HTTPS. No warning, no manual step. Plain HTTP redirects.
4. Confirm in the browser's network panel that API requests are **same-origin**.
5. Stop the database container and re-run the readiness check.
   → Refused on readiness. `/health` alone would have passed, which is why it is not the gate.
6. **Look at the layouts.** Desktop, tablet and mobile. This is not in scope for 011's requirements
   — it is 011's — but you are here, in a browser, in front of the real thing. The dialog in the
   top-left corner was found exactly like this.

---

## Scenario 5 — Somebody can create an account and use it

**Covers**: US3, SC-802, SC-803

1. Sign up at the address with a real mailbox. → Verification mail **arrives**.
2. Follow the link. → Verified.
3. Join the seeded conference with its code. → Home shows the conference.
4. From a second profile, confirm the first attendee is **visible in Discover** (this is what
   verification gates, and what the sink adapter would have silently prevented).
5. Request a password reset. → Mail arrives, the link works.

Under five minutes end to end (SC-802). If mail is slow, that is the finding.

---

## Scenario 6 — The environment says it is not production

**Covers**: FR-828, SC-818

1. Load the address. → It is evident, in text, that this is UAT.
2. Check at mobile width. → It has **not** pushed a primary action below the fold, and has not
   introduced horizontal scrolling.
3. Tab through the page. → The marker is **not** a focus stop.
4. Inspect a production build. → The marker is **absent from the bundle**, not merely hidden.

---

## Scenario 7 — Notifications and reports leave the box

**Covers**: US5, US6, SC-804, SC-805

1. Grant notification permission. From a second profile, send a message.
   → A notification arrives. Activating it opens **that** conversation.
2. Report an attendee. → The block applies, the report is recorded, and mail arrives at
   `apps@programasemilla.com`.
3. Read that mail. → Identifiers and a timestamp. **No message text, no stated reason.**
4. Break the SMTP URL and report again. → The block still applies, the report is still recorded,
   the failed dispatch is **logged**.

---

## Scenario 8 — A backup that outlives its host, and a restore that has been done

**Covers**: US4, FR-870–FR-877, SC-806, SC-807, SC-819

1. Run a backup. → An artifact appears in the off-host container.
2. Make the off-host target unreachable and run again.
   → **Pruning does not proceed.** The failure is reported, not absorbed.
3. **Destroy the database container on the host.**
4. Restore from an artifact fetched from off-host storage.
   → The product returns to service. The seeded conference and its attendees are intact.
5. Record it in `deploy/vm/OPERATIONS-LOG.md`: what, from where, when, by whom.
6. Roll back a deployed release to its predecessor, and confirm the procedure states what happens
   when the schema has moved ahead of the application.

Step 3 is the point. A restore that has not been performed is a hope, and one performed from
artifacts that share a disk with their source proves the wrong thing.

---

## Scenario 9 — Delivery is automatic, and the door closes behind it

**Covers**: US2, US7, FR-831–FR-838, FR-880–FR-885, SC-811, SC-812, SC-816

1. Merge a trivial change to `develop`. → It appears at the UAT address with **nobody running a
   script**.
2. While the deploy runs, inspect the NSG. → One rule, one address.
3. After it finishes, inspect again. → **The rule is gone.**
4. Cancel a deploy mid-run, then start another.
   → The second **fails loudly** on the stale rule rather than proceeding. This is the check that
   matters; teardown that runs is not teardown that worked.
5. Point `uat.env`'s database host at production's value and run any script.
   → **Refused**, naming the reason. Record it — FR-881 asks for the observation, not the belief.
6. Inspect UAT's data. → Seeded content and accounts created against UAT. Nothing else.
7. Read the runbook's re-seed warning. → It says plainly that re-seeding **destroys every account
   created against UAT**, including a reviewer's (R9).

---

## What this walkthrough deliberately does not cover

011's, all of it: the whole-product validation checklist, the accessibility sweep across five
destinations, the three-width core-journey test, the physical iPhone test, PWA caching at real data
volumes, and the performance pass. Also the three outstanding walkthroughs 007, 008 and 009 carry —
**this scenario list does not replace them.**
