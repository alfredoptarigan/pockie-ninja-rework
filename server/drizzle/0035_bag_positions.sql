ALTER TABLE "inventory_items" ADD COLUMN "bag_page" smallint;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "bag_slot" smallint;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_bag_page" CHECK ("inventory_items"."bag_page" between 0 and 9);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_bag_slot" CHECK ("inventory_items"."bag_slot" between 0 and 59);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_bag_position" CHECK (("inventory_items"."bag_page" is null and "inventory_items"."bag_slot" is null) or ("inventory_items"."bag_page" is not null and "inventory_items"."bag_slot" is not null and "inventory_items"."location" = 'bag' and "inventory_items"."equipped_slot" is null));