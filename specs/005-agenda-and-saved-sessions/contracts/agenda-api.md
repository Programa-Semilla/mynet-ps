# Contract: Agenda API (feature 005)

**Generated contract**: `contracts/openapi.json` at the repository root is authoritative and is
produced by observing routes as they register. This file is the design intent behind it.

Every route below nests under `/events/:eventId`, carries
`preHandler: [app.requireAttendee, app.requireEventAccess]`, and declares a `schema` block. All
three are load-bearing:

- **`requireAttendee`** binds identity from the sign-in session, never from the request (FR-227).
- **`requireEventAccess`** verifies registration and constructs the `EventScope` the query layer
  demands (FR-228, FR-229).
- **`schema`** is how the route reaches `contracts/openapi.json` at all — Swagger observes
  registration, so a route without one is silently absent from the contract rather than merely
  undocumented.

A route added here without the guard **fails the build** via the route audit (FR-230) — which is
itself repaired by this feature (research D7).

---

## `GET /events/{eventId}/agenda/saved`

The attendee's saved session identifiers for this conference.

**200**
```json
{ "sessionIds": ["3f1c…", "9ab2…"] }
```

Identifiers only, not whole sessions. The programme is already fetched and cached; returning full
sessions here would be a second source of truth for session data that could disagree with the first.

An attendee who has saved nothing gets `{"sessionIds": []}` — a valid answer, not a 404.

---

## `PUT /events/{eventId}/agenda/saved/{sessionId}`

Save a session. **Idempotent** (FR-187).

- **204** — saved, or already saved. The same response either way; the caller does not need to know
  which, and telling them would leak nothing useful.
- **404** — the session is not in this conference. Deliberately indistinguishable from "no such
  session" (FR-231).

Empty body. The address *is* the pairing.

---

## `DELETE /events/{eventId}/agenda/saved/{sessionId}`

Unsave. **Idempotent** — 204 whether or not it was saved.

---

## `GET /events/{eventId}/agenda/notes`

Every note the attendee has written in this conference.

**200**
```json
{
  "notes": [
    { "sessionId": "3f1c…", "body": "Ask about the migration path.", "updatedAt": "2026-09-14T10:22:31.000Z" }
  ]
}
```

Returned as a set rather than per session, so opening the panel needs no additional request and the
whole set caches as one entry (data-model, `resource: notes`).

---

## `PUT /events/{eventId}/agenda/notes/{sessionId}`

Write or replace a note.

**Request**
```json
{ "body": "Ask about the migration path." }
```

- `body` — `string`, `minLength: 1`, `maxLength: 10000`. The schema enforces D9's limit at the
  route; the `CHECK` constraint enforces it again at the column. Client-side presentation of the
  limit is never the enforcement (Principle VIII).

**200**
```json
{ "updatedAt": "2026-09-14T10:22:31.000Z" }
```

Returning `updatedAt` is what lets the client's status enter `saved` **from a confirmed response**
rather than from the keystroke — the property that keeps this non-optimistic (research D5) and
therefore outside the constitution's optimistic-update clause.

- **400** — body empty or over length. Reached only by a client that bypassed the editor; the
  editor prevents it (FR-213), so this is defence, not the designed path.
- **404** — session not in this conference, worded as above.

---

## `DELETE /events/{eventId}/agenda/notes/{sessionId}`

Remove a note. **204**, idempotent.

This is the path FR-212 takes: clearing the text does not write an empty note, it deletes. Combined
with the `length(body) > 0` constraint, "no note" has exactly one representation in the database.

---

## Errors, uniformly

| Status | Meaning | Client wording |
|---|---|---|
| **401** | No valid session | Handled by the existing sign-in redirect |
| **403** | Not registered for this conference | "Not available to you" — never whether it exists |
| **404** | Session not in this conference | Identical wording to 403 by design (FR-204, FR-231) |
| **400** | Note empty or too long | Should be unreachable from the editor |

**A 403 purges the cached entries for that `(attendee, conference)` pair** (FR-221, research D10).
The cache must not serve content the server has begun refusing — offline, the 24-hour lifetime is
the only remaining revocation, which is why it exists.
