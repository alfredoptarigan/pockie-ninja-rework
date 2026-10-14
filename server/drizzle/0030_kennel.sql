CREATE TABLE "character_kennel_purchases" (
	"character_id" uuid NOT NULL,
	"day" date NOT NULL,
	"item_id" text NOT NULL,
	"count" smallint NOT NULL,
	CONSTRAINT "character_kennel_purchases_character_id_day_item_id_pk" PRIMARY KEY("character_id","day","item_id"),
	CONSTRAINT "character_kennel_purchases_count" CHECK ("character_kennel_purchases"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE "character_pet_tracing" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"day" date,
	"attempts_used" smallint DEFAULT 0 NOT NULL,
	"bought_day" date,
	"board" jsonb,
	"finds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "character_pet_tracing_amounts" CHECK ("character_pet_tracing"."attempts_used" >= 0 and "character_pet_tracing"."finds" >= 0),
	CONSTRAINT "character_pet_tracing_board" CHECK (jsonb_typeof("character_pet_tracing"."board") = 'object')
);
--> statement-breakpoint
ALTER TABLE "character_kennel_purchases" ADD CONSTRAINT "character_kennel_purchases_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_pet_tracing" ADD CONSTRAINT "character_pet_tracing_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;