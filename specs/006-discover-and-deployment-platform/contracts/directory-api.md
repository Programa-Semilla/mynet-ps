# Contract: the attendee directory

**Feature**: 006 | **Date**: 2026-08-07

The generated, committed contract is `contracts/openapi.json` at the repository root, built by
Swagger from the Fastify route schemas as they register. **This file is the intent**; that file is
the artifact, and CI fails when they disagree.

**One new route.** The two 004 routes this feature consumes are used unchanged, and that is
deliberate: the profile view inherits their four-way indistinguishable refusal by construction, which
is what confines FR-404's disclosure narrowing to the listing alone.

---

## `GET /events/{eventId}/attendees` — NEW

The directory for one conference: filtered, ranked, paginated, avatars attached.

**Guards**: `requireAttendee`, then `requireEventAccess`. The route names `:eventId`, so
`tests/unit/event-scope-audit.test.ts` **fails the build** if the second guard is absent — the
reader-side condition is enforced by the audit rather than by anyone remembering it.

### Query parameters

| Name | Type | Notes |
|---|---|---|
| `q` | string, optional | Free-text search. Matches display name, company, role and headline, case- and accent-insensitively. **Never matches email** (FR-407) |
| `role` | string, optional | Exact role filter |
| `interest` | string, optional | Exact interest filter |
| `cursor` | string, optional | Opaque. Encodes the previous page's last `(sharedInterestCount, attendeeId)` |
| `limit` | integer, optional | Page size, bounded server-side |

`q`, `role` and `interest` combine **conjunctively** with each other (FR-408).

### 200 — a page of the directory

```jsonc
{
  "attendees": [
    {
      "attendeeId": "uuid",
      "displayName": "string",
      "company": "string | null",
      "role": "string | null",
      "headline": "string | null",
      "networkingIntent": "string | null",
      "availability": "available | busy | null",
      "interests": ["string"],
      "sharedInterestCount": 0,
      "avatar": { "contentType": "string", "base64": "string" }  // or null
    }
  ],
  "nextCursor": "string | null"   // null when this is the last page
}
```

`additionalProperties: false` on the attendee object, and the query does not select them either.
**Two mechanisms for one property**, exactly as 004 did for the single-profile response: `email` and
`emailVerified` must never appear, and this is the response where getting it wrong is silent.

**`avatar` is embedded** (FR-456) at the 96px card rendition, not the 512px profile one. The larger
rendition continues to serve the profile view through 004's existing avatar route.

**`sharedInterestCount` may be `0`** and the attendee still appears — the ranking is a `LEFT JOIN`,
so zero-overlap attendees rank last rather than vanishing. Whether `0` is *displayed* is a
presentation decision recorded in the spec's Assumptions (it is not).

### 401 — not signed in

Unchanged from every authenticated route.

### 404 — no such conference, or the reader is not registered for it

One refusal for both, produced by `requireEventAccess` before the handler runs. The reader learns
nothing about conferences they are not part of.

### Empty is not an error

A conference where nobody is discoverable returns `200` with `"attendees": []` and
`"nextCursor": null`. The client's empty state must be worded so it does not disclose *which* of
"nobody registered", "nobody discoverable" or "nobody matched" applies (FR-415).

### What the response cannot say

There is no total count, no withheld count, and no field distinguishing a hidden attendee from a
nonexistent one. FR-404 bounds the listing's disclosure to *membership of the discoverable-and-
verified set*, and adding any of those three would widen it.

---

## `GET /events/{eventId}/attendees/{attendeeId}` — EXISTING, unchanged

004's single-profile read. Three conditions in one predicate; *not registered*, *does not exist*,
*not discoverable* and *not verified* all produce one identical 404.

This feature adds no field, changes no guard, and relaxes no condition. The profile view (US2) is
built on it as it stands.

---

## `GET /events/{eventId}/attendees/{attendeeId}/avatar` — EXISTING, unchanged

004's avatar read, at the 512px profile rendition, under the same three conditions via the same
query. `204` when the attendee has none, made indistinguishable from "not visible to you" by
re-checking visibility before answering.

The directory does **not** call this route — that is the N-round-trip problem FR-456 exists to avoid.
It continues to serve the profile view.

---

## `GET /ready` — NEW

**Distinct from `/health`, which is unchanged** (FR-482, FR-483).

| | `/health` | `/ready` |
|---|---|---|
| Touches the database | No | **Yes** — `select 1` |
| Discloses dependency state | No, deliberately | Yes |
| Purpose | Liveness; the process is up | Readiness; the process can serve |

`/health` remains unauthenticated and dependency-free on purpose: an unauthenticated endpoint should
not perform reconnaissance on infrastructure. `/ready` is what the deployment gates on, so a deploy
with an unreachable database is reported unhealthy **before** it takes traffic (SC-412) instead of
passing every check and then failing every request.

---

## Response headers — NEW, on every API response

Set by the API (research D8), so the existing integration suite can assert them on every change
without a proxy in front. Caddy sets the equivalents on static responses; neither sets the other's.

| Header | Value |
|---|---|
| `Content-Security-Policy` | at minimum `connect-src 'self'`, `img-src 'self' data:`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | no-referrer or stricter |
| `Strict-Transport-Security` | enabled on deployed environments |

**`img-src` must permit `data:`** and FR-481 records why: avatars are delivered as data URLs by
FR-456. Dropping `data:` in a later tightening would blank every face in the directory.

---

## Contract regeneration

`contracts/openapi.json` is regenerated and committed as part of this feature. The `contract` CI job
fails when the committed file and the routes disagree, so the new route's schema block is not
optional — `routes/index.ts` already states that a route without one is invisible to the contract.
