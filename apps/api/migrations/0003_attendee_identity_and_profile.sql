-- 0003 — attendee identity, personal data and profile (feature 004, T012, FR-396).
--
-- Numbered 0003 because the delivery roadmap reserved that number for this phase and 005 left
-- the gap for it. It therefore applies BEFORE 0004 on a fresh database and AFTER it on one that
-- already has 0004 — see `meta/_journal.json`, where this entry sits at index 3 while carrying a
-- later `when` than 0004 so that databases already holding 0004 still receive it. The two
-- migrations are independent: nothing here references saved sessions or notes.
--
-- Two columns are added NOT NULL to tables that already hold rows. Both take a TEMPORARY default
-- so existing rows stay valid, and BOTH DEFAULTS ARE DROPPED IN THIS SAME MIGRATION — the pattern
-- `events.timezone` established in 002, for the reason recorded there: a column that keeps a
-- silent default is how a wrong value ships unnoticed.

CREATE TABLE "attendee_password_resets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendee_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendee_password_resets_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "attendee_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendee_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendee_verifications_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "attendee_interests" (
	"attendee_id" uuid NOT NULL,
	"interest" text NOT NULL,
	CONSTRAINT "attendee_interests_attendee_id_interest_pk" PRIMARY KEY("attendee_id","interest"),
	CONSTRAINT "attendee_interests_length" CHECK ((length("interest") > 0 AND length("interest") <= 60))
);
--> statement-breakpoint
CREATE TABLE "attendee_profiles" (
	"attendee_id" uuid PRIMARY KEY NOT NULL,
	"company" text,
	"role" text,
	"headline" text,
	"networking_intent" text,
	"availability" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendee_profiles_company_length" CHECK (("company" IS NULL OR (length("company") > 0 AND length("company") <= 120))),
	CONSTRAINT "attendee_profiles_role_length" CHECK (("role" IS NULL OR (length("role") > 0 AND length("role") <= 120))),
	CONSTRAINT "attendee_profiles_headline_length" CHECK (("headline" IS NULL OR (length("headline") > 0 AND length("headline") <= 200))),
	CONSTRAINT "attendee_profiles_networking_intent" CHECK (("networking_intent" IS NULL OR "networking_intent" IN ('open_to_meetings', 'open_to_messages', 'not_networking'))),
	CONSTRAINT "attendee_profiles_availability" CHECK (("availability" IS NULL OR "availability" IN ('available', 'busy')))
);
--> statement-breakpoint
CREATE TABLE "stored_objects" (
	"key" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "sign_in_attempts_identifier_idx";--> statement-breakpoint
DROP INDEX "sign_in_attempts_source_idx";--> statement-breakpoint
ALTER TABLE "attendees" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendees" ADD COLUMN "discoverable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "attendees" ADD COLUMN "avatar_object_key" text;--> statement-breakpoint
-- TEMPORARY default, dropped below. It must be VOLATILE rather than a constant: `join_code`
-- carries a UNIQUE constraint, so a single literal would collide the moment a second conference
-- exists. `gen_random_uuid()` forces the per-row evaluation a constant default would skip, so
-- every existing row gets a distinct placeholder. The REAL codes come from the seed — a database
-- migrated but not re-seeded therefore has placeholders and NO CONFERENCE CAN BE JOINED, which
-- is the intended failure rather than an oversight (FR-317, data-model.md).
ALTER TABLE "events" ADD COLUMN "join_code" text DEFAULT gen_random_uuid()::text NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "join_code" DROP DEFAULT;--> statement-breakpoint
-- TEMPORARY default, dropped below. Every existing attempt row predates the other three actions,
-- so 'sign_in' is what they are rather than a guess (FR-307a, research D2).
ALTER TABLE "sign_in_attempts" ADD COLUMN "action" text DEFAULT 'sign_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "sign_in_attempts" ALTER COLUMN "action" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "attendee_password_resets" ADD CONSTRAINT "attendee_password_resets_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendee_verifications" ADD CONSTRAINT "attendee_verifications_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendee_interests" ADD CONSTRAINT "attendee_interests_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendee_profiles" ADD CONSTRAINT "attendee_profiles_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Recreated with `action` LEADING both indexes: every count now filters on it first, and an
-- index led by the hash would still scan four actions' rows to answer a question about one.
CREATE INDEX "sign_in_attempts_identifier_idx" ON "sign_in_attempts" USING btree ("action","identifier_hash","occurred_at");--> statement-breakpoint
CREATE INDEX "sign_in_attempts_source_idx" ON "sign_in_attempts" USING btree ("action","source_hash","occurred_at");--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_join_code_unique" UNIQUE("join_code");
