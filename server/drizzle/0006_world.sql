CREATE TABLE "character_daily_quests" (
	"character_id" uuid NOT NULL,
	"task_id" integer NOT NULL,
	"state" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "character_daily_quests_character_id_task_id_pk" PRIMARY KEY("character_id","task_id"),
	CONSTRAINT "character_daily_quests_state" CHECK ("character_daily_quests"."state" between 0 and 3)
);
--> statement-breakpoint
ALTER TABLE "character_quests" ADD COLUMN "complete_type" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "scenes_entered" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "daily_quest_day" date;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "daily_quests_accepted" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "daily_quests_completed" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "daily_quest_offer_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "daily_score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "daily_score_week" date;--> statement-breakpoint
ALTER TABLE "character_daily_quests" ADD CONSTRAINT "character_daily_quests_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_quests" ADD CONSTRAINT "character_quests_complete_type" CHECK ("character_quests"."complete_type" between 0 and 2);--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_daily_quests" CHECK ("characters"."daily_quests_accepted" >= 0 and "characters"."daily_quests_completed" >= 0 and "characters"."daily_score" >= 0);--> statement-breakpoint
-- Backfill: an existing ninja has at least entered the scene it stands in.
UPDATE "characters" SET "scenes_entered" = ARRAY["scene_id"];
