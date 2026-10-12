CREATE TABLE "character_quests" (
	"character_id" uuid NOT NULL,
	"task_id" integer NOT NULL,
	"state" smallint DEFAULT 0 NOT NULL,
	"progress" jsonb NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "character_quests_character_id_task_id_pk" PRIMARY KEY("character_id","task_id"),
	CONSTRAINT "character_quests_state" CHECK ("character_quests"."state" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_lower" text GENERATED ALWAYS AS (lower(name)) STORED NOT NULL,
	"gender" smallint NOT NULL,
	"nation" smallint NOT NULL,
	"clothing" smallint NOT NULL,
	"avatar_id" integer NOT NULL,
	"level" smallint DEFAULT 1 NOT NULL,
	"exp" bigint DEFAULT 0 NOT NULL,
	"stone" bigint DEFAULT 0 NOT NULL,
	"gold" bigint DEFAULT 0 NOT NULL,
	"gift_coupon" bigint DEFAULT 0 NOT NULL,
	"honor" integer DEFAULT 0 NOT NULL,
	"hp" integer NOT NULL,
	"mp" integer NOT NULL,
	"hp_pouch" integer DEFAULT 50 NOT NULL,
	"mp_pouch" integer DEFAULT 30 NOT NULL,
	"scene_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_name_format" CHECK ("characters"."name" ~ '^[A-Za-z0-9_]{3,12}$'),
	CONSTRAINT "characters_gender" CHECK ("characters"."gender" in (0, 1)),
	CONSTRAINT "characters_nation" CHECK ("characters"."nation" between 0 and 4),
	CONSTRAINT "characters_level" CHECK ("characters"."level" between 1 and 90),
	CONSTRAINT "characters_amounts" CHECK ("characters"."exp" >= 0 and "characters"."stone" >= 0 and "characters"."gold" >= 0 and "characters"."gift_coupon" >= 0 and "characters"."hp" >= 0 and "characters"."mp" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"character_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"bound" boolean DEFAULT false NOT NULL,
	"equipped_slot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_items_count" CHECK ("inventory_items"."count" > 0)
);
--> statement-breakpoint
ALTER TABLE "character_quests" ADD CONSTRAINT "character_quests_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "characters_user_id_key" ON "characters" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "characters_name_lower_key" ON "characters" USING btree ("name_lower");--> statement-breakpoint
CREATE INDEX "characters_scene_id_idx" ON "characters" USING btree ("scene_id");--> statement-breakpoint
CREATE INDEX "inventory_items_character_id_idx" ON "inventory_items" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_items_equipped_slot_key" ON "inventory_items" USING btree ("character_id","equipped_slot") WHERE "inventory_items"."equipped_slot" is not null;