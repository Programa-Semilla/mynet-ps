-- 0012 — Conference content authoring, tranche 2 (014). Constitution v5.3.0 (O1–O4).
--
-- **Numbered 0012, not 0010, and 0010 stays permanently empty** (research R19): this migration
-- redefines admin_audit_entries_action_valid — the same named CHECK 0011 drops and re-adds — so
-- numbering it 0010 would order a dependent migration before its dependency in filename order.
-- The journal entry carries idx 11 / tag 0012_… / snapshot 0011_snapshot.json; meta/README.md
-- section 4 explains the skew and must be read before regenerating anything.
--
-- Locks (R19): every statement here is catalog-only or a small validating scan. The two NOT NULL
-- columns take CONSTANT defaults (PG 11 fast path — no rewrite) and drop them below in the same
-- migration, the shape 0001 established for events.timezone: a column that keeps a silent
-- default is how a wrong value ships unnoticed (FR-1048, FR-1060). DROP NOT NULL on
-- sessions.room_id flips pg_attribute.attnotnull — no scan. The largest scan is the audit-action
-- CHECK re-add, bounded by the 365-day retention sweep.
CREATE TABLE "session_enrolments" (
	"attendee_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_enrolments_attendee_id_session_id_pk" PRIMARY KEY("attendee_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "vocabulary_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_interests_label_unique" UNIQUE("label"),
	CONSTRAINT "vocabulary_interests_label_length" CHECK ((length("label") > 0 AND length("label") <= 60))
);
--> statement-breakpoint
CREATE TABLE "vocabulary_sectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_sectors_label_unique" UNIQUE("label"),
	CONSTRAINT "vocabulary_sectors_label_length" CHECK ((length("label") > 0 AND length("label") <= 120))
);
--> statement-breakpoint
CREATE TABLE "vocabulary_subsectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sector_id" uuid NOT NULL,
	"label" text NOT NULL,
	"retired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vocabulary_subsectors_sector_label_unique" UNIQUE("sector_id","label"),
	CONSTRAINT "vocabulary_subsectors_label_length" CHECK ((length("label") > 0 AND length("label") <= 120))
);
--> statement-breakpoint
ALTER TABLE "admin_audit_entries" DROP CONSTRAINT "admin_audit_entries_action_valid";--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "room_id" DROP NOT NULL;--> statement-breakpoint
-- FR-1060: every session that exists predates the kind and is mandatory. Constant default =
-- catalog-only back-fill; dropped two statements down so the write path must always state one.
ALTER TABLE "sessions" ADD COLUMN "kind" text DEFAULT 'mandatory' NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "capacity" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "enrolment_closing_offset_hours" integer;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "access_link" text;--> statement-breakpoint
-- FR-1048: the back-filled value is 'in-person', NAMED in the spec rather than derived —
-- hybrid would also satisfy every existing programme while being false about all of them, and
-- it would disable FR-1050a's forbidding half for every conference that exists. Default dropped
-- in the same migration, the events.timezone shape.
ALTER TABLE "events" ADD COLUMN "modality" text DEFAULT 'in-person' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "modality" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "format" text;--> statement-breakpoint
ALTER TABLE "attendee_profiles" ADD COLUMN "sector" text;--> statement-breakpoint
ALTER TABLE "attendee_profiles" ADD COLUMN "subsector" text;--> statement-breakpoint
ALTER TABLE "attendee_profiles" ADD COLUMN "productive_activity" text;--> statement-breakpoint
ALTER TABLE "session_enrolments" ADD CONSTRAINT "session_enrolments_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_enrolments" ADD CONSTRAINT "session_enrolments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocabulary_subsectors" ADD CONSTRAINT "vocabulary_subsectors_sector_id_vocabulary_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."vocabulary_sectors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_enrolments_session_id_idx" ON "session_enrolments" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "vocabulary_subsectors_sector_id_idx" ON "vocabulary_subsectors" USING btree ("sector_id");--> statement-breakpoint
ALTER TABLE "admin_audit_entries" ADD CONSTRAINT "admin_audit_entries_action_valid" CHECK ("admin_audit_entries"."action" in ('promote', 'demote', 'resolve_report', 'remove_question', 'deactivate_operator', 'disclose_report_content', 'create_conference', 'update_conference', 'write_catalog', 'delete_catalog', 'write_session', 'cancel_session', 'reinstate_session', 'delete_session', 'write_vocabulary', 'retire_vocabulary_value', 'delete_vocabulary_value'));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_room_or_link" CHECK ("sessions"."room_id" IS NOT NULL OR "sessions"."access_link" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_kind_fields" CHECK ((("kind" = 'mandatory' AND "capacity" IS NULL AND "enrolment_closing_offset_hours" IS NULL) OR ("kind" = 'optional' AND "capacity" IS NOT NULL AND "capacity" >= 1 AND "enrolment_closing_offset_hours" IS NOT NULL AND "enrolment_closing_offset_hours" >= 0)));--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_access_link_https" CHECK (("access_link" IS NULL OR "access_link" LIKE 'https://%'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_modality_valid" CHECK (("modality" IN ('in-person', 'virtual', 'hybrid')));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_format_valid" CHECK (("format" IS NULL OR "format" IN ('seminar', 'hackathon', 'workshop', 'congress', 'networking-breakfast', 'corporate-event')));--> statement-breakpoint
ALTER TABLE "attendee_profiles" ADD CONSTRAINT "attendee_profiles_sector_length" CHECK (("sector" IS NULL OR (length("sector") > 0 AND length("sector") <= 120)));--> statement-breakpoint
ALTER TABLE "attendee_profiles" ADD CONSTRAINT "attendee_profiles_subsector_length" CHECK (("subsector" IS NULL OR (length("subsector") > 0 AND length("subsector") <= 120)));--> statement-breakpoint
ALTER TABLE "attendee_profiles" ADD CONSTRAINT "attendee_profiles_productive_activity_length" CHECK (("productive_activity" IS NULL OR (length("productive_activity") > 0 AND length("productive_activity") <= 200)));