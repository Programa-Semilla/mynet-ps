# Contracts — 014 Tranche 2

**Created 2026-08-14.** Tranche 1's contract is [`authoring.md`](./authoring.md) and is unchanged.
This covers enrolment, the vocabulary, and the conference editor.

**Gated on constitution v5.3.0 (O1–O4), drafted and not ratified.**

## Guards

| Guard | Authority it expresses | Used by |
|---|---|---|
| `requireConferenceAuthority` (tranche 1) | this operator may write to **this** conference | conference editor, session authoring, the roster |
| `requirePlatformOperator` (013) | product-wide | the vocabulary |

**`requireConferenceAuthority` cannot authorise the vocabulary** — it reads `:eventId` from the path
and refuses with 404 when there is none, so it cannot express product-wide authority at all (R20).
The vocabulary routes take `requirePlatformOperator`, which mints the platform scope and refuses an
organizer with the same `notFound()` every other administrative refusal uses.

## Attendee routes

| Route | Purpose | Refusals |
|---|---|---|
| take a place in an optional session | FR-1063 | `session_full`, `enrolment_closed`, `already_enrolled`, `not_optional` — **each its own code** |
| release a place | FR-1067 | the indistinguishable 404 |
| read the commitment set | FR-1066 | — grown in place on the existing saved-sessions read, with a `saved` / `place` discriminator (R13) |
| read remaining places | FR-1070 | — **live, `passThrough`**, never served from cache (FR-1070b) |

**The four enrolment refusals MUST be mutually different**, asserted as difference from each other
rather than as each mapping to some explanation (FR-1069a). This feature's own recorded lesson is that
a per-code check passes while checking nothing when several codes share a sentence.

**Order matters**: already-enrolled resolves **before** full, or a double-tap on a full session reports
`full` about a place the caller already holds (R12).

**A lock-wait timeout is a 500 and MUST NOT be classified as `full` or `closed`** (R12). Telling
somebody the session is full when the server never decided anything is a settled outcome the client
will render.

## Administrative routes

| Route | Guard | Note |
|---|---|---|
| `GET /admin/conferences/:eventId/sessions/:id/enrolments` | conference authority | **The fourth privacy exception (O1).** Names only; no saves, notes, questions or votes |
| conference editor (modality, format) | conference authority | FR-1059 — the update path exists server-side and had no caller |
| conference creation | conference authority | FR-1059b — **MUST collect modality**; refusing with its own code |
| vocabulary CRUD | **platform operator** | FR-1089; retire rather than delete (FR-1094); **rename refused while held** (FR-1094c) |

**The roster route is not caught by the shipped disclosure guard** and that is the finding, not a
convenience (R16). `enrolments` matches none of its seven nouns, so it would ship green with no
exemption and no record — a pass by omission. The work is ordered: **widen the detector first, watch
the route fail, then exempt it by name.** An exemption written before the widening is a decorative
constant beside a check that never fires.

## Absences this contract asserts

- No route that enrols, releases or moves a place on an attendee's behalf, at any tier (FR-1076).
- No administrative read of saved sessions, notes, questions or votes — FR-1042 survives unnarrowed
  for all four (FR-1075).
- No administrative write to any attendee's own taxonomy selections (FR-1093).
- No route that records whether an attendee used an access link (FR-1057).
- No notification dispatched by anything in this tranche except the widened population of the existing
  second trigger (FR-1099c, FR-1079a).
