# Contract: Conference Content Authoring (014)

Phase 1 output. Routes, guards, refusals and absences. The generated OpenAPI contract in
`contracts/` at the repository root is the machine-readable authority; this file states the
reasoning that cannot be generated.

---

## Guards

### `requireConferenceAuthority` — the fifth branded scope

Mints `ConferenceAuthorityScope`, carrying the operator id, the tier, and the conference id.

| Caller | Conference | Outcome |
|---|---|---|
| Platform operator | any | scope minted |
| Conference organizer | assigned to it | scope minted |
| Conference organizer | not assigned | **404** |
| Attendee session, no operator session | any | **404** |
| No session | any | **404** |

**Every refusal is the same 404, produced by the same factory 013 established.** A 403 would tell an
organizer that a conference exists and somebody else runs it — an enumeration oracle over the
conference list, and the same reasoning that put a 404 on the report queue for the wrong tier.

**The scope is what `db/queries/admin-catalog.ts` demands**, so a handler that skipped the guard does
not compile. This is the fourth time the project has used the shape, after `EventScope`,
`ConversationScope` and `CardScope`, and the reason is 013's lesson: a header describing a call
relationship is a claim, and a type is a guarantee.

### What is NOT a new guard

- **No fourth route audit.** Every authoring route names its conference in the path
  (`/admin/conferences/:eventId/…`), so the existing event-scope audit's naming rule applies. 009
  established that a route finding its parent from a child id and naming no conference is the shape
  that walks past the audit — every route below is named to avoid it.
- **`requireEventAccess` is not used and must not be.** It mints an `EventScope` from an *attendee's*
  registration. An organizer authoring a conference has no registration and needs none.

---

## Routes

All under `/api/admin`, all requiring `requireConferenceAuthority` except conference creation.

### Conference

| Method | Path | Notes |
|---|---|---|
| `POST` | `/admin/conferences` | **`requireOperator` only** — there is no conference to have authority over yet. An organizer is assigned to what they create, in the same transaction (FR-1008). Mints the join code (FR-1009) |
| `PATCH` | `/admin/conferences/:eventId` | Name, location, dates, timezone. Refuses a date range that would orphan a session (FR-1014, naming them); refuses a timezone change once any session exists (FR-1015) |

**No `DELETE`** (FR-1011). Absence asserted.

### Programme

| Method | Path | Notes |
|---|---|---|
| `GET` | `/admin/conferences/:eventId/programme` | Sessions, tracks, rooms, speakers, plus **engagement counts per session** (FR-1025) |
| `POST` `PATCH` | `/admin/conferences/:eventId/sessions[/:id]` | Validates day range in venue-local time (FR-1012) and end-after-start (FR-1013). Warns rather than refuses on same-room overlap (FR-1016) |
| `POST` | `/admin/conferences/:eventId/sessions/:id/cancel` | Sets `cancelled_at`; **the one authoring act that reaches attendees' phones** |
| `POST` | `/admin/conferences/:eventId/sessions/:id/reinstate` | Clears it. **Dispatches nothing** (FR-1024) |
| `DELETE` | `/admin/conferences/:eventId/sessions/:id` | Permitted only with **zero** engagement (FR-1018), checked under `FOR UPDATE` inside the deleting transaction (FR-1019a) |
| `POST` `PATCH` `DELETE` | `/admin/conferences/:eventId/{tracks,rooms,speakers}[/:id]` | Track colour from tokens only (FR-1004). Delete refused while a session references it (FR-1017) |

---

## Refusals, and what each discloses

**The follow-up question must be about the caller, never about a third party.** 008 made proposing
an enumeration oracle by branching on whether the *invitee* was registered; 009 restated the rule.
Every explained refusal below describes something the caller already knows or controls.

| Situation | Status | Carries a reason? | Why |
|---|---|---|---|
| No authority over the conference | 404 | No | Indistinguishable from a conference that does not exist |
| Delete a session with engagement | **409** | **Yes** | Describes the caller's own conference, and the reason is the whole point — it tells them to cancel instead. Counts only, no identity (FR-1025) |
| Date range would orphan sessions | **409** | **Yes**, naming the sessions | The caller's own content |
| Timezone change with sessions present | **409** | **Yes** | The caller's own content |
| Track or room still referenced | **409** | **Yes** | The caller's own content |
| Session outside the conference's days | **400** | **Yes** | The caller supplied the time |
| Same room, overlapping time | **200 with a warning** | — | Permitted (FR-1016); the client confirms |
| Throttled | **429** | Standard shape | Per action (FR-1039) |

**The client must classify on `error.code`, never on the class.** `ApiError extends
RequestRefusedError` and every non-2xx throws `ApiError`, so `instanceof` catches 400, 404, 409 and
429 alike — which is how 008 swallowed every message its routes wrote to be read. A test must
require all the explained refusals above to render **differently from each other**.

---

## Notification payload

Dispatched from `routes/admin/catalog.ts` — **the second entry in `DISPATCH_CALLERS`** — after the
act-and-audit transaction commits, never inside it (R3).

```
single:    { session, change: 'cancelled' | 'time' | 'room', actId }
coalesced: { count, eventId, actId }
```

- **One per attendee per act** (FR-1034), keyed on the audit entry id (R4).
- **The acting principal is excluded** (FR-1028a).
- **Activation lands on the session (single) or Agenda (coalesced)** — never on a list of changes
  (FR-1034b), which is the surface v4.2.0's N2 forbids.
- **A failed dispatch does not fail the act** — 007's precedent for report mail.
- **`count` is the only aggregate over changes this feature produces**, permitted in the payload by
  N2 as amended and forbidden in every view.

---

## Attendee-facing changes

**No new route and no new repository member.** The marker travels on the existing agenda payload
(R7), which is what keeps this feature from declaring a new cached read and meeting 008's
`passThrough` trap.

| Surface | Change |
|---|---|
| Agenda row | Cancelled presentation; marker while `logistics_changed_at > viewed_at` |
| Session detail panel | Cancelled state; opening it clears the marker |
| `nextSession()` in `sessions.ts` | Skips cancelled — **one change point** serving both `UpNext` and `NextSavedSession` (R8, FR-1022a) |
| `RestOfDay` | Unchanged; shows cancelled sessions marked (FR-1022) |
| Q&A composer | Closed on a cancelled session; existing questions stay readable |

---

## Absences, each asserted by test

| Absence | Requirement |
|---|---|
| No authoring surface, privileged view or tier-dependent rendering in MyNet | FR-1003 |
| No aggregate count, change list, or bell **in either client** | FR-1031 |
| No draft/published state | FR-1040 |
| No route suspending, removing or restricting an attendee | FR-1041 |
| No administrative read of a note, message, or the identity of anyone who saved, questioned or voted | FR-1042 |
| No profile edit at any tier; no route from a speaker record to one | FR-1006 |
| No conference deletion | FR-1011 |
| No contact, conversation or appointment derived from an authoring act | FR-1044 |
| A session **starting** dispatches nothing | FR-1033 |

**Both guards strip comments before matching**, as 009's do — every pattern above also appears in
the prose explaining it, and a gate that fails on its own justification pushes the reasoning out of
the code.
