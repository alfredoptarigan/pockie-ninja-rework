CREATE TABLE "character_explore_spots" (
	"character_id" uuid NOT NULL,
	"spot_id" integer NOT NULL,
	"star_level" smallint NOT NULL,
	"star_progress" smallint NOT NULL,
	CONSTRAINT "character_explore_spots_character_id_spot_id_pk" PRIMARY KEY("character_id","spot_id"),
	CONSTRAINT "character_explore_spots_star" CHECK ("character_explore_spots"."star_level" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "explore_last_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "explore_day" date;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "explore_used" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_explore_spots" ADD CONSTRAINT "character_explore_spots_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;