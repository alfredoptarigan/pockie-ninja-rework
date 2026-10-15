-- Akatsuki Invasion and Hashirama vs Madara with its Fortune Wheel (hand-written; meta snapshot not regenerated).
CREATE TABLE "akatsuki_hunters" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"pairs_defeated" smallint DEFAULT 0 NOT NULL,
	"pending_ambush" boolean DEFAULT false NOT NULL,
	"claimed" text[] DEFAULT '{}' NOT NULL,
	"bait_day" date,
	"bait_until" timestamp with time zone,
	CONSTRAINT "akatsuki_hunters_pairs" CHECK ("akatsuki_hunters"."pairs_defeated" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE "hashirama_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"closes_at" timestamp with time zone NOT NULL,
	"settled" boolean DEFAULT false NOT NULL,
	"winner" text,
	CONSTRAINT "hashirama_events_winner" CHECK ("hashirama_events"."winner" in ('madara', 'hashirama', 'tie', 'none'))
);
--> statement-breakpoint
CREATE TABLE "hashirama_players" (
	"event_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"side" text,
	"damage" bigint DEFAULT 0 NOT NULL,
	"last_attack_at" timestamp with time zone,
	"payout" integer DEFAULT 0 NOT NULL,
	"spins" integer DEFAULT 0 NOT NULL,
	"paid_spins" integer DEFAULT 0 NOT NULL,
	"bonus_ready" boolean DEFAULT false NOT NULL,
	"selection" jsonb DEFAULT '[null, null, null]'::jsonb NOT NULL,
	"won" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"spin_token" integer DEFAULT 0 NOT NULL,
	"last_result" jsonb,
	CONSTRAINT "hashirama_players_event_id_character_id_pk" PRIMARY KEY("event_id","character_id"),
	CONSTRAINT "hashirama_players_side" CHECK ("hashirama_players"."side" in ('madara', 'hashirama')),
	CONSTRAINT "hashirama_players_amounts" CHECK ("hashirama_players"."damage" >= 0 and "hashirama_players"."spins" >= 0 and "hashirama_players"."paid_spins" >= 0)
);
--> statement-breakpoint
ALTER TABLE "akatsuki_hunters" ADD CONSTRAINT "akatsuki_hunters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hashirama_players" ADD CONSTRAINT "hashirama_players_event_id_hashirama_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."hashirama_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hashirama_players" ADD CONSTRAINT "hashirama_players_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hashirama_events_closes_at_idx" ON "hashirama_events" USING btree ("closes_at");--> statement-breakpoint
CREATE INDEX "hashirama_players_board_idx" ON "hashirama_players" USING btree ("event_id","side","damage");
