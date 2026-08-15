# Quickstart & Validation: Event Context, Session Catalog & Home Composition

**Feature**: 002-event-context-and-catalog | **Constitution**: v2.1.0

Runnable scenarios that prove the feature works end to end. Each names the requirements it exercises,
so a reviewer can check coverage rather than take it on trust.

---

## Setup

```bash
git config core.hooksPath .githooks     # once per clone — the only thing blocking a push to develop
pnpm install
pnpm db:migrate                          # applies 0001 and 0002
pnpm db:seed                             # per-domain seed modules (research D10, D12)
pnpm dev                                 # api + web
```

Seeded credentials, unchanged from 001:

| Attendee | Password | Registered for |
|---|---|---|
| `ada@example.com` | `correct-horse-battery-staple` | Product & Design Summit (populated), Frontend Horizons (populated) |
| `grace@example.com` | `correct-horse-battery-staple` | Product & Design Summit (populated, shared), Systems & Scale (**no programme**) |

Several scenarios depend on where "now" falls relative to the seeded dates. Set the clock rather than
waiting — the seed keeps its dates in one module so they can be moved instead.

---

## Scenario 1 — Arrive at the right conference, with real day context

**Exercises**: FR-100, FR-102, FR-103, FR-120–FR-125, FR-170. US1. SC-100, SC-101, SC-106.

1. Sign in as Ada. Do not touch the switcher.
2. Home names an event, its location, and a day line.

**Expected**: with the clock inside Product & Design Summit, that event is active and the day line
reads "Day N of 4" with N correct for the venue's date. The greeting names Ada — not "Sarah" — and its
time-of-day wording follows *your* device clock.

**Then the part that actually tests it**: set the device timezone to `America/Lima` and the clock to a
moment where the venue date has rolled over but Lima's has not. **The day number must follow
Barcelona, not Lima.** A device-local computation passes the first half of this scenario and fails
here, which is the whole reason FR-120 exists.

**Also check**: with the clock before every seeded event, Home says an event *starts in* N days; after
all of them, it says the most recently ended one has ended. Neither shows a day number.

---

## Scenario 2 — See what is happening next, and the whole programme

**Exercises**: FR-130–FR-140, FR-171, FR-172. US2. SC-101, SC-107.

1. Signed in as Ada with the clock mid-conference-day, look at Home.
2. Open **Agenda**.

**Expected**: Home's next-session card names the next session by start time with its time, room,
track and speakers. The rest-of-day card lists what remains. Agenda lists **every** session for the
active event in chronological order, tracks visually coded *and named in text*.

**Check the cases that are usually skipped**:

- Set the clock past the last session of the day. The next-session card **says so** — it does not go
  blank and does not show a session from this morning (FR-140).
- Find the seeded session with no speaker. It renders completely, with no empty speaker area and no
  placeholder name (FR-138).
- Confirm Agenda offers **no** save, add or remove control, and does not present their absence as a
  disabled promise (US2 scenario 6). Those arrive in 005.

---

## Scenario 3 — Switch, and watch everything follow

**Exercises**: FR-104, FR-110–FR-119. US3. SC-102, SC-103, SC-107, SC-108.

1. As Ada, switch from Product & Design Summit to Frontend Horizons.
2. Compare Home and Agenda before and after.

**Expected**: day context, next session, rest-of-day and the Agenda programme all show Frontend
Horizons. **Nothing** still shows the previous event. Per SC-107 the two programmes share no session
title, track, room or speaker and differ in session count, so the change is obvious without being
told where to look.

The browser address is unchanged, because it never named an event (FR-119, US3 scenario 8).

**Durability** — the point of the whole design: sign out, sign in from a different browser profile.
Frontend Horizons is still active (SC-103).

**Explicit choice is not overridden**: move the clock past Frontend Horizons' end date and sign in.
It is *still* active (FR-104). An implementation that re-derives here has taken the alternative the
brainstorm rejected.

**One event only**: as a Grace-like attendee registered for a single event, the top bar identifies it
and offers **no** choice (FR-114).

---

## Scenario 4 — Isolation, which is the one that must not be waved through

**Exercises**: FR-145–FR-151. US4. SC-105.

Automated first, because this is not a claim to make by clicking:

```bash
pnpm test:integration                    # isolation suite, real rows, real queries
pnpm test:unit                           # includes the route audit
```

**Expected**: the audit fails CI when any route declaring an event parameter lacks the access guard.
Verify it can actually fail — comment the guard off one route and watch it go red. **A guard that has
never been seen failing is not known to work**, which is the lesson of the
`substitutability-proven-without-the-application` finding this feature was reshaped around.

By hand, signed in as Ada, request Systems & Scale's programme — Grace's event, not Ada's:

```bash
curl -i --cookie "<ada session>" localhost:<port>/events/<systems-and-scale-id>/sessions
curl -i --cookie "<ada session>" localhost:<port>/events/00000000-0000-0000-0000-000000000000/sessions
```

**Expected**: the two responses are **identical** — same status, same body. If the real event's
refusal differs in any way from the nonexistent one's, existence has leaked (FR-148).

Also try `PUT /workspace/active-event` with Grace's event id. Refused, and Ada's active event is
unchanged.

---

## Scenario 5 — A broken card does not take Home down

**Exercises**: FR-155–FR-165. US5. SC-104, SC-109.

```bash
pnpm test:component
```

The suite registers a card that throws deliberately, alongside the real ones.

**Expected**: every other card renders, the failing card shows a contained failure region naming what
is unavailable, and Home is never blank. Then the variants:

- A card whose **data** request fails shows its own failure state with a retry, and no other card is
  affected.
- With the active event unresolvable, conference-scoped cards say they are unavailable while the
  attendee-scoped conferences card **still renders** — the split that FR-160 exists for, and the
  reason the attendee-scoped card is a real card rather than a test double.
- A card with nothing to show renders a visible empty state. It does **not** disappear (FR-161).
- Two cards claiming `lead` are detected rather than silently resolved (FR-157).

---

## Scenario 6 — Offline, honestly

**Exercises**: FR-112, FR-115, spec Feature Declarations (offline row). US3 scenario 4.

1. Sign in, then go offline (DevTools, or stop the API).
2. Reload Home. Then attempt a switch.

**Expected**: the shell and navigation still work. Every conference-scoped card says it needs a
connection — distinguished from a server fault, as 001 established. The switch is **refused with an
explanation**; the previous event stays active; nothing is queued and nothing is shown as having
succeeded. This is the sign-out precedent in `TopBar.tsx`, applied to the switcher.

Nothing is cached, so the programme is unavailable offline. That is the declared behaviour, not a
defect — the staleness policy is Open Question 2.

---

## Scenario 7 — Keyboard and layout

**Exercises**: FR-116, spec Feature Declarations (layout, accessibility). SC-101, SC-108.

Complete the whole journey — arrive, read what is next, switch, read what is next again — **using only
the keyboard**. Focus visible at every step. The switcher has an accessible label, opens and closes
by keyboard, and **Escape closes it without changing the selection**.

At 320px, 768px and 1280px: no horizontal scrolling anywhere, including with a long event name beside
the attendee's name and the sign-out control in the top bar.

```bash
pnpm test:e2e                            # navigation, responsive, accessibility, offline, durability
```

---

## Scenario 8 — The split changed nothing

**Exercises**: FR-180–FR-183. SC-110.

At the commit that performs the split and the commit before it:

```bash
pnpm verify
```

**Expected**: the same suite passes on both, unchanged, and `contracts/openapi.json` is
**byte-identical** across the split commit. A diff in the generated contract means the split moved
behaviour, not just files.

---

## Full gate

```bash
pnpm verify:clean                        # every gate, against a clean database
```

**A note that belongs here rather than in a footnote**: the route audit and the isolation suite are
enforced only by CI. The brainstorm overview records that runs have been queued since 2026-08-06 and
that nothing on `develop` has ever passed CI. Until that is fixed, `pnpm verify:clean` locally is the
only place these guarantees are actually checked — which makes running it before opening the pull
request non-optional for this feature.
