CREATE TABLE "bankai_crystals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"character_id" uuid NOT NULL,
	"quality" text NOT NULL,
	"stat" text NOT NULL,
	"level" smallint DEFAULT 1 NOT NULL,
	"exp" integer DEFAULT 0 NOT NULL,
	"inventory_slot" smallint,
	"weapon" text,
	"ring_slot" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bankai_crystals_quality" CHECK ("bankai_crystals"."quality" in ('green', 'blue', 'purple', 'gold', 'black', 'orange')),
	CONSTRAINT "bankai_crystals_values" CHECK ("bankai_crystals"."level" between 1 and 20 and "bankai_crystals"."exp" >= 0),
	CONSTRAINT "bankai_crystals_place" CHECK (("bankai_crystals"."inventory_slot" between 0 and 79 and "bankai_crystals"."weapon" is null and "bankai_crystals"."ring_slot" is null) or ("bankai_crystals"."inventory_slot" is null and "bankai_crystals"."weapon" in ('zangetsu', 'senbonzakura', 'iceRing') and "bankai_crystals"."ring_slot" between 0 and 7))
);
--> statement-breakpoint
CREATE TABLE "bankai_weapons" (
	"character_id" uuid NOT NULL,
	"weapon" text NOT NULL,
	"level" smallint DEFAULT 1 NOT NULL,
	"exp" integer DEFAULT 0 NOT NULL,
	"form" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "bankai_weapons_character_id_weapon_pk" PRIMARY KEY("character_id","weapon"),
	CONSTRAINT "bankai_weapons_weapon" CHECK ("bankai_weapons"."weapon" in ('zangetsu', 'senbonzakura', 'iceRing')),
	CONSTRAINT "bankai_weapons_values" CHECK ("bankai_weapons"."level" between 1 and 15 and "bankai_weapons"."exp" >= 0 and "bankai_weapons"."form" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "character_bankai" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"exp_pool" bigint DEFAULT 0 NOT NULL,
	"coins" bigint DEFAULT 0 NOT NULL,
	"active_weapon" text,
	"stat_swaps" text[] DEFAULT '{}' NOT NULL,
	"unlocked_slots" smallint[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "character_bankai_amounts" CHECK ("character_bankai"."exp_pool" >= 0 and "character_bankai"."coins" >= 0),
	CONSTRAINT "character_bankai_active_weapon" CHECK ("character_bankai"."active_weapon" in ('zangetsu', 'senbonzakura', 'iceRing'))
);
--> statement-breakpoint
ALTER TABLE "bankai_crystals" ADD CONSTRAINT "bankai_crystals_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bankai_weapons" ADD CONSTRAINT "bankai_weapons_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_bankai" ADD CONSTRAINT "character_bankai_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bankai_crystals_inventory_key" ON "bankai_crystals" USING btree ("character_id","inventory_slot");--> statement-breakpoint
CREATE UNIQUE INDEX "bankai_crystals_ring_key" ON "bankai_crystals" USING btree ("character_id","weapon","ring_slot");