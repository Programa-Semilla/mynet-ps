# API Contract

**Feature**: 001-production-foundation | **Constitution**: v2.0.0

## How the contract works here

Clarification 5 settled that the contract is **derived from the server implementation**, not authored
separately. That decision shapes everything in this directory.

```
Fastify route schemas          the source of truth
        │                      (params, body, response — also runtime validation)
        ▼
  fastify.swagger()            generates the OpenAPI document
        │
        ▼
  contracts/openapi.json       committed snapshot  ← appears in the PR diff
        │
        ├─── CI regenerates and diffs ──► fails if the committed copy is stale (FR-044b)
        │
        └─── client data access verified against it ──► fails on divergence (FR-044c)
```

**`openapi.json` is an output, never an input.** Editing it by hand achieves nothing except a failing
pipeline: the next regeneration overwrites it. To change the contract, change the route schema.

**Why it is committed at all**, given the server is authoritative: without a committed snapshot, a
breaking change simply becomes the new contract with nobody noticing. Committing it puts every
contract change in the diff where a reviewer sees it (FR-044b).

**Known limitation** — spec Open Question 19: this makes changes *visible*, not *classified*. Nothing
here distinguishes an additive change from a breaking one. A semantic diff that fails only on breaking
changes is a candidate for a later slice.

## Generated artifact

`contracts/openapi.json` — produced at build time by `@fastify/swagger`. Not present until the API
exists; created by the implementation phase, not by planning.

## Planned endpoint surface

The design-time intent. The generated document supersedes this the moment it exists; if the two ever
disagree, the generated document is right and this file is stale.

Every endpoint except sign-in requires a valid sign-in session cookie. Every authenticated endpoint
resolves the attendee from that cookie server-side and **never** from a client-supplied identifier
(FR-035, FR-036).

### Authentication

| Method | Path | Purpose | Requirements |
|---|---|---|---|
| `POST` | `/auth/sign-in` | Exchange credentials for a sign-in session cookie | FR-025, FR-026, FR-030, FR-031a–d |
| `POST` | `/auth/sign-out` | Revoke the current sign-in session server-side | FR-027 |
| `GET` | `/auth/me` | The signed-in attendee's identity | FR-032 |

**`POST /auth/sign-in`**

- Request: normalised email plus credential.
- Success: `204`, with the session token set as an `HttpOnly`, `Secure`, `SameSite=Lax` cookie. The
  token never appears in the response body, so it is never reachable from JavaScript.
- Failure: a **single** generic response for both "no such identifier" and "wrong credential"
  (FR-030). The response must be indistinguishable in status, body, and — as far as practical —
  timing.
- Throttled responses carry no signal about whether the identifier exists (FR-031d).
- The submitted credential is never logged, and never written to `sign_in_attempts` (FR-031c).

**`GET /auth/me`**

- Success: the attendee's identifier and display name only. Never the credential hash, never
  another attendee's data.
- Invalid, expired, or revoked session: refused, and the client returns the attendee to sign-in with
  an inactivity explanation where the cause was expiry (FR-028c).

### Workspace

| Method | Path | Purpose | Requirements |
|---|---|---|---|
| `GET` | `/events` | Events the signed-in attendee is registered for | FR-039, FR-040 |

- Scoped through `registrations` for the authenticated attendee. There is **no** `attendee_id`
  parameter, on purpose — the endpoint has no way to express another attendee's events, which is what
  makes FR-036 structural rather than a check someone has to remember.
- An attendee with no registrations receives an empty collection, not an error (FR-040).

### Operational

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness for the hosting platform |

Deliberately minimal. A fuller observability surface — readiness, metrics, request logging — is spec
**Open Question 20**, deferred at the clarification quota and recorded rather than quietly skipped.

## Error responses

Per FR-059, an attendee-facing error explains what happened and what to do next, and never exposes
internal detail, stack traces, or database errors. Per FR-060, the server records enough to diagnose
the failure, with no credentials, session tokens, or message content in the record.

| Situation | Response shape |
|---|---|
| Invalid credentials, or unknown identifier | Identical generic refusal (FR-030) |
| Throttled | Refusal plus retry guidance, revealing nothing about identifier existence (FR-031d) |
| No/expired/revoked session | Refusal distinguishing *expired* from *never signed in*, so the client can explain inactivity (FR-028c) |
| Data belonging to another attendee | Refused without disclosing whether the record exists (FR-036) |
| Request fails schema validation | Field-level detail — safe, since it describes the request, not stored data |
| Unexpected server failure | Generic message plus a correlation identifier; detail goes to the server record only |

## Client-side contract obligations

FR-045 forbids feature and presentation code from constructing requests or knowing transport details.
Nothing in this directory is imported by a component. Endpoints are reached only through repository
implementations behind the interfaces in `packages/` (D10), so replacing an implementation with a test
double satisfies FR-047 without touching feature code.
