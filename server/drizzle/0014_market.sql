CREATE TYPE "public"."item_location" AS ENUM('bag', 'market', 'warehouse');--> statement-breakpoint
CREATE TYPE "public"."market_action" AS ENUM('list', 'buy', 'cancel', 'expire', 'claim_item', 'claim_wallet');--> statement-breakpoint
CREATE TABLE "market_audit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"action" "market_action" NOT NULL,
	"character_id" uuid,
	"counterparty_id" uuid,
	"listing_id" uuid,
	"inventory_item_id" uuid,
	"item_id" text,
	"count" integer,
	"stone" bigint DEFAULT 0 NOT NULL,
	"gold" bigint DEFAULT 0 NOT NULL,
	"tax_stone" bigint DEFAULT 0 NOT NULL,
	"tax_gold" bigint DEFAULT 0 NOT NULL,
	"fee" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_audit_amounts" CHECK ("market_audit"."count" > 0 and "market_audit"."stone" >= 0 and "market_audit"."gold" >= 0 and "market_audit"."tax_stone" >= 0 and "market_audit"."tax_gold" >= 0 and "market_audit"."fee" >= 0)
);
--> statement-breakpoint
CREATE TABLE "market_listings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"seller_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"category" text NOT NULL,
	"price_stone" integer,
	"price_gold" integer,
	"hours" smallint NOT NULL,
	"fee" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "market_listings_prices" CHECK (("market_listings"."price_stone" is not null or "market_listings"."price_gold" is not null) and "market_listings"."price_stone" between 1 and 1000000 and "market_listings"."price_gold" between 1 and 1000000),
	CONSTRAINT "market_listings_hours" CHECK ("market_listings"."hours" in (8, 12, 24)),
	CONSTRAINT "market_listings_fee" CHECK ("market_listings"."fee" >= 0),
	CONSTRAINT "market_listings_expiry" CHECK ("market_listings"."expires_at" > "market_listings"."created_at")
);
--> statement-breakpoint
CREATE TABLE "market_warehouse" (
	"inventory_item_id" uuid PRIMARY KEY NOT NULL,
	"owner_id" uuid NOT NULL,
	"source" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_warehouse_source" CHECK ("market_warehouse"."source" in (0, 1))
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "market_stone" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "market_gold" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "location" "item_location" DEFAULT 'bag' NOT NULL;--> statement-breakpoint
ALTER TABLE "market_audit" ADD CONSTRAINT "market_audit_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_audit" ADD CONSTRAINT "market_audit_counterparty_id_characters_id_fk" FOREIGN KEY ("counterparty_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_seller_id_characters_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_listings" ADD CONSTRAINT "market_listings_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_warehouse" ADD CONSTRAINT "market_warehouse_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_warehouse" ADD CONSTRAINT "market_warehouse_owner_id_characters_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_audit_character_idx" ON "market_audit" USING btree ("character_id","created_at");--> statement-breakpoint
CREATE INDEX "market_audit_counterparty_idx" ON "market_audit" USING btree ("counterparty_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "market_listings_inventory_item_id_key" ON "market_listings" USING btree ("inventory_item_id");--> statement-breakpoint
CREATE INDEX "market_listings_category_idx" ON "market_listings" USING btree ("category","expires_at");--> statement-breakpoint
CREATE INDEX "market_listings_expires_at_idx" ON "market_listings" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "market_listings_seller_id_idx" ON "market_listings" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "market_warehouse_owner_idx" ON "market_warehouse" USING btree ("owner_id","created_at");--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_market_wallet" CHECK ("characters"."market_stone" >= 0 and "characters"."market_gold" >= 0);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_equipped_in_bag" CHECK ("inventory_items"."equipped_slot" is null or "inventory_items"."location" = 'bag');