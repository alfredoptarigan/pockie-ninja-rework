CREATE TABLE "character_wing_collection" (
	"character_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_wing_collection_character_id_item_id_pk" PRIMARY KEY("character_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "inventory_items" DROP CONSTRAINT "inventory_items_enhance_level";--> statement-breakpoint
ALTER TABLE "character_wing_collection" ADD CONSTRAINT "character_wing_collection_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_enhance_level" CHECK ("inventory_items"."enhance_level" between 0 and 30);