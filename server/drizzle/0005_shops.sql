CREATE TABLE "character_mystic_purchases" (
	"spawn_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"count" smallint NOT NULL,
	CONSTRAINT "character_mystic_purchases_spawn_id_character_id_item_id_pk" PRIMARY KEY("spawn_id","character_id","item_id"),
	CONSTRAINT "character_mystic_purchases_count" CHECK ("character_mystic_purchases"."count" > 0)
);
--> statement-breakpoint
CREATE TABLE "character_shop_stock" (
	"character_id" uuid NOT NULL,
	"shop_type" smallint NOT NULL,
	"slot" smallint NOT NULL,
	"item_id" text NOT NULL,
	"price_stone" integer,
	"price_gold" integer,
	"price_gift_coupon" integer,
	"identify_count" smallint DEFAULT 0 NOT NULL,
	"appraised" boolean DEFAULT false NOT NULL,
	"props" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bound" boolean NOT NULL,
	CONSTRAINT "character_shop_stock_character_id_shop_type_slot_pk" PRIMARY KEY("character_id","shop_type","slot"),
	CONSTRAINT "character_shop_stock_shop_type" CHECK ("character_shop_stock"."shop_type" between 1 and 3),
	CONSTRAINT "character_shop_stock_slot" CHECK ("character_shop_stock"."slot" between 0 and 99),
	CONSTRAINT "character_shop_stock_prices" CHECK ("character_shop_stock"."price_stone" >= 0 and "character_shop_stock"."price_gold" >= 0 and "character_shop_stock"."price_gift_coupon" >= 0),
	CONSTRAINT "character_shop_stock_identify_count" CHECK ("character_shop_stock"."identify_count" between 0 and 4),
	CONSTRAINT "character_shop_stock_props" CHECK (jsonb_typeof("character_shop_stock"."props") = 'array' and jsonb_array_length("character_shop_stock"."props") <= 4)
);
--> statement-breakpoint
CREATE TABLE "character_shops" (
	"character_id" uuid NOT NULL,
	"shop_type" smallint NOT NULL,
	"last_refresh_at" timestamp with time zone,
	"free_restock_day" date,
	CONSTRAINT "character_shops_character_id_shop_type_pk" PRIMARY KEY("character_id","shop_type"),
	CONSTRAINT "character_shops_shop_type" CHECK ("character_shops"."shop_type" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "mystic_item_sales" (
	"item_id" text PRIMARY KEY NOT NULL,
	"sold" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "mystic_item_sales_sold" CHECK ("mystic_item_sales"."sold" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mystic_spawns" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"scene_id" integer NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"stock" jsonb NOT NULL,
	CONSTRAINT "mystic_spawns_window" CHECK ("mystic_spawns"."ends_at" > "mystic_spawns"."starts_at"),
	CONSTRAINT "mystic_spawns_stock" CHECK (jsonb_typeof("mystic_spawns"."stock") = 'array')
);
--> statement-breakpoint
ALTER TABLE "character_mystic_purchases" ADD CONSTRAINT "character_mystic_purchases_spawn_id_mystic_spawns_id_fk" FOREIGN KEY ("spawn_id") REFERENCES "public"."mystic_spawns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_mystic_purchases" ADD CONSTRAINT "character_mystic_purchases_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_shop_stock" ADD CONSTRAINT "character_shop_stock_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_shops" ADD CONSTRAINT "character_shops_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_mystic_purchases_character_id_idx" ON "character_mystic_purchases" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mystic_spawns_starts_at_key" ON "mystic_spawns" USING btree ("starts_at");