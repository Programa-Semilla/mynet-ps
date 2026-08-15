CREATE TABLE "attendee_blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendee_blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id"),
	CONSTRAINT "attendee_blocks_not_self" CHECK ("attendee_blocks"."blocker_id" <> "attendee_blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_pairs" (
	"conversation_id" uuid PRIMARY KEY NOT NULL,
	"lower_attendee_id" uuid NOT NULL,
	"higher_attendee_id" uuid NOT NULL,
	CONSTRAINT "conversation_pairs_ordered_pair_key" UNIQUE("lower_attendee_id","higher_attendee_id"),
	CONSTRAINT "conversation_pairs_ordered" CHECK ("conversation_pairs"."lower_attendee_id" < "conversation_pairs"."higher_attendee_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_participants" (
	"conversation_id" uuid NOT NULL,
	"attendee_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_message_id" uuid,
	CONSTRAINT "conversation_participants_conversation_id_attendee_id_pk" PRIMARY KEY("conversation_id","attendee_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_body_length" CHECK (length("messages"."body") BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE TABLE "abuse_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"message_ids" uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "abuse_reports_reason_present" CHECK (length(trim("abuse_reports"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendee_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh_key" text NOT NULL,
	"auth_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_delivered_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "attendee_blocks" ADD CONSTRAINT "attendee_blocks_blocker_id_attendees_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendee_blocks" ADD CONSTRAINT "attendee_blocks_blocked_id_attendees_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_pairs" ADD CONSTRAINT "conversation_pairs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_pairs" ADD CONSTRAINT "conversation_pairs_lower_attendee_id_attendees_id_fk" FOREIGN KEY ("lower_attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_pairs" ADD CONSTRAINT "conversation_pairs_higher_attendee_id_attendees_id_fk" FOREIGN KEY ("higher_attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_last_read_message_id_messages_id_fk" FOREIGN KEY ("last_read_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_attendees_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_reporter_id_attendees_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "abuse_reports" ADD CONSTRAINT "abuse_reports_reported_id_attendees_id_fk" FOREIGN KEY ("reported_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendee_blocks_blocked_id_idx" ON "attendee_blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "conversation_pairs_higher_attendee_id_idx" ON "conversation_pairs" USING btree ("higher_attendee_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_attendee_id_idx" ON "conversation_participants" USING btree ("attendee_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_sent_at_idx" ON "messages" USING btree ("conversation_id","sent_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "messages_author_id_idx" ON "messages" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "abuse_reports_created_at_idx" ON "abuse_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "abuse_reports_reporter_id_idx" ON "abuse_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "abuse_reports_reported_id_idx" ON "abuse_reports" USING btree ("reported_id");--> statement-breakpoint
CREATE INDEX "push_subscriptions_attendee_id_idx" ON "push_subscriptions" USING btree ("attendee_id");