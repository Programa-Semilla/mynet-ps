# Contract: Attendee Identity, Personal Data and Profile

**Feature**: 004. Routes are appended to `apps/api/src/routes/index.ts` — **appended, never
inserted**, because the generated contract lists paths in observation order and reordering rewrites
`contracts/openapi.json` for no behavioural reason.

Every route below carries a `schema` block. A route without one is *silently absent* from the
generated contract, and `pnpm contract:check` cannot notice something never offered to it.

`contracts/openapi.json` is generated and committed; this file is the human-readable intent.

---

## Unauthenticated routes

These four are the product's first deliberately unauthenticated **write** routes. Each is
rate-limited under its own action counter (D2), and none may become an account-existence oracle
beyond what FR-303 explicitly accepts.

### `POST /auth/sign-up`

Body: `email`, `displayName`, `password`. Trimmed at `preValidation`, following `sign-in`'s
precedent — `format: 'email'` rejects a trailing space, and an attendee whose password manager
appended one would otherwise get a 400 for typing correctly.

| Status | Meaning |
|---|---|
| `204` | Created and signed in. Session cookie set; **no body**, so the token cannot leak into one. |
| `409` | Address already registered (FR-303). **Deliberately discloses**; see the spec's reasoning. |
| `400` | Malformed, or password fails the stated policy. |
| `429` | Throttled on the `sign_up` counter. |

Verification mail is dispatched after the account is committed, and **a send failure does not fail
the request** (FR-318a) — an unprovisioned provider is the expected state, not an exceptional one.

### `POST /auth/verify`

Body: `token`. Idempotent-ish: a consumed or expired token is refused identically.

| Status | Meaning |
|---|---|
| `204` | Verified. If discoverability is on, the attendee becomes visible for the first time. |
| `400` | Token missing or malformed. |
| `410` | Expired or already used (FR-321). |

### `POST /auth/reset-request`

Body: `email`.

| Status | Meaning |
|---|---|
| `202` | **Always**, whether or not an account exists (FR-327). |

A throttled reset request **must also return `202`** — a `429` here would be the account-existence
oracle FR-327 exists to close, and identifier-keyed throttling may delay but must never deny (D2),
because the person a denial harms is always the victim.

### `POST /auth/reset`

Body: `token`, `password`.

| Status | Meaning |
|---|---|
| `204` | Password changed. **Every** existing session for that attendee is revoked (FR-330). |
| `400` | Malformed, or password fails the policy. |
| `410` | Expired or already used. |

---

## Authenticated routes — the attendee's own data

All require the session; all derive identity from it and never from the body or the path (FR-385).

### `GET /profile` · `PUT /profile`

Own profile. `PUT` accepts company, role, headline, interests, networking intent, availability.
Absent fields clear; the client sends the whole profile, so "field omitted" has one meaning.

`404` is not used — an attendee with no profile row gets `200` with empty fields (FR-341), because
"you have not written one yet" is not an error.

### `PUT /profile/avatar` · `DELETE /profile/avatar`

`PUT` takes the image bytes. Decoded, resized and **re-encoded** server-side (D8), so metadata
absence is a property of the operation rather than a list of tags to maintain.

| Status | Meaning |
|---|---|
| `204` | Stored, replacing any previous object. |
| `413` | Over the size limit — refused **before** any bytes are stored (FR-347). |
| `415` | Not a decodable image of an accepted type. Determined by inspection, never by the declared header or the filename. |

### `PUT /profile/discoverability`

Body: `discoverable`. Takes effect on the next request without a new sign-in (FR-363).

The response states the **effective** visibility, not just the setting — an unverified attendee who
turns this on is still invisible (FR-359), and a response echoing only the flag would tell them the
opposite of what is true.

### `GET /profile/export`

One JSON document containing every field the product stores about the caller, avatar bytes embedded
(D11). Contains no credential material (FR-376). Rate-limited.

### `DELETE /account`

Hard, cascading, irreversible (FR-364–FR-368). Removes the storage object first, then the row (D10).
Revokes every session on every device. `204`, then the client is signed out.

---

## Authenticated routes — conferences and other attendees

### `POST /events/join`

Body: `joinCode`. Deliberately **not** under `/events/:eventId` — the caller does not yet know the
identifier, and a route declaring `:eventId` would trip the route audit into demanding
`requireEventAccess`, which cannot pass for a conference the attendee has not joined.

| Status | Meaning |
|---|---|
| `200` | Registered; returns the conference. Becomes active if it is the first (FR-315). |
| `200` | Already registered — **idempotent, not an error** (FR-312). |
| `404` | Unrecognised code. One wording for every cause (FR-313). |
| `429` | Throttled on the `join_code` counter, so the surface cannot enumerate codes. |

### `DELETE /events/:eventId/registration`

Withdraw (FR-317c). Carries `requireEventAccess` — you can only leave what you joined. Deletes the
registration, the conference's saved sessions and notes, and the active-conference row if it names
it. Leaves the attendee coherent (FR-317d).

### `GET /events/:eventId/attendees/:attendeeId`

Another attendee's profile. Carries `requireEventAccess`, so the **reader's** registration is proven
by the branded `EventScope` the route audit guarantees is present.

The **target** must additionally be registered for the same conference, be discoverable, and be
verified. All three are one `WHERE` over one join (D5), so *not registered*, *does not exist*, *not
discoverable* and *not verified* all produce no row and one identical `404` — indistinguishable **by
construction** rather than by four careful call sites, which is how 002 obtained the same property
for events.

---

## Repository interfaces

`packages/data/src/interfaces/` gains `identity.ts` and `profile.ts` — **new files**, so 004 and 006
never contend in `interfaces/index.ts` beyond one appended export line each. The per-domain split
002 performed exists for exactly this.

`CatalogRepository` is untouched. It is read-only in perpetuity and nothing here writes conference
content.

## Not in the contract

No route exposes another attendee's verification state, credential material, verification material,
or reset material (FR-391). No route accepts an attendee identifier as a substitute for the session.
No administrative route exists at any privilege.
