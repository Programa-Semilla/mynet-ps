ALTER TABLE "admin_audit_entries" DROP CONSTRAINT "admin_audit_entries_action_valid";--> statement-breakpoint
ALTER TABLE "admin_audit_entries" ADD COLUMN "actor_attendee_id" uuid;--> statement-breakpoint
ALTER TABLE "saved_sessions" ADD COLUMN "viewed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "logistics_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "last_change_act_id" uuid;--> statement-breakpoint
CREATE INDEX "admin_audit_entries_actor_attendee_idx" ON "admin_audit_entries" USING btree ("actor_attendee_id");--> statement-breakpoint
CREATE INDEX "saved_sessions_session_id_idx" ON "saved_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_event_cancelled_idx" ON "sessions" USING btree ("event_id","cancelled_at");--> statement-breakpoint
ALTER TABLE "admin_audit_entries" ADD CONSTRAINT "admin_audit_entries_action_valid" CHECK ("admin_audit_entries"."action" in ('promote', 'demote', 'resolve_report', 'remove_question', 'deactivate_operator', 'disclose_report_content', 'create_conference', 'update_conference', 'write_catalog', 'delete_catalog', 'write_session', 'cancel_session', 'reinstate_session', 'delete_session'));