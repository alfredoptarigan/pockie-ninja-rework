CREATE TABLE "character_bloodlines" (
	"character_id" uuid NOT NULL,
	"limit_id" smallint NOT NULL,
	"amity" integer DEFAULT 0 NOT NULL,
	"unlocked_at" timestamp with time zone,
	"active_slot" smallint,
	CONSTRAINT "character_bloodlines_character_id_limit_id_pk" PRIMARY KEY("character_id","limit_id"),
	CONSTRAINT "character_bloodlines_id" CHECK ("character_bloodlines"."limit_id" between 1 and 44),
	CONSTRAINT "character_bloodlines_amity" CHECK ("character_bloodlines"."amity" >= 0),
	CONSTRAINT "character_bloodlines_active" CHECK ("character_bloodlines"."active_slot" is null or ("character_bloodlines"."active_slot" between 0 and 2 and "character_bloodlines"."unlocked_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "bloodline_day" date;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "bloodline_turn_ins" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_bloodlines" ADD CONSTRAINT "character_bloodlines_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_bloodlines_active_key" ON "character_bloodlines" USING btree ("character_id","active_slot") WHERE "character_bloodlines"."active_slot" is not null;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_bloodline_turn_ins" CHECK ("characters"."bloodline_turn_ins" >= 0);