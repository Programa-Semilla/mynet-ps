# Validation Record

**Feature**: 001-production-foundation | **Constitution**: v2.0.0
**Executed**: 2026-08-05 | **Branch**: `spec/production-foundation`

Results of [quickstart.md](./quickstart.md)'s scenarios and the Phase 8 review tasks. Every
"pass" below was executed, not inspected. Where something could not be executed, it says so and
says why.

> Constitution Principle VII: completion is claimed from pipeline output. Everything here passed
> **locally**. The pipeline cannot run green until T001–T003 provisioning exists, so this record
> is evidence, not the gate.

---

## T109 — Quickstart scenarios

| Scenario | Result | Evidence |
|---|---|---|
| 1 — Sign in and see your own workspace | **Pass** | `e2e/sign-in.spec.ts`, 8 cases |
| 2 — One attendee cannot see another's data | **Pass** | `apps/api/tests/integration/isolation.test.ts`; plus the manual request manipulation below |
| 3 — Navigate on every device | **Pass** | `e2e/navigation.spec.ts`, `e2e/responsive.spec.ts` |
| 4 — Accessibility | **Pass** | `e2e/accessibility.spec.ts` — zero critical or serious violations, 5 destinations × 3 widths |
| 5 — Install and behave honestly offline | **Pass, except install-to-home-screen** | `e2e/offline.spec.ts`, 6 cases. See the gap below |
| 6 — Session expiry | **Pass** | `apps/api/tests/integration/auth-session.test.ts` — sliding extension, expiry, revocation, tampering |
| 7 — Sign-in throttling | **Pass after a fix** — see below | `apps/api/tests/integration/throttle.test.ts`, 7 cases |
| 8 — The pipeline actually catches things | **Pass for every locally-runnable gate** | Below |
| 9 — Clean-clone reproducibility | **Pass** | Below |

### Scenario 2, executed by hand against the running API

Signed in as Grace, then attempted to reach Ada's data:

| Attempt | Result |
|---|---|
| `GET /events?attendeeId=ada` | Grace's own two events. The parameter has no effect because no route reads one |
| `GET /events` with `X-Attendee-Id: ada` | Grace's own two events |
| Tampered session cookie | `401 {"code":"not_authenticated"}` |
| Fabricated session cookie | `401 {"code":"not_authenticated"}`, byte-identical to the above |

Ada's exclusive event (*Frontend Horizons*) never appeared in any response. The refusals
disclose nothing about whether any referenced record exists.

### Scenario 7 — a defect this scenario found

Executing this scenario by hand surfaced a **live lockout defect** that the existing test suite
did not catch.

`nextDelayMs` returned the delay a failure streak earns, and the sign-in route refused on any
non-zero value — but **nothing subtracted the time already waited**. The delay could therefore
never be served: past three consecutive failures, every attempt was refused for the remaining
hour of the rolling window, however long the attendee waited.

Because email is the identifier and anyone can type anyone's address, an attacker could hold any
account they could name shut indefinitely by failing four times an hour. That is what FR-031b
forbids and what SC-003a measures as "the number of accounts an attacker can render permanently
inaccessible is zero". The file's own header had always claimed the correct credential works
however many failures preceded it; the claim was false.

The existing "NEVER permanently locks the account" test passed throughout, because it deletes
the attempt rows to simulate waiting — which tests that the window eventually clears, a
different thing.

**Fixed** in `apps/api/src/auth/throttle.ts` (`outstandingDelay`), and covered by a new
integration case that waits out the delay without clearing anything. Verified against the
running API afterwards:

```
fail 1..4                        -> 401
correct credential, immediately  -> 429   (delay outstanding)
correct credential, after 1.5s   -> 204   (delay served)
```

`sign_in_attempts` was inspected directly. It holds `identifier_hash`, `source_hash`,
`occurred_at`, `succeeded` — no credential material and no readable address (FR-031c, FR-042).

### Scenario 8 — every gate broken on purpose

| Break | Gate | Result |
|---|---|---|
| Type error in `branding.ts` | `typecheck` | Failed, naming the file and line |
| Inline `#ff0000` in a component | `lint` (SC-009) | Failed, naming the literal |
| Inverted assertion in a unit test | `test:unit` | Failed, naming the case |
| Added a response field without regenerating | `contract:check` | Failed |
| `fetch()` called in `TopBar.tsx` | `lint` (SC-008) | Failed, naming the call |
| Padded the entry chunk with 80 KB | `budget` (FR-072) | Failed: "exceeded by 47.7 KB", exit 1 |
| Replaced the email `<label>` with a `<span>` | `test-accessibility` (SC-005) | Failed, all five cases |
| Migration referencing a missing table | `db:migrate` (FR-038) | Failed, exit 1, against a scratch database |

Every gate failed when broken and returned to green when restored. **The remaining gates —
ephemeral API deployment and preview deployment — could not be tested, because they need
credentials that do not exist yet.** That residue is T093, which stays open.

### Scenario 9 — clean clone

Executed in a fresh directory from a fresh clone, following the README exactly. See the
transcript in the commit that introduced this file. Install, migrate, seed, build, and every
verification command succeeded with **no undocumented step**.

Two undocumented steps were found and removed rather than documented, which is the correct
resolution of SC-014:

- Nothing loaded `.env`, so every database command required exporting it into the shell by
  hand. Now loaded automatically by `apps/api/src/env.ts`, with the real environment taking
  precedence so a pipeline secret cannot be overridden by a stray local file.
- Vite read env from `apps/web` rather than the repository root, so the client silently built
  with no API base URL and called its own origin.

One genuinely-new step was found and **documented** rather than removed, because it cannot be:
`pnpm exec playwright install chromium` downloads a browser. The clean-clone run did not need it
— the browser cache is shared across clones — so the omission was invisible until it was reasoned
about rather than observed. It is now in the README.

Commands executed in the clone, all passing: `pnpm install --frozen-lockfile`, `db:migrate`,
`db:seed`, `typecheck`, `lint`, `format:check`, `test:unit`, `test:component`, `contract:check`,
`test:integration`, `build`, `budget`, and `test:e2e` (39 cases).

---

## T110 — Dependency audit against FR-003

FR-003: the production dependency set must be derived from actual need, and the prototype's
inherited list must not be carried forward wholesale.

**Production dependencies, in full:**

| Package | Required by |
|---|---|
| `fastify` | FR-044a — route schemas are the contract's source of truth |
| `@fastify/swagger` | FR-044a — generates the contract from those schemas |
| `@fastify/cookie` | FR-025 — the sign-in session is an HttpOnly cookie |
| `@fastify/cors` | The client and API are separate origins |
| `fastify-plugin` | Required to write the auth-context and error plugins at all |
| `drizzle-orm` + `postgres` | FR-037 — versioned migrations over PostgreSQL |
| `argon2` | FR-031 — non-recoverable credential storage |
| `react`, `react-dom` | The client |
| `react-router` | FR-013 — five individually addressable destinations |
| `lucide-react` | FR-010 — the single permitted icon set |

**Nothing was carried forward.** The prototype's `package.json` carries MUI, recharts, react-dnd,
react-slick, embla, a full unused shadcn/ui scaffold, and more. `react-router` is the only name
appearing in both lists, and it is here because FR-013 requires addressable routes — not because
the prototype had it. The prototype imports none of the rest, and neither does this.

Tailwind, Vite, Vitest, Playwright, ESLint, and Prettier are development dependencies and reach
no bundle.

---

## T111 — Review against constitution Principle VIII

| Obligation | Finding |
|---|---|
| **Identity scoping** | Every read path is scoped through the authenticated identity. `GET /events` joins through `registrations` for `request.attendee.id` and takes no parameter |
| **Server-side authorization** | Enforced in `plugins/auth-context.ts` at the request boundary. The client-side guard decides only what to *draw* — `RequireAuth.tsx` says so in a comment, so nobody later mistakes it for the boundary |
| **No caller-supplied identifier** | `grep` over `apps/api/src/routes/` finds no `attendeeId` parameter on any route. Both repository interface methods take **zero** parameters, asserted by arity in `packages/data/tests/substitution.test.ts` |
| **Secret placement** | The built bundle contains no occurrence of `AUTH_PASSWORD_PEPPER`, `AUTH_ATTEMPT_HASH_KEY`, `DATABASE_URL`, `postgresql://`, or `pepper`. The only env values in it are `VITE_API_BASE_URL` and `VITE_USER_NODE_ENV` |
| **Field minimisation** | `GET /auth/me` returns `{id, email, displayName}` only. The credential hash lives in its own table (`attendee_credentials`) so it cannot ride along in an attendee query. `passwordHash` appears in exactly one place outside the schema — the sign-in verification — and is never returned |
| **Session material** | Only `token_hash` is stored; the token itself exists only in the HttpOnly cookie. Sign-out sets `revoked_at` server-side, asserted end-to-end by replaying a captured cookie |
| **Defence-table hygiene** | `sign_in_attempts` holds HMAC hashes of identifier and source. A bare digest of an email is dictionary-reversible; the keyed hash is what stops that table becoming a list of addresses |
| **Logging** | The Fastify logger redacts `req.headers.cookie`, `req.headers.authorization`, `req.body.password`, and `set-cookie` at the logger rather than per call site |

**Outcome: no Principle VIII violations found.** One thing worth a reviewer's attention: the
`AUTH_PASSWORD_PEPPER` and `AUTH_ATTEMPT_HASH_KEY` values used in CI are written in the open in
`.github/workflows/verify.yml`. That is deliberate and safe — every database the pipeline touches
is an ephemeral branch of seeded throwaway data — and putting them in the secret store would sit
them beside real credentials and invite the assumption that the workflow is safe to point at
production. It is not.

---

## T112 — Recorded design review for FR-011

FR-011 requires the shell to present as an authenticated attendee workspace rather than a
marketing page or a generic enterprise dashboard, verified against four named criteria.

| Criterion | Finding |
|---|---|
| **The attendee's own identity is visible** | The top bar shows the display name the server returned for *this* session, and Home greets them by name. The prototype's hardcoded "Good morning, Sarah" is gone |
| **Navigation is persistent and workspace-shaped, not page-shaped** | A persistent left rail at desktop, a reduced rail at tablet, bottom navigation at mobile — present on every destination, never a page header with links. Exactly one form applies at any width |
| **No marketing copy, hero section, or call to sign up** | There is none. The unauthenticated entry point is a sign-in form, not a landing page. There is deliberately no "create an account" link, because there is no self-service sign-up |
| **The approved palette and typography are in use** | Every colour is a token in `tokens.css`; a lint rule holds the count of literals elsewhere at zero. Navy surfaces, coral accent, cream background, white cards, mint reserved for status. Outfit for display and Geist for body, per the prototype pairing |

**Two deviations from the approved palette, both forced by accessibility and both recorded:**

1. Muted text was `#8f96a8` — 2.96:1 on white, against a 4.5:1 minimum. Darkened to `#6b7185`
   (4.85:1 on white, 4.60:1 on cream), same blue-grey family.
2. Text on the coral accent was 3.27:1. The accent split in two: `accent` (coral-500) keeps the
   approved value for icons, indicators, and text on navy, where it passes at 4.65:1;
   `accent-strong` (coral-600, adjusted to `#c14329`) carries text surfaces at 5.04:1.

Constitution Principle IV does not bend for an approved palette, so the hue was preserved and the
luminance was not.

> **⚠ This review is not yet complete.** FR-011 requires the outcome **and its reviewer** to be
> recorded in the pull request. The findings above are the evidence, prepared by the
> implementation. They are not a substitute for a named human reviewer, who must countersign in
> the pull request — particularly on the two palette deviations, and on the desktop and tablet
> layouts, which the client has never seen (CLAUDE.md records that the prototype is mobile-only
> and that these layouts are unvalidated).

---

## T114 — Manual accessibility pass

| Item | Result |
|---|---|
| **Reduced motion** | **Pass, automated.** `e2e/responsive.spec.ts` drives a context with `reducedMotion: 'reduce'` and asserts no computed transition or animation duration exceeds 50 ms anywhere. Durations collapse to effectively instant rather than zero, so transition-end handlers still fire |
| **200% text zoom** | **Pass, automated.** Root font size doubled, then every destination is asserted to render its heading and navigation with zero horizontal overflow |
| **No horizontal scrolling** | **Pass, automated.** 13 widths from 320px to 1920px, including both sides of each breakpoint boundary, across all five destinations and the sign-in screen |
| **Visible focus at every stop** | **Pass, automated.** Tabbed to — not focused programmatically, because `:focus-visible` deliberately does not match a scripted `.focus()` — then computed outline width and style are asserted |
| **Touch target size** | **Pass, automated.** Every mobile navigation target is at least 44×44 px |
| **Screen-reader announcement of destination changes** | **Was a defect. Now implemented.** A single-page navigation is silent: the DOM swaps and nothing is announced, so a screen-reader user activating "Agenda" heard nothing. `RouteAnnouncer.tsx` adds a polite live region, asserted end-to-end |

### What a human still has to do

Stated plainly rather than marked as passed:

- **Listen to it.** Every result above is a proxy measured by a tool. Whether the announcement is
  *useful*, whether the reading order makes sense, and whether the offline banner interrupts at a
  sensible moment can only be judged by someone using NVDA, JAWS, or VoiceOver.
- **Install it on a physical iPhone.** The constitution requires testing on at least one physical
  iPhone before production, and requires the installed-PWA path to be exercised. Neither has
  happened; nothing in this record covers home-screen installation, the maskable icon as the
  platform crops it, or safe-area behaviour on a real device.
- **Judge the visual design.** SC-005 measures contrast and labelling. It cannot tell whether the
  result reads as an editorial conference workspace or as a generic dashboard — that is FR-011's
  design review, and it needs the human reviewer noted above.
