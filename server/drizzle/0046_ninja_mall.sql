-- Ninja Mall (hand-written; meta snapshot not regenerated): today's purchases of daily-limited items.
CREATE TABLE "character_mall_purchases" (
	"character_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"day" date NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "character_mall_purchases_character_id_item_id_pk" PRIMARY KEY("character_id","item_id"),
	CONSTRAINT "character_mall_purchases_count" CHECK ("character_mall_purchases"."count" > 0)
);
--> statement-breakpoint
ALTER TABLE "character_mall_purchases" ADD CONSTRAINT "character_mall_purchases_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
