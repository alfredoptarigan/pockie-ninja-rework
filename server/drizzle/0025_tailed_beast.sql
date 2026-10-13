CREATE TABLE "tailed_beast_kages" (
	"week" date NOT NULL,
	"village" smallint NOT NULL,
	"character_id" uuid NOT NULL,
	"claimed_item_id" text,
	"claimed_at" timestamp with time zone,
	CONSTRAINT "tailed_beast_kages_week_village_pk" PRIMARY KEY("week","village"),
	CONSTRAINT "tailed_beast_kages_village" CHECK ("tailed_beast_kages"."village" between 0 and 4),
	CONSTRAINT "tailed_beast_kages_claim" CHECK (("tailed_beast_kages"."claimed_item_id" is null) = ("tailed_beast_kages"."claimed_at" is null))
);
--> statement-breakpoint
CREATE TABLE "tailed_beast_players" (
	"week" date NOT NULL,
	"character_id" uuid NOT NULL,
	"village" smallint NOT NULL,
	"honor" bigint DEFAULT 0 NOT NULL,
	"essence" bigint DEFAULT 0 NOT NULL,
	"fights" integer DEFAULT 0 NOT NULL,
	"ticket_day" date,
	"tickets_used" smallint DEFAULT 0 NOT NULL,
	"boxes_claimed" smallint[] DEFAULT '{}' NOT NULL,
	CONSTRAINT "tailed_beast_players_week_character_id_pk" PRIMARY KEY("week","character_id"),
	CONSTRAINT "tailed_beast_players_village" CHECK ("tailed_beast_players"."village" between 0 and 4),
	CONSTRAINT "tailed_beast_players_amounts" CHECK ("tailed_beast_players"."honor" >= 0 and "tailed_beast_players"."essence" >= 0 and "tailed_beast_players"."fights" >= 0 and "tailed_beast_players"."tickets_used" >= 0),
	CONSTRAINT "tailed_beast_players_boxes" CHECK ("tailed_beast_players"."boxes_claimed" <@ '{5,10,20}'::smallint[])
);
--> statement-breakpoint
CREATE TABLE "tailed_beast_pools" (
	"week" date NOT NULL,
	"beast" smallint NOT NULL,
	"mode" smallint NOT NULL,
	"hp_left" bigint NOT NULL,
	"killed_by" uuid,
	"killed_at" timestamp with time zone,
	CONSTRAINT "tailed_beast_pools_week_beast_mode_pk" PRIMARY KEY("week","beast","mode"),
	CONSTRAINT "tailed_beast_pools_beast" CHECK ("tailed_beast_pools"."beast" between 1 and 9 and "tailed_beast_pools"."mode" between 0 and 2),
	CONSTRAINT "tailed_beast_pools_hp" CHECK ("tailed_beast_pools"."hp_left" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tailed_beast_kages" ADD CONSTRAINT "tailed_beast_kages_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailed_beast_players" ADD CONSTRAINT "tailed_beast_players_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailed_beast_pools" ADD CONSTRAINT "tailed_beast_pools_killed_by_characters_id_fk" FOREIGN KEY ("killed_by") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tailed_beast_kages_character_idx" ON "tailed_beast_kages" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "tailed_beast_players_honor_idx" ON "tailed_beast_players" USING btree ("week","honor" DESC NULLS FIRST,"character_id");--> statement-breakpoint
CREATE INDEX "tailed_beast_players_village_idx" ON "tailed_beast_players" USING btree ("week","village","honor" DESC NULLS FIRST,"character_id");--> statement-breakpoint
CREATE INDEX "tailed_beast_players_character_idx" ON "tailed_beast_players" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "tailed_beast_pools_killed_by_idx" ON "tailed_beast_pools" USING btree ("killed_by");