# Review Guide: Network — Contacts, Exchanged Cards, and Appointments

**Generated**: 2026-08-10 | **Spec**: [spec.md](spec.md)

## Why This Change

MyNet's discovery surface is **per-event and deliberately uncached** — 006 refused to cache the
directory because a cached directory is other people's personal data ageing on a device after they
chose to be invisible. The consequence nobody had written down: **when a conference ends, nothing
durable is left behind.** Standing decision 7 has promised since 2026-08-06 that "a contact made at
last year's conference must not vanish", and as of 007 nothing kept that promise.

Network was also the last of the five destinations with no content, and it was blocked for the
entire life of the project — not by any dependency, but by two client decisions in the
constitution's register that each said in their own words that they *block the Network feature
entirely*.

## What Changes

Network becomes the durable half of the product. **A contact is someone whose digital business card
you hold** — sharing a card is now the only relationship-forming act in MyNet, and it closes register
entries 7 and 8 with a single decision. Sharing is one-directional: it gives the recipient your
card and gives you nothing. A held card resolves the sharer's **live** profile under a standing
consent that outlives both the event and their discoverability toggle.

Alongside it, appointments: per-event, proposed then accepted or declined, over a seeded slot grid.
Home gains an appointment summary card, and Discover's long-empty action boundary finally gets its
share and schedule actions.

**No breaking change to shipped behaviour.** One requirement was withdrawn *before implementation*:
a card-only contact line, cut as a breach of standing decision 16.

## How It Works

**The central technical decision is a split, and it is the opposite of what 007 predicted.**

- **Cards are cross-event**, so a card route names no conference — and `event-scope-audit` does not
  fail such a route, it **never examines it and reports success**. Cards therefore get a third
  branded scope (`CardScope`), a `requireHeldCard` guard, and a **third route audit**, mirroring
  what 007 built for conversations. The predicate is **directional** ("do you hold a card *from*
  this attendee"), unlike symmetric participation.
- **Appointments are per-event**, so they register beneath `/events/:eventId/appointments` and sit
  inside the guarantee that already exists. No new machinery.

Three tables in migration `0007`: `shared_cards` (cross-event, storing the exchange and not the
person), `appointments` (per-event), and `meeting_slots` (seeded conference content). Availability is
**one query whose every input is keyed to the reader**. Offline: appointments cached under the
existing key, contacts refused, every write refused rather than queued.

Client extension is entirely through declared append-only points — one line in `navigation.ts`, one
import and one entry in `home/registry.ts`, two lines on `Repositories`.

## When It Applies

**Applies when**:

- Two attendees share a current event and one chooses to share their card (sharing requires
  co-attendance).
- A card is already held — resolution requires **no** shared event, **no** discoverability, and
  **no** verification. This asymmetry is the feature's entire purpose.
- An appointment is proposed within a single event, by attendees both registered for it.

**Does not apply when**:

- The two attendees have blocked each other, in either direction — cards stop resolving and
  scheduling is refused.
- A contact is not registered for the **active** event: the schedule action is absent entirely
  rather than refused after the fact.
- Anything wants a notification. Nothing here dispatches one.

## Key Decisions

1. **A contact is a held card** (closes register entries 7 and 8 together). Alternatives: derive
   contacts from conversations (the prototype's model — **foreclosed by 007**, since open send makes
   a conversation unilateral, so a stranger could insert themselves into your Network with one
   message); an explicit one-sided save (invents a verb in neither `requirements.md` nor the
   prototype); the union of both (a list assembled from two rules is hard to leave).

2. **Sharing is one-directional.** Alternative: mutual on send, which matches the word "exchanged"
   and the prototype's interaction. Rejected because it captures a person's details permanently on
   somebody else's say-so, and the usual defence — that co-attendees already see each other — fails
   on the time axis, which is exactly what this feature adds.

3. **A held card is a live pointer, not a snapshot.** A snapshot needs no standing-consent rule, but
   duplicates personal data, outlives the subject's own edits, and creates a second source for one
   person. The cost is accepted and written down: resolution deliberately bypasses the directory's
   discoverability condition.

4. **Appointments take an acceptance step that conversations and cards both refused.** Deliberate
   asymmetry, not drift: a message and a card impose nothing on the other person, whereas an
   appointment claims a slot of their time.

5. **Slot availability discloses nothing about the invitee.** The delivery roadmap proposed deriving
   slots from *both parties'* saved sessions by name, and it was **rejected on Principle VIII
   grounds** — greying out somebody's committed slots tells you where they will be all day. A saved
   session is private state. The same objection killed a server-side auto-decline on conflict.

6. **A received proposal reserves nothing.** Emerged from the spec review. Both obvious readings are
   bad: if a received proposal blocks the invitee's slot, anyone can consume a stranger's day; if it
   does not, an invitee can double-accept. Fixed by separating them — availability is reader-keyed
   only, and double-booking is caught at **acceptance**, where the invitee is told about a conflict
   in *their own* schedule and nothing leaks.

7. **The card contact line was withdrawn.** The spec specified an attendee-authored field carried
   only by a shared card, on the reading that decision 16's "all-or-nothing" governed the directory
   rather than the attendee. **The owner rejected that reading.** Constitution v3.2.0 now says
   explicitly that no feature may give an individual field its own audience.

## Areas Needing Attention

**The blocking precondition.** Implementation may not begin until
`docs/unblock-008-network-and-appointments` merges — it carries constitution **v3.2.0**, which is
what closes entries 7 and 8. T001 exists to check this. Reviewing the spec against v3.1.0 will
mislead you.

**Two comment corrections in 007's files** (T023, T024). Both `plugins/participation.ts` and
`participation-audit.test.ts` state that "008's appointments are the first feature that will inherit
this", with the audit adding "which are also cross-event and also two-party". **Appointments are
per-event.** The prediction was reasonable when written and is wrong; left alone it sends the next
reader to the wrong guard. Worth confirming the correction is accurate rather than a different
mistake.

**The one cross-feature edit.** `db/queries/blocks.ts` gains a single call into
`cancelAppointmentsBetween` (T125). Blocking must *write*, because FR-637a requires cancellation.
The read-time alternative was rejected because lifting a block would resurrect a cancelled meeting.
This is the only file 008 touches that 007 owns.

**Cards and appointments treat a block differently, deliberately.** Cards **suspend** and resume on
unblock; appointments **cancel** permanently. Reasonable people could argue this is inconsistent.
The argument for it: a meeting somebody would otherwise turn up to must be ended visibly, whereas a
card is a fact about the past.

**Two success criteria read alike and guard opposite failures.** SC-605 is privacy (the invitee's
state cannot change what you are offered); SC-608a is anti-griefing (nobody can reduce your
availability). T074 and T075 each test one. The plan review found them mislabelled once already —
worth checking they have not re-converged.

**No pagination on contacts.** Assumed bounded by deliberate human acts, unlike 006's directory
which needed a keyset cursor for a thousand attendees. Stated as an assumption so it is visible if
wrong.

**Desktop and tablet remain unvalidated by the client.** The approved prototype is mobile-only at
390×844. This feature adds a two-pane Network and another modal to a growing pile of unreviewed
design.

## Open Questions

**None block implementation.** Two are recorded for the implementing session:

1. **What happens to an appointment when a participant withdraws from the conference** — not
   deletion, since the account still exists. The design position is that the record survives and the
   surface stops offering actions on it; it needs an integration test either way.
2. **Whether 008 splits into reviewable PRs.** Deferred to the phase-split hook against the real
   task list, as 007 did. The natural seam is cards | appointments | safety and polish, since the
   two API domains share only Phase 2. Weigh it against `develop` being squash-merge only, so a
   phase's separate commits do not survive the merge — a point 002 recorded after making the same
   split and getting review isolation only at the commit level.

## Review Checklist

- [ ] Key decisions are justified
- [ ] Breaking changes are documented with migration guidance
- [ ] Scope matches the stated boundaries
- [ ] Success criteria are achievable
- [ ] No unstated assumptions
- [ ] **v3.2.0 has merged before any implementation commit** (T001)
- [ ] **Card routes carry `requireHeldCard`** and the third audit fails without it — the existing
      event audit passes them silently
- [ ] **Appointment routes name `:eventId`** in the URL; `/appointments/:id` would land in that same
      blind spot
- [ ] **The availability query reads no invitee state** — the Principle VIII property
- [ ] **No column added to `attendees`**; the contact line stays withdrawn
- [ ] **`notification-triggers.test.ts` is unedited** — a second trigger requires an amendment
- [ ] Every new table declares its event-scoping rule *and the reason*; neither rule is a default

---

<!-- Code phase sections are appended below this line by the phase-manager command -->
