CREATE TABLE "character_card_prizes" (
	"character_id" uuid NOT NULL,
	"collection" smallint NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_card_prizes_character_id_collection_pk" PRIMARY KEY("character_id","collection"),
	CONSTRAINT "character_card_prizes_collection" CHECK ("character_card_prizes"."collection" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "character_cards" (
	"character_id" uuid NOT NULL,
	"card_id" smallint NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "character_cards_character_id_card_id_pk" PRIMARY KEY("character_id","card_id"),
	CONSTRAINT "character_cards_card" CHECK ("character_cards"."card_id" between 1 and 74),
	CONSTRAINT "character_cards_count" CHECK ("character_cards"."count" > 0)
);
--> statement-breakpoint
ALTER TABLE "character_card_prizes" ADD CONSTRAINT "character_card_prizes_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_cards" ADD CONSTRAINT "character_cards_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;