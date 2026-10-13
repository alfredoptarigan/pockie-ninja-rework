CREATE TABLE "character_treasures" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"character_id" uuid NOT NULL,
	"box_id" text NOT NULL,
	"cards" jsonb NOT NULL,
	CONSTRAINT "character_treasures_cards" CHECK (jsonb_typeof("character_treasures"."cards") = 'array' and jsonb_array_length("character_treasures"."cards") = 5)
);
--> statement-breakpoint
CREATE TABLE "treasure_jackpots" (
	"item_id" text PRIMARY KEY NOT NULL,
	"claimed" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "treasure_jackpots_claimed" CHECK ("treasure_jackpots"."claimed" >= 0)
);
--> statement-breakpoint
ALTER TABLE "character_treasures" ADD CONSTRAINT "character_treasures_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "character_treasures_character_key" ON "character_treasures" USING btree ("character_id");
