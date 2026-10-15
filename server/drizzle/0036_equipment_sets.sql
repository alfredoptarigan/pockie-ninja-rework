DROP INDEX "inventory_items_equipped_slot_key";--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "active_set" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "equipped_set" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_equipped_set_slot_key" ON "inventory_items" USING btree ("character_id","equipped_set","equipped_slot") WHERE "inventory_items"."equipped_slot" is not null;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_active_set" CHECK ("characters"."active_set" between 1 and 5);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_equipped_set" CHECK ("inventory_items"."equipped_set" between 1 and 5);