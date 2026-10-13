CREATE TYPE "public"."mail_category" AS ENUM('player', 'arena', 'market', 'interaction', 'las_noches', 'other');--> statement-breakpoint
CREATE TYPE "public"."report_kind" AS ENUM('whisper', 'mail', 'chat');--> statement-breakpoint
CREATE TABLE "blocks" (
	"owner_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_owner_id_blocked_id_pk" PRIMARY KEY("owner_id","blocked_id"),
	CONSTRAINT "blocks_not_self" CHECK ("blocks"."owner_id" <> "blocks"."blocked_id")
);
--> statement-breakpoint
CREATE TABLE "friends" (
	"owner_id" uuid NOT NULL,
	"friend_id" uuid NOT NULL,
	"home_friend" boolean DEFAULT false NOT NULL,
	"add_back_pending" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "friends_owner_id_friend_id_pk" PRIMARY KEY("owner_id","friend_id"),
	CONSTRAINT "friends_not_self" CHECK ("friends"."owner_id" <> "friends"."friend_id")
);
--> statement-breakpoint
CREATE TABLE "mails" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"sender_id" uuid,
	"category" "mail_category" NOT NULL,
	"subject" text,
	"body" text,
	"template_key" text,
	"params" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mails_kind" CHECK (case when "mails"."category" = 'player'
        then "mails"."subject" is not null and "mails"."body" is not null and "mails"."template_key" is null and "mails"."params" is null
        else "mails"."sender_id" is null and "mails"."subject" is null and "mails"."body" is null and "mails"."template_key" is not null and "mails"."params" is not null end),
	CONSTRAINT "mails_lengths" CHECK (char_length("mails"."subject") between 1 and 20 and char_length("mails"."body") between 1 and 200 and char_length("mails"."template_key") between 1 and 100),
	CONSTRAINT "mails_params" CHECK (jsonb_typeof("mails"."params") = 'object'),
	CONSTRAINT "mails_expiry" CHECK ("mails"."expires_at" > "mails"."created_at")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_id" uuid,
	"kind" "report_kind" NOT NULL,
	"mail_id" uuid,
	"channel" text,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reports_text" CHECK (char_length("reports"."text") between 1 and 1000)
);
--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_owner_id_characters_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_characters_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_owner_id_characters_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friends" ADD CONSTRAINT "friends_friend_id_characters_id_fk" FOREIGN KEY ("friend_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails" ADD CONSTRAINT "mails_recipient_id_characters_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mails" ADD CONSTRAINT "mails_sender_id_characters_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_characters_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_id_characters_id_fk" FOREIGN KEY ("reported_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_mail_id_mails_id_fk" FOREIGN KEY ("mail_id") REFERENCES "public"."mails"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blocks_blocked_id_idx" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE INDEX "friends_friend_id_idx" ON "friends" USING btree ("friend_id");--> statement-breakpoint
CREATE INDEX "mails_recipient_expires_idx" ON "mails" USING btree ("recipient_id","expires_at");--> statement-breakpoint
CREATE INDEX "mails_recipient_category_idx" ON "mails" USING btree ("recipient_id","category","created_at");--> statement-breakpoint
CREATE INDEX "mails_expires_at_idx" ON "mails" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "mails_sender_created_idx" ON "mails" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_reported_id_idx" ON "reports" USING btree ("reported_id");--> statement-breakpoint
CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_reporter_mail_key" ON "reports" USING btree ("reporter_id","mail_id") WHERE "reports"."mail_id" is not null;