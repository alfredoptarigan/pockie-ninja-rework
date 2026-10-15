-- Shichibukai and Sannin Test (hand-written; meta snapshot not regenerated): today's expeditions,
-- exchange points, stars and the saved run; the Sannin title rank, Growing Points, today's dice
-- and free changes, and the unclaimed dice.
CREATE TABLE "shichibukai_players" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"attempt_day" date,
	"attempts_used" smallint DEFAULT 0 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"stars" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"run" jsonb,
	CONSTRAINT "shichibukai_players_values" CHECK ("shichibukai_players"."attempts_used" >= 0 and "shichibukai_players"."points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sannin_players" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"rank" smallint DEFAULT 0 NOT NULL,
	"growth_points" integer DEFAULT 0 NOT NULL,
	"dice_day" date,
	"dice_used" smallint DEFAULT 0 NOT NULL,
	"changes_used" smallint DEFAULT 0 NOT NULL,
	"pending" smallint[],
	"total_rolls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "sannin_players_values" CHECK ("sannin_players"."rank" >= 0 and "sannin_players"."growth_points" >= 0 and "sannin_players"."dice_used" >= 0 and "sannin_players"."changes_used" >= 0 and "sannin_players"."total_rolls" >= 0 and ("sannin_players"."pending" is null or cardinality("sannin_players"."pending") = 6))
);
--> statement-breakpoint
ALTER TABLE "shichibukai_players" ADD CONSTRAINT "shichibukai_players_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sannin_players" ADD CONSTRAINT "sannin_players_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
