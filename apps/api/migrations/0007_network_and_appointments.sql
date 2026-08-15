-- 008 — Network: contacts, exchanged cards, and appointments (migration 0007).
--
-- Three tables, and they do NOT share a scoping rule. `shared_cards` is CROSS-EVENT (standing
-- decision 7; constitution v3.2.0 N1 — a contact is somebody whose card you hold), while
-- `appointments` and `meeting_slots` are PER-EVENT. Each schema file states its own rule and why;
-- neither rule is a default that may be assumed.
--
-- T028 — **NO `RETENTION_SWEEPS` ENTRY IS NEEDED, AND THAT IS A FINDING RATHER THAN AN OMISSION.**
--
-- `RETENTION_SWEEPS` in `src/maintenance.ts` is the only scheduled machinery in this product, and
-- it exists for personal data no cascade can reach — `sign_in_attempts`, which deliberately carries
-- no foreign key. Every attendee row this migration introduces IS cascade-reachable:
--
--   * shared_cards.sharer_id     -> attendees ON DELETE CASCADE
--   * shared_cards.recipient_id  -> attendees ON DELETE CASCADE
--   * appointments.proposer_id   -> attendees ON DELETE CASCADE
--   * appointments.invitee_id    -> attendees ON DELETE CASCADE
--
-- All four references cascade, so `tests/unit/deletion-coverage.test.ts` classifies both tables
-- from the schema with no allow-list entry. `meeting_slots` holds no attendee data at all and IS
-- allow-listed there, with a stated reason (FR-654) — that guard fails a new table by existing
-- until somebody classifies it, which is the point of it.
--
-- Note `shared_cards.event_id` is deliberately ON DELETE NO ACTION while `appointments.event_id`
-- cascades. An event is seeded content that the product never deletes; if one were ever removed by
-- hand, contacts must survive it (the exchange happened) and appointments must not (the meeting was
-- at that conference). The asymmetry is the cross-event/per-event split showing up in the DDL.

CREATE TABLE "appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"slot_id" uuid NOT NULL,
	"proposer_id" uuid NOT NULL,
	"invitee_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"answered_at" timestamp with time zone,
	CONSTRAINT "appointments_status" CHECK (("status" IN ('pending', 'confirmed', 'declined', 'cancelled'))),
	CONSTRAINT "appointments_not_self" CHECK ("appointments"."proposer_id" <> "appointments"."invitee_id"),
	CONSTRAINT "appointments_topic_not_blank" CHECK (btrim("appointments"."topic") <> '')
);
--> statement-breakpoint
CREATE TABLE "meeting_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "meeting_slots_event_starts_at_unique" UNIQUE("event_id","starts_at")
);
--> statement-breakpoint
CREATE TABLE "shared_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sharer_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shared_cards_sharer_recipient_unique" UNIQUE("sharer_id","recipient_id"),
	CONSTRAINT "shared_cards_not_self" CHECK ("shared_cards"."sharer_id" <> "shared_cards"."recipient_id")
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_slot_id_meeting_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."meeting_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_proposer_id_attendees_id_fk" FOREIGN KEY ("proposer_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_invitee_id_attendees_id_fk" FOREIGN KEY ("invitee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_slots" ADD CONSTRAINT "meeting_slots_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_cards" ADD CONSTRAINT "shared_cards_sharer_id_attendees_id_fk" FOREIGN KEY ("sharer_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_cards" ADD CONSTRAINT "shared_cards_recipient_id_attendees_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_cards" ADD CONSTRAINT "shared_cards_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_live_claim_per_proposer_slot" ON "appointments" USING btree ("proposer_id","slot_id") WHERE "appointments"."status" IN ('pending', 'confirmed');--> statement-breakpoint
CREATE INDEX "appointments_event_proposer_idx" ON "appointments" USING btree ("event_id","proposer_id");--> statement-breakpoint
CREATE INDEX "appointments_event_invitee_idx" ON "appointments" USING btree ("event_id","invitee_id");--> statement-breakpoint
CREATE INDEX "meeting_slots_event_starts_at_idx" ON "meeting_slots" USING btree ("event_id","starts_at");--> statement-breakpoint
CREATE INDEX "shared_cards_recipient_id_idx" ON "shared_cards" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX "shared_cards_sharer_id_idx" ON "shared_cards" USING btree ("sharer_id");