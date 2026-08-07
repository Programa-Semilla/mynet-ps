# Quickstart: Validating Agenda and Saved Sessions

**Feature**: 005 | Run these to prove the feature works end to end.

Design detail is in [data-model.md](./data-model.md) and
[contracts/agenda-api.md](./contracts/agenda-api.md); this is the run-and-check guide.

---

## Prerequisites

```bash
git config core.hooksPath .githooks     # once per clone — not committable
pnpm install
cp .env.example .env                    # fill DATABASE_URL
pnpm db:migrate                         # applies 0004
pnpm db:seed                            # local/preview only, never real data
```

Seeded sign-ins are in `apps/api/src/db/seed/attendees.ts`. **Both begin with an empty agenda** —
no saved sessions and no notes are seeded, because seeding attendee-authored content would fabricate
personal data. So the first thing you see is the empty state, which is deliberate.

---

## The gates, locally

```bash
pnpm verify:clean          # the pipeline's gates against a clean database
```

Individually:

```bash
pnpm typecheck
pnpm lint
pnpm test:unit             # includes the repaired route audit — see below
pnpm test:component
pnpm test:integration      # isolation against real seeded rows
pnpm contract:check        # openapi.json matches the routes
pnpm test:e2e
pnpm test:a11y
```

**The route audit must pass before anything else is believed.** It is FR-230's enforcement, and it
was failing in CI before this feature (`Missing required environment variable DATABASE_URL`).
Research D7 gives the `unit` project a dummy URL because the audit walks the route table and never
connects. Confirm it actually runs:

```bash
pnpm vitest run --project unit apps/api/tests/unit/event-scope-audit.test.ts
```

A pass here means every route this feature added declares its conference and demands validated
scope. **A skip is not a pass** — under constitution v2.2.0 a check that did not run has not passed.

---

## Scenario 1 — Build an agenda (US1)

1. Sign in, land on Home.
2. Go to **Agenda**. The full programme renders, grouped by venue-local day, filter on **All**.
3. Save two sessions using the control on their rows.
4. Switch the filter to **Saved** → exactly those two, same chronological grouping.
5. Sign out, sign in **in a different browser**, return to Agenda → still saved.

**Also check**: switch conference and back. Each conference shows its own saved set (FR-185).

**Empty state**: before saving anything, the Saved filter shows an invitation to explore with a way
back to All — not a blank list, not a spinner (FR-195).

---

## Scenario 2 — The detail panel (US2)

1. Open a session from the programme. **The address changes** to `/agenda/<sessionId>`.
2. Overview and Speaker info render. A session with no speakers says so, in wording distinct from a
   failure (FR-201).
3. Press **Escape** → panel closes, address returns to `/agenda`, and **focus lands back on the
   control that opened it** (FR-202).
4. Reopen, then press the browser **Back** button → the panel closes rather than leaving Agenda.
5. **Cold load**: paste `/agenda/<sessionId>` into a fresh tab → the panel opens with the programme
   behind it (FR-203).
6. Keyboard-only: Tab through the open panel → focus never escapes it.

**Cross-conference refusal** (FR-204): take a session id from conference A, switch to conference B,
and load that address. You are told it is not available to you, in wording that does not reveal
whether it exists.

---

## Scenario 3 — Notes (US3)

1. Open any session — **saved or not**; noting and saving are independent (FR-207).
2. Type. Stop. Status goes *Saving…* → *Saved*.
3. Reload → the note is there.
4. Clear the text entirely, stop → the note is removed; reopening shows an empty note (FR-212).
5. Approach 10,000 characters → you are told before you hit it, not by a rejected write (FR-213).

**The status must never say Saved before the server confirms.** Throttle the network to a slow
profile and watch: *Saving…* should persist for the whole round trip. If *Saved* appears
immediately, the implementation went optimistic and has incurred a decision the constitution
requires be recorded separately (research D5).

---

## Scenario 4 — Offline (US4)

1. Load Agenda while connected.
2. Go offline (DevTools → Network → Offline).
3. Reload → the programme, saved set and notes are readable, each carrying **when it was retrieved**
   (FR-216).
4. Try to save a session → refused with an explanation. State does not change. **Nothing is
   queued** (FR-217).
5. Type a note → status says not saved *because there is no connection*, distinct from a server
   fault, and the text stays on screen (FR-218).
6. Go back online, retry → succeeds without a reload.

**Never-read conference** (FR-219): offline, switch to a conference you have not opened before → you
are told a connection is needed and nothing is cached. Not an empty programme.

**Cache lifetime** (FR-221): entries older than 24 hours are treated as absent. Offline this is the
*only* thing that revokes access after a registration is withdrawn, so it is worth confirming rather
than assuming.

---

## Scenario 5 — Isolation (US5)

Covered by `apps/api/tests/integration/agenda.test.ts`, which exercises the server directly rather
than through the client.

```bash
pnpm test:integration
```

It must prove, against real seeded rows:

- Attendee B cannot read or modify attendee A's saved sessions or notes, by any request.
- An attendee registered only for conference A is refused for conference B, with no disclosure.
- A 403 and a 404 are indistinguishable in what they reveal.
- Deleting an attendee removes their saves and notes (the `ON DELETE CASCADE`).

**Client-side filtering proves nothing here.** If any of these passes only because the UI hides
something, it fails Principle VIII.

---

## Scenario 6 — Home composition (US6)

1. Save a session occurring later today. Load Home → this feature's card names it.
2. Save nothing → the card shows its own empty state.
3. Nothing left today → the card says so, rather than showing tomorrow's session as if it were
   today's (FR-225).
4. **Force this card to fail** → every other card still renders and Home is never blank (SC-212).

**Then read the diff**: the only change to `home/registry.ts` is one appended line, and no other
feature's card file is touched (SC-208, FR-226). This is checkable by inspection and should be
checked, because it is the property standing decision 9 exists to protect.

---

## Responsive and accessibility

At 320px, tablet, and desktop:

- No horizontal scrolling of Agenda, the filter, or the panel (SC-211).
- Save controls meet touch-target sizing without crowding the row's time, title and track.
- The panel is a full-width overlay at mobile.
- Every control has an accessible label that reflects its state, and a visible focus ring.

```bash
pnpm test:a11y
```

---

## Known state at time of writing

**CI cannot fully verify this feature yet.** Constitution register entry 17: `NEON_API_KEY` is
unset, so `db-branch` fails and `migrations`, `test-integration`, `test-e2e`, `test-accessibility`
and `deploy-api` all skip. Scenarios 4, 5 and the accessibility sweep are therefore **local-only**
until that secret is set.

Under Principle VII as amended in v2.2.0, merging 005 in that state requires the fault fixed or a
recorded waiver. Scenario 5 is the one that matters most: it is the personal-data guarantee, and it
is in the layer that is currently skipped.
