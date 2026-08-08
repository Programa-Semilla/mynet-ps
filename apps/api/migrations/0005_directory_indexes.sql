CREATE INDEX "registrations_event_id_idx" ON "registrations" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "attendee_password_resets_attendee_id_idx" ON "attendee_password_resets" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX "attendee_verifications_attendee_id_idx" ON "attendee_verifications" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX "attendee_interests_interest_idx" ON "attendee_interests" USING btree ("interest");
--> statement-breakpoint
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- HAND-ADDED (T018, 006). Everything above this line is `drizzle-kit generate` output; the two
-- statements below are not expressible in the Drizzle schema, so they are written here and the
-- reason is recorded rather than left for a regeneration to silently drop.
--
-- **A regenerating feature must keep this block.** `drizzle-kit` diffs the schema, and neither
-- of these has a schema representation — so a later `generate` will not re-emit them, and
-- deleting this file's tail would remove them from every database created afterwards while
-- leaving existing ones working. That is the failure mode worth stating: it breaks the next
-- clean install, not the machine that made the change.
-- ─────────────────────────────────────────────────────────────────────────────────────────

-- Accent-insensitive directory search (FR-407, research D5). The organisation is
-- `Programa-Semilla` and its conferences are Spanish-language: searching "Munoz" must find
-- "Muñoz", and `lower()` alone does not. A standard contrib extension, present in the
-- PostgreSQL image with no provisioning, enabled in one line.
--
-- `IF NOT EXISTS` because a developer database may already have it, and because this is the
-- statement `verify:clean`'s from-zero run exists to prove works on a database that does not.
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The join-code lookup's index (FR-499) — a 004 review finding.
--
-- `events.join_code` carries a `UNIQUE` constraint, and PostgreSQL indexes it — on the **raw**
-- column. `queries/identity.ts` looks it up as `lower(btrim(e.join_code))`, because a code read
-- off a badge or a slide arrives with arbitrary case and stray whitespace. An expression the
-- index does not contain cannot use it, so every join attempt sequentially scans `events`.
--
-- Drizzle cannot express an expression index, which is why this is here rather than in
-- `schema/events.ts`. `lower()` and `btrim()` are both IMMUTABLE, so the expression is
-- indexable — unlike `unaccent()` above, which is not, and which is exactly why research D5
-- indexes nothing for search.
--
-- NOT UNIQUE: the raw column's constraint already prevents duplicates, and two codes differing
-- only by case would fail this one at seed time for a reason nobody would expect. This index
-- exists to make a lookup fast, not to constrain (SC-415).
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE INDEX "events_join_code_lower_btrim_idx" ON "events" USING btree (lower(btrim("join_code")));
