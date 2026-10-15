-- Zanpakuto (hand-written; meta snapshot not regenerated): Spirit Coins, daily refines, spirit
-- slots, and the crystals in spirit slots or weapon tab slots.
CREATE TABLE "character_zanpakuto" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"coins" bigint DEFAULT 0 NOT NULL,
	"refine_day" date,
	"refines_used" smallint DEFAULT 0 NOT NULL,
	"unlocked_slots" smallint[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "character_zanpakuto_values" CHECK ("character_zanpakuto"."coins" >= 0 and "character_zanpakuto"."refines_used" >= 0)
);
--> statement-breakpoint
CREATE TABLE "zanpakuto_crystals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"character_id" uuid NOT NULL,
	"item_id" integer NOT NULL,
	"stats" jsonb NOT NULL,
	"bulk_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spirit_slot" smallint,
	"tab" text,
	"tab_slot" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zanpakuto_crystals_values" CHECK ("zanpakuto_crystals"."item_id" between 480001 and 480086 and jsonb_array_length("zanpakuto_crystals"."stats") between 1 and 3),
	CONSTRAINT "zanpakuto_crystals_place" CHECK (("zanpakuto_crystals"."spirit_slot" between 0 and 15 and "zanpakuto_crystals"."tab" is null and "zanpakuto_crystals"."tab_slot" is null) or ("zanpakuto_crystals"."spirit_slot" is null and "zanpakuto_crystals"."tab" in ('sharp', 'blunt', 'fist') and "zanpakuto_crystals"."tab_slot" between 0 and 5))
);
--> statement-breakpoint
ALTER TABLE "character_zanpakuto" ADD CONSTRAINT "character_zanpakuto_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zanpakuto_crystals" ADD CONSTRAINT "zanpakuto_crystals_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "zanpakuto_crystals_spirit_key" ON "zanpakuto_crystals" USING btree ("character_id","spirit_slot");--> statement-breakpoint
CREATE UNIQUE INDEX "zanpakuto_crystals_tab_key" ON "zanpakuto_crystals" USING btree ("character_id","tab","tab_slot");
