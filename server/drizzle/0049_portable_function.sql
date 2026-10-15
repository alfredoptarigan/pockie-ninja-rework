-- Portable Function, Recast: an outfit's recast ISV (hand-written; meta snapshot not regenerated).
CREATE TABLE "outfit_recasts" (
	"item_id" uuid PRIMARY KEY NOT NULL,
	"strength" smallint NOT NULL,
	"agility" smallint NOT NULL,
	"stamina" smallint NOT NULL,
	CONSTRAINT "outfit_recasts_isv" CHECK ("outfit_recasts"."strength" >= 0 and "outfit_recasts"."agility" >= 0 and "outfit_recasts"."stamina" >= 0)
);
--> statement-breakpoint
ALTER TABLE "outfit_recasts" ADD CONSTRAINT "outfit_recasts_item_id_inventory_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;
