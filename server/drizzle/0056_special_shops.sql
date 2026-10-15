-- Special shops (hand-written; meta snapshot not regenerated): the Festival Shop's Festival Tokens and purchases per item.
CREATE TABLE "character_festival_shop" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"tokens" integer DEFAULT 0 NOT NULL,
	"purchases" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "character_festival_shop_tokens" CHECK ("character_festival_shop"."tokens" >= 0)
);
--> statement-breakpoint
ALTER TABLE "character_festival_shop" ADD CONSTRAINT "character_festival_shop_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
