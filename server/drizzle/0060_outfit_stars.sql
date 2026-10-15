-- Reborn outfit stars, pets carried as items and the star skill slots (hand-written; meta snapshot not regenerated).
ALTER TABLE "inventory_items" ADD COLUMN "stars" smallint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_stars" CHECK ("inventory_items"."stars" between 0 and 5);
--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "pet" jsonb;
--> statement-breakpoint
ALTER TABLE "character_skill_slots" DROP CONSTRAINT "character_skill_slots_slot";
--> statement-breakpoint
ALTER TABLE "character_skill_slots" ADD CONSTRAINT "character_skill_slots_slot" CHECK ("character_skill_slots"."slot" between 0 and 7);
