CREATE TABLE "team_stone_matches" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"team_a" uuid[] NOT NULL,
	"team_b" uuid[] NOT NULL,
	"winner" smallint,
	"replay" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_stone_matches_teams" CHECK (cardinality("team_stone_matches"."team_a") = 3 and cardinality("team_stone_matches"."team_b") = 3),
	CONSTRAINT "team_stone_matches_winner" CHECK ("team_stone_matches"."winner" in (0, 1))
);
--> statement-breakpoint
CREATE TABLE "team_stone_players" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"attempts_day" date,
	"attempts_used" smallint DEFAULT 0 NOT NULL,
	"week" date,
	"played_this_week" boolean DEFAULT false NOT NULL,
	"month" date,
	CONSTRAINT "team_stone_players_counts" CHECK ("team_stone_players"."score" >= 0 and "team_stone_players"."attempts_used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "team_stone_queue" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"team_id" uuid,
	"score" integer NOT NULL,
	"power" bigint NOT NULL,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"match_id" uuid,
	CONSTRAINT "team_stone_queue_amounts" CHECK ("team_stone_queue"."score" >= 0 and "team_stone_queue"."power" >= 0)
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "battle_coins" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "team_stone_players" ADD CONSTRAINT "team_stone_players_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_stone_queue" ADD CONSTRAINT "team_stone_queue_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_stone_queue" ADD CONSTRAINT "team_stone_queue_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_stone_queue" ADD CONSTRAINT "team_stone_queue_match_id_team_stone_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."team_stone_matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_stone_matches_created_at_idx" ON "team_stone_matches" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "team_stone_players_rank_idx" ON "team_stone_players" USING btree ("score" DESC NULLS FIRST,"character_id");--> statement-breakpoint
CREATE INDEX "team_stone_queue_waiting_idx" ON "team_stone_queue" USING btree ("queued_at") WHERE "team_stone_queue"."match_id" is null;--> statement-breakpoint
CREATE INDEX "team_stone_queue_team_id_idx" ON "team_stone_queue" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_stone_queue_match_id_idx" ON "team_stone_queue" USING btree ("match_id");--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_battle_coins" CHECK ("characters"."battle_coins" >= 0);