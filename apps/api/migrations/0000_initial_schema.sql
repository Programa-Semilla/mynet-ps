-- Added by hand to the generated migration, and it must stay.
--
-- `attendees.email` is `citext` so that FR-025a's "unique across the entire product" holds
-- against case variation: with plain text, Ada@example.com and ada@example.com are two rows,
-- and one person could hold two accounts. drizzle-kit generates the column type but not the
-- extension it depends on, so without this line the migration fails on a clean database.
--
-- That failure is not hypothetical — it is what FR-038's clean-database verification catches,
-- and it is why migrations are verified against a fresh Neon branch per pull request rather
-- than only against a developer machine where the extension already happens to exist.
CREATE EXTENSION IF NOT EXISTS citext;
--> statement-breakpoint
CREATE TABLE "attendee_credentials" (
	"attendee_id" uuid PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendees_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendee_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_ends_on_after_starts_on" CHECK ("events"."ends_on" >= "events"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendee_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_attendee_event_unique" UNIQUE("attendee_id","event_id")
);
--> statement-breakpoint
CREATE TABLE "sign_in_attempts" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"identifier_hash" text NOT NULL,
	"source_hash" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"succeeded" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendee_credentials" ADD CONSTRAINT "attendee_credentials_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_attendee_id_idx" ON "auth_sessions" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "registrations_attendee_id_idx" ON "registrations" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX "sign_in_attempts_identifier_idx" ON "sign_in_attempts" USING btree ("identifier_hash","occurred_at");--> statement-breakpoint
CREATE INDEX "sign_in_attempts_source_idx" ON "sign_in_attempts" USING btree ("source_hash","occurred_at");