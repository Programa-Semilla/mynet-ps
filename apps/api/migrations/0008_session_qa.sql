-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- **FAIL FAST RATHER THAN QUEUE.** Hand-added; `drizzle-kit generate` does not emit it, so
-- **re-apply after any regeneration of 0008.**
--
-- This migration takes ACCESS EXCLUSIVE on `abuse_reports` and SHARE ROW EXCLUSIVE on the
-- referenced `attendees` and `sessions`, and the migrator runs every pending migration inside a
-- single transaction while the previous API container is still serving traffic. None of the
-- statements rewrites a table — the added column's default is a constant, so PostgreSQL uses the
-- fast path — but lock *acquisition* is the hazard: an ALTER TABLE that cannot take its lock
-- immediately queues, and every later request for a conflicting lock queues behind it. One
-- unrelated long transaction touching `attendees` would turn a millisecond migration into a
-- write outage of unbounded length.
--
-- Three seconds, then fail. A failed deploy that can be retried is strictly better than a
-- migration holding the sign-up path shut. 004's review recorded this same gap against 0003 as
-- an unclaimed defect; this is the first migration to close it.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
SET lock_timeout = '3s';--> statement-breakpoint
CREATE TABLE "question_votes" (
	"question_id" uuid NOT NULL,
	"attendee_id" uuid NOT NULL,
	"voted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_votes_question_id_attendee_id_pk" PRIMARY KEY("question_id","attendee_id")
);
--> statement-breakpoint
CREATE TABLE "session_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"attendee_id" uuid NOT NULL,
	"body" text NOT NULL,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_questions_body_length" CHECK (length(btrim("session_questions"."body", E' \t\n\r')) > 0 AND length("session_questions"."body") <= 500)
);
--> statement-breakpoint
-- TEMPORARY default, dropped on the next line. `drizzle-kit` generated this as a bare
-- `ADD COLUMN ... NOT NULL`, which fails outright on any database that already holds a report:
-- "column question_ids of relation abuse_reports contains null values". Every existing row
-- predates Q&A and reported no question, so an empty array is the true value for all of them.
--
-- The default is dropped immediately, exactly as 0003 does for `sign_in_attempts.action` and for
-- the same reason: a column that keeps a silent default is how a forgetful caller's insert ships
-- unnoticed, and here that would be a report recording no questions because nobody passed any.
-- `writeReport` supplies the array explicitly.
--
-- **Re-apply this by hand after any regeneration of 0008.** `drizzle-kit generate` emits the bare
-- form every time; it was lost once already when the CHECK below was corrected.
ALTER TABLE "abuse_reports" ADD COLUMN "question_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
ALTER TABLE "abuse_reports" ALTER COLUMN "question_ids" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "question_votes" ADD CONSTRAINT "question_votes_question_id_session_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."session_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_votes" ADD CONSTRAINT "question_votes_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_questions" ADD CONSTRAINT "session_questions_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_votes_attendee_id_idx" ON "question_votes" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX "session_questions_session_id_idx" ON "session_questions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "session_questions_attendee_id_idx" ON "session_questions" USING btree ("attendee_id");