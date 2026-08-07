# Quickstart: Attendee Identity, Personal Data and Profile

**Feature**: 004. Runnable scenarios that prove the feature works end to end. Details live in
[spec.md](./spec.md), [data-model.md](./data-model.md) and
[contracts/identity-api.md](./contracts/identity-api.md); this file is the validation guide.

## Prerequisites

```bash
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev
```

`db:migrate` must always be followed by `db:seed` — 002 recorded why: a migrated but unseeded
database leaves columns at their temporary defaults with nothing to detect it. `0003` adds
`events.join_code` the same way, so an unseeded database has placeholder codes and **no conference
can be joined**.

## Scenario 1 — A person becomes an attendee (US1, P1)

1. Sign out. From the sign-in screen, follow the link to create an account.
2. Enter a new address, a display name, and a password. Watch the confirm control stay **disabled**
   until the password meets the stated policy — the requirement must be visible before submission,
   never a post-submit error.
3. Submit. **Expected**: signed in, landed in the shell, invited to join a conference rather than
   shown an empty one.
4. Enter the seeded join code for the first conference. **Expected**: registered, that conference
   active, Home renders as it does for a seeded attendee.
5. Enter the same code again. **Expected**: told you are already registered. Not an error, no second
   registration.
6. Enter nonsense. **Expected**: one refusal wording, the same one an unrecognised code produces.

**Also verify**: attempt sign-up with a seeded attendee's address. Expected: told the address is
already registered, and offered sign-in and reset. This disclosure is deliberate — see FR-303.

## Scenario 2 — Verification and recovery (US2, P2)

1. As the account from Scenario 1, find the verification link. With no mail provider provisioned
   (register entry 18), read it from the API logs or the development mail sink.
2. **Before** following it, sign in as a *different* attendee registered for the same conference and
   open Discover's directory. **Expected**: the new attendee does **not** appear. Verification gates
   discoverability (FR-359).
3. Follow the verification link. **Expected**: verified, and the link refuses a second use.
4. Repeat step 2. **Expected**: the attendee now appears.
5. Sign out. Request a password reset for an address that does not exist, then for one that does.
   **Expected**: identical responses. This is the one non-disclosure guarantee that survives.
6. Follow the reset link, set a new password. **Expected**: it works, the link refuses reuse, and
   **any other device's session stops working** (FR-330).

**The lockout check that matters** (D2): from a second browser, request resets for a seeded
attendee's address repeatedly. Then, as that attendee, request your own reset. **Expected**: it still
works. An attacker must not be able to deny an attendee their own recovery path.

## Scenario 3 — The profile (US3, P3)

1. Signed in, open your profile. **Expected**: empty, inviting completion — not a broken record.
2. Fill every field. Exceed a length limit. **Expected**: confirmation **disabled** with the reason
   stated.
3. Correct it and save. Reload, and open on a second device. **Expected**: identical.
4. Confirm no control anywhere offers to edit another attendee's profile.

## Scenario 4 — The avatar (US4, P4)

1. Upload a photograph **taken on a phone, with location services on**.
2. **Expected**: it renders as your avatar.
3. **The one that matters**: pull the stored bytes and inspect them with `exiftool` or equivalent.
   **Expected**: no GPS, no camera, no timestamp. Verify the *stored* bytes, not what the browser
   displays — FR-349 is about what is stored and served.
4. Upload something over the size limit, and a non-image with an image extension. **Expected**:
   refused, with the limit stated, before anything is stored.
5. Replace the avatar, then remove it. **Expected**: previous bytes unretrievable; fallback renders.

## Scenario 5 — Discoverability (US5, P5)

With two verified attendees registered for the same conference:

1. Each retrieves the other's profile. **Expected**: returned.
2. Turn the first attendee's discoverability off. **Expected**: the second gets a `404` identical to
   the one an attendee at a different conference produces.
3. The first attendee's own view is unchanged, and states plainly what the setting does.
4. **Cross-conference check**: two attendees with no conference in common. **Expected**: `404`,
   identical again. Try it against the API directly, not through the client.

## Scenario 6 — Export (US6, P6)

1. As an attendee with a profile, an avatar, registrations, saved sessions and notes, request the
   export.
2. **Expected**: one document containing every one of those, avatar bytes included.
3. **Verify absence**: no password hash, no session token, no verification or reset material, and
   nothing belonging to any other attendee.
4. Request an export naming another attendee's identifier. **Expected**: refused.

## Scenario 7 — Deletion (US7, P7) — the one that closes 005's open loop

1. As that same attendee, delete the account. Confirm the dialog states plainly that it cannot be
   undone and that no copy is kept. Check Escape dismisses it and focus returns to the opener.
2. **Expected**: signed out, and a second device's session stops working immediately.
3. **Verify in the database, not in the UI** — this is the whole point:

```sql
-- Every one of these must return 0.
select count(*) from attendees              where id = :id;
select count(*) from attendee_profiles      where attendee_id = :id;
select count(*) from attendee_interests     where attendee_id = :id;
select count(*) from registrations          where attendee_id = :id;
select count(*) from saved_sessions         where attendee_id = :id;   -- 005's cascade, finally reachable
select count(*) from session_notes          where attendee_id = :id;   -- likewise
select count(*) from auth_sessions          where attendee_id = :id;
select count(*) from attendee_credentials   where attendee_id = :id;
select count(*) from stored_objects         where key = :avatarKey;    -- NOT a cascade; deleted explicitly
```

4. **Expected**: no tombstone, no soft-delete marker, no anonymised shell anywhere.
5. Sign up again with the same address. **Expected**: permitted, and the new account is empty.

## Scenario 8 — Isolation (US8, P8)

Against the running API, not the client:

1. Every route this feature adds, called with no session. **Expected**: refused.
2. Every route, called by attendee A carrying attendee B's identifier. **Expected**: refused, and the
   session wins over the supplied identifier.
3. Confirm no refusal distinguishes "exists" from "does not exist".

## Scenario 9 — Offline

1. Go offline. Attempt sign-up, join, profile save, avatar upload, export and deletion.
2. **Expected**: each refused with an explanation distinguishing *offline* from *server fault*;
   displayed state unchanged; typed text and the selected file still present; nothing queued and
   nothing reported as having succeeded.

## Scenario 10 — Retention (FR-381–FR-384)

1. Confirm `sign_in_attempts` rows older than two hours are absent after a sweep, and that the
   window has **not** been lengthened — FR-382 forbids it, and an earlier draft of the spec would
   have made it 90 days.
2. Confirm consumed and expired verification and reset rows do not accumulate.

## Automated equivalents

| Scenario | Where |
|---|---|
| 1, 2, 5, 6, 7, 8 | `apps/api/tests/integration/` against a real database |
| 4 metadata stripping | Integration test asserting stored bytes, not the upload path |
| 7 deletion | Extends `agenda-deletion.test.ts`, which already asserts 005's cascade |
| FR-370, FR-377 guards | Unit tests deriving expected coverage from the schema, so a new table or field fails by existing |
| 3, 9 | Component tests |
| Accessibility | `pnpm test:accessibility` over every surface added |

## Gates

`pnpm lint && pnpm typecheck && pnpm test && pnpm contract:check && pnpm build`

The four database gates run on per-job `postgres:17` service containers and all pass. `db-branch`,
`schema-diff`, `deploy-api` and `deploy-preview` remain red pending provisioning — register entry
17's remaining half, and the honest signal for it rather than something to work around.
