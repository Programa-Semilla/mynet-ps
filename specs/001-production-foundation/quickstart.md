# Quickstart & Validation Guide

**Feature**: 001-production-foundation | **Constitution**: v2.0.0

How to run MyNet locally and prove the foundation slice actually works. Every scenario below maps to a
success criterion in [spec.md](./spec.md); the commands are the evidence, not the claim.

> **Constitution Principle VII**: completion is claimed from pipeline output, never from inspection.
> Passing everything here locally is necessary and not sufficient — the pipeline is the gate.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Node LTS + pnpm | Versions pinned in `package.json`; pnpm is the only supported package manager (D2) |
| A PostgreSQL database | A personal Neon branch, or local PostgreSQL. **Never** an environment holding real attendee data (FR-007) |
| `.env` from `.env.example` | Database URL, session signing secret, hashing pepper. Never committed (FR-041) |

Activate the repository guardrails once per clone — they block direct commits to `main` and `develop`:

```bash
git config core.hooksPath .githooks
```

---

## Setup

```bash
pnpm install                 # workspace install; lockfile is committed (FR-002)
cp .env.example .env         # then fill in your own values
pnpm db:migrate              # apply committed migrations in order (FR-037)
pnpm db:seed                 # two attendees, different event registrations
```

**`pnpm db:seed` creates two attendees deliberately.** One attendee cannot demonstrate isolation, and
isolation is the point of this slice — see Scenario 2 and FR-069.

> **Never run `drizzle-kit push`**, in any environment including your own machine. It changes a
> database without producing a reviewable migration, which the constitution prohibits. If it appears
> in a `package.json` script, that is a defect.

## Run

```bash
pnpm dev          # API and client together
pnpm dev:api      # API alone
pnpm dev:web      # client alone
```

## Verify everything

```bash
pnpm verify       # everything CI runs, in the same order
```

Individually:

```bash
pnpm typecheck        # FR-001
pnpm lint             # FR-004, and the no-colour-literals rule (SC-009)
pnpm test:unit        # FR-005 unit
pnpm test:component   # FR-005 component
pnpm test:integration # FR-005 integration — needs a real database
pnpm test:e2e         # FR-068 — Playwright, includes accessibility
pnpm contract:check   # FR-044b — regenerate and diff the committed contract
pnpm build            # production build + asset budget (FR-072)
```

---

## Validation scenarios

### Scenario 1 — Sign in and see your own workspace *(SC-001, US1)*

1. Open the app signed out. Try a destination address directly.
2. **Expect**: asked to sign in; no attendee data shown (FR-025).
3. Sign in as the first seeded attendee.
4. **Expect**: your display name and *your* registered events (FR-032, FR-040).
5. Close the browser entirely, reopen, return to the app.
6. **Expect**: still signed in (FR-028).
7. Sign out.
8. **Expect**: returned to sign-in; previously reachable data no longer returned (FR-027).

### Scenario 2 — One attendee cannot see another's data *(SC-001, SC-002, FR-069)*

**The most important scenario in this slice.** Principle VIII exists because this failure is not
recoverable by a later patch.

1. Sign in as the first seeded attendee; note the events shown.
2. Sign out. Sign in as the second; note their events differ.
3. While signed in as the second, call `GET /events` directly with a request altered to reference the
   first attendee.
4. **Expect**: the alteration has no effect — the endpoint takes no attendee identifier, so the
   response is still the second attendee's events (FR-035, FR-036).
5. Present a tampered or fabricated session cookie.
6. **Expect**: refused, with no disclosure of whether any referenced record exists (FR-026, FR-036).

### Scenario 3 — Navigate on every device *(SC-004, SC-006, SC-007, US2)*

1. Signed in, load at **320px**, **768px**, and **1280px**.
2. **Expect**: bottom navigation, reduced rail, and persistent rail respectively (FR-016–FR-018,
   boundaries per D16).
3. At each width, check no horizontal scrolling is needed anywhere (FR-020).
4. Navigate all five destinations using only `Tab`, `Enter`, and `Space`.
5. **Expect**: a clearly visible focus indicator at **every** stop (FR-021). One missing indicator is
   a defect, not a rough edge.
6. Open each destination address directly in a new tab.
7. **Expect**: correct destination active, navigation marked current, no flash through Home (FR-014).
8. Navigate several destinations, then use Back and Forward.
9. **Expect**: address and displayed destination stay consistent at every step (SC-007).
10. Open a nonsense address.
11. **Expect**: a not-found view inside the shell with a route back to Home — never a blank page
    (FR-015).

### Scenario 4 — Accessibility *(SC-005)*

```bash
pnpm test:e2e
```

**Expect**: zero critical or serious axe violations across all five destinations at all three widths.
Also verify by hand, since automation cannot judge these: request reduced motion and confirm
non-essential animation stops; zoom text to 200% and confirm reflow without loss of content (FR-024).

### Scenario 5 — Install and behave honestly offline *(SC-012, SC-013, US4)*

1. Build and serve the production bundle; install to a home screen.
2. **Expect**: installs under the name **MyNet** with placeholder icons that are *visibly*
   provisional (FR-048, FR-050).
3. Disable the network. Launch from the home screen.
4. **Expect**: the shell renders — not a browser error page (FR-051) — with an explicit offline state
   naming what is unavailable (FR-052).
5. Attempt a server-dependent action.
6. **Expect**: refused with a clear explanation. **Not** queued silently, **not** shown as succeeded
   (FR-053).
7. Restore the network.
8. **Expect**: state updates without a manual reload (FR-054).
9. Sign out, then inspect cached storage.
10. **Expect**: no attendee data from that session remains (FR-056). API responses are never precached
    (D14), so there should be nothing to find.

### Scenario 6 — Session expiry *(FR-028a–c)*

Fourteen days of idling is impractical to test by hand. Shorten the idle window in local configuration
and:

1. Sign in, then leave the app idle past the window.
2. Act.
3. **Expect**: refused, returned to sign-in with an **inactivity** explanation distinguishable from a
   failed sign-in (FR-028c), and no partial write.
4. Sign in again and use the app steadily past the original window.
5. **Expect**: still signed in — expiry slides on use (FR-028a).

### Scenario 7 — Sign-in throttling *(SC-003a, FR-031a–d)*

1. Attempt sign-in repeatedly with a wrong credential for a seeded attendee.
2. **Expect**: escalating delay after a few failures (FR-031a).
3. Keep going well past the threshold.
4. **Expect**: the account is **never** permanently locked — it must stay reachable with the correct
   credential (FR-031b). A lock here is a defect: email is the identifier, so a lock would let anyone
   deny an attendee access.
5. Compare refusals for a real identifier versus a nonexistent one.
6. **Expect**: indistinguishable (FR-030, FR-031d).
7. Inspect `sign_in_attempts`.
8. **Expect**: no credential material, and no readable email address (FR-031c, FR-042).

### Scenario 8 — The pipeline actually catches things *(SC-010, US3)*

Prove the gates work by breaking them on purpose, one per throwaway branch:

| Break | Expect |
|---|---|
| Introduce a type error | `typecheck` fails, naming the code |
| Add a hardcoded hex colour in a component | `lint` fails (SC-009) |
| Break an assertion | the relevant test fails, naming it |
| Change a response shape without regenerating | `contract:check` fails (FR-044b) |
| Write a migration that cannot apply cleanly | migration verification fails **before** any real-data environment (FR-038) |
| Remove an accessible label | the accessibility check fails (SC-005) |
| Import a large dependency into the shell | the asset budget fails (FR-072) |

**A gate that does not fail when you break it is not a gate.** Confirm each, then discard the branches.

### Scenario 9 — Clean-clone reproducibility *(SC-014)*

On a fresh clone, in a fresh directory, follow **Setup** exactly as written.

**Expect**: install, migrate, seed, run, and `pnpm verify` all succeed with no undocumented step and
no access to real attendee data. If you needed a step that is not written down, the omission is the
defect — fix the documentation, not just your machine.

---

## What this slice does *not* validate

Stated plainly so a green run is not mistaken for a finished product.

- No destination content: no conference sessions, attendee cards, message threads, or appointments.
- No search, filters, notes, Q&A, card sharing, or meeting scheduling.
- No self-service sign-up, password reset, or account recovery — accounts are provisioned
  administratively, an **interim** assumption pending spec Open Question 1.
- No real brand mark; icons are placeholders.
- Of Principle VII's product checklist, this slice discharges only: production build, desktop and
  mobile rendering, navigation between destinations, keyboard focus visibility, and accessible labels.
