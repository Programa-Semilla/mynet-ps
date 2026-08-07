CREATE TABLE "active_event_selections" (
	"attendee_id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Added by hand to the generated migration, and it must stay (research.md D11).
--
-- drizzle-kit generates `ADD COLUMN "timezone" text NOT NULL`, which cannot succeed: the
-- events table already holds rows, and there is no value for them. The column therefore
-- arrives with a temporary default so existing rows stay valid.
--
-- **The default is then dropped, in this same migration.** Real IANA zones are back-filled by
-- the seed; what must not survive is the default itself. A column that keeps a silent default
-- is how a wrong day number ships unnoticed — a conference created without a deliberate
-- timezone would quietly claim to be in UTC, and every attendee reading "Day 2 of 4" would be
-- told the wrong thing with no error anywhere to notice.
--
-- 'UTC' rather than a plausible-looking zone on purpose: it is obviously a placeholder, so a
-- row that escaped the back-fill reads as unset rather than as a real venue.
ALTER TABLE "events" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "timezone" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "active_event_selections" ADD CONSTRAINT "active_event_selections_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The composite reference is what makes FR-101 a database guarantee rather than a rule every
-- read path must remember: a selection row cannot name an event the attendee is not registered
-- for, and it disappears by cascade the moment the registration does.
ALTER TABLE "active_event_selections" ADD CONSTRAINT "active_event_selections_registration_fk" FOREIGN KEY ("attendee_id","event_id") REFERENCES "public"."registrations"("attendee_id","event_id") ON DELETE cascade ON UPDATE no action;
