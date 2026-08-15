CREATE TABLE "admin_audit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" uuid,
	"action" text NOT NULL,
	"subject_attendee_id" uuid,
	"subject_resource_id" uuid,
	"subject_kind" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_audit_entries_action_valid" CHECK ("admin_audit_entries"."action" in ('promote', 'demote', 'resolve_report', 'remove_question', 'deactivate_operator', 'disclose_report_content'))
);
--> statement-breakpoint
CREATE TABLE "operators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text,
	"credential_is_initial" boolean DEFAULT true NOT NULL,
	"deactivated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operators_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "operator_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operator_id" uuid,
	"attendee_id" uuid,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "operator_sessions_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "operator_sessions_exactly_one_subject" CHECK (("operator_sessions"."operator_id" is null) <> ("operator_sessions"."attendee_id" is null))
);
--> statement-breakpoint
CREATE TABLE "organizer_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendee_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "report_resolutions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"resolved_by" uuid NOT NULL,
	"outcome" text NOT NULL,
	"note" text NOT NULL,
	"resolved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_resolutions_report_id_unique" UNIQUE("report_id"),
	CONSTRAINT "report_resolutions_outcome_valid" CHECK ("report_resolutions"."outcome" in ('actioned', 'dismissed')),
	CONSTRAINT "report_resolutions_note_present" CHECK (length(btrim("report_resolutions"."note", E' \t\n\r')) > 0)
);
--> statement-breakpoint
ALTER TABLE "admin_audit_entries" ADD CONSTRAINT "admin_audit_entries_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_sessions" ADD CONSTRAINT "operator_sessions_operator_id_operators_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."operators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operator_sessions" ADD CONSTRAINT "operator_sessions_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizer_assignments" ADD CONSTRAINT "organizer_assignments_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizer_assignments" ADD CONSTRAINT "organizer_assignments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizer_assignments" ADD CONSTRAINT "organizer_assignments_assigned_by_operators_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resolutions" ADD CONSTRAINT "report_resolutions_report_id_abuse_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."abuse_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_resolutions" ADD CONSTRAINT "report_resolutions_resolved_by_operators_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."operators"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_entries_occurred_at_idx" ON "admin_audit_entries" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "admin_audit_entries_subject_attendee_idx" ON "admin_audit_entries" USING btree ("subject_attendee_id");--> statement-breakpoint
CREATE INDEX "admin_audit_entries_operator_idx" ON "admin_audit_entries" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "operator_sessions_operator_id_idx" ON "operator_sessions" USING btree ("operator_id");--> statement-breakpoint
CREATE INDEX "operator_sessions_attendee_id_idx" ON "operator_sessions" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX "operator_sessions_absolute_expires_at_idx" ON "operator_sessions" USING btree ("absolute_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organizer_assignments_live_per_attendee_event" ON "organizer_assignments" USING btree ("attendee_id","event_id") WHERE "organizer_assignments"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "organizer_assignments_attendee_idx" ON "organizer_assignments" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX "organizer_assignments_event_idx" ON "organizer_assignments" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "organizer_assignments_assigned_by_idx" ON "organizer_assignments" USING btree ("assigned_by");--> statement-breakpoint
CREATE INDEX "report_resolutions_resolved_by_idx" ON "report_resolutions" USING btree ("resolved_by");