-- Scroll Dungeons (hand-written; meta snapshot not regenerated): daily attempts and pity per boss.
CREATE TABLE "dungeon_players" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"attempt_day" date,
	"attempts_used" smallint DEFAULT 0 NOT NULL,
	"pity" smallint[] DEFAULT '{0,0,0,0,0,0,0,0,0,0,0}' NOT NULL,
	CONSTRAINT "dungeon_players_values" CHECK ("dungeon_players"."attempts_used" >= 0 and cardinality("dungeon_players"."pity") = 11)
);
--> statement-breakpoint
ALTER TABLE "dungeon_players" ADD CONSTRAINT "dungeon_players_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
