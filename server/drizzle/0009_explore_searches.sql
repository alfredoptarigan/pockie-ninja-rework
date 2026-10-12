CREATE TABLE "explore_searches" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"search_id" uuid NOT NULL,
	"spot_id" integer NOT NULL,
	"scene_id" integer NOT NULL,
	"mode" text NOT NULL,
	"cards" jsonb NOT NULL,
	"revealed" smallint[] DEFAULT '{}' NOT NULL,
	"peek_count" smallint DEFAULT 0 NOT NULL,
	"star" jsonb NOT NULL,
	"star_bonus" jsonb,
	"rewards" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "explore_searches_mode" CHECK ("explore_searches"."mode" in ('normal', 'senior')),
	CONSTRAINT "explore_searches_peek_count" CHECK ("explore_searches"."peek_count" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "explore_searches" ADD CONSTRAINT "explore_searches_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;