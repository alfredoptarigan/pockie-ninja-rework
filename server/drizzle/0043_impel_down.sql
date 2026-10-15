-- Impel Down (hand-written; meta snapshot not regenerated): gate, floor, best floors cleared, and
-- today's lost lives and refreshes.
CREATE TABLE "impel_down_players" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"gate" smallint DEFAULT 0 NOT NULL,
	"floor" smallint DEFAULT 0 NOT NULL,
	"max_floor" smallint DEFAULT 0 NOT NULL,
	"lives_day" date,
	"lives_used" smallint DEFAULT 0 NOT NULL,
	"refresh_day" date,
	"refreshes" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "impel_down_players_values" CHECK ("impel_down_players"."gate" between 0 and 5 and "impel_down_players"."floor" between 0 and 25 and "impel_down_players"."max_floor" between 0 and 150 and "impel_down_players"."lives_used" between 0 and 3 and "impel_down_players"."refreshes" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "impel_down_players" ADD CONSTRAINT "impel_down_players_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
