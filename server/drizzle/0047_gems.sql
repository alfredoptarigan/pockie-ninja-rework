-- Gems and enchantments (hand-written; meta snapshot not regenerated): gem sockets and the applied
-- Enchanting Stone on each equipment row.
ALTER TABLE "inventory_items" ADD COLUMN "gems" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "enchant_item_id" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_gems" CHECK (jsonb_typeof("inventory_items"."gems") = 'array' and jsonb_array_length("inventory_items"."gems") <= 3);
