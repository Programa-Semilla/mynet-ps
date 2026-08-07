CREATE TABLE "saved_sessions" (
	"attendee_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_sessions_attendee_id_session_id_pk" PRIMARY KEY("attendee_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "session_notes" (
	"attendee_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_notes_attendee_id_session_id_pk" PRIMARY KEY("attendee_id","session_id"),
	CONSTRAINT "session_notes_body_length" CHECK (length("session_notes"."body") > 0 AND length("session_notes"."body") <= 10000)
);
--> statement-breakpoint
ALTER TABLE "saved_sessions" ADD CONSTRAINT "saved_sessions_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_sessions" ADD CONSTRAINT "saved_sessions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_attendee_id_attendees_id_fk" FOREIGN KEY ("attendee_id") REFERENCES "public"."attendees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_notes" ADD CONSTRAINT "session_notes_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;