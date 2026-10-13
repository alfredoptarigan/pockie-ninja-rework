CREATE TABLE "character_daily_login" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"completed_days" integer DEFAULT 0 NOT NULL,
	"claim_day" date,
	"bonus_day" date,
	CONSTRAINT "character_daily_login_days" CHECK ("character_daily_login"."completed_days" >= 0)
);
--> statement-breakpoint
CREATE TABLE "character_weekly_rewards" (
	"character_id" uuid NOT NULL,
	"week" date NOT NULL,
	"counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"claimed_milestones" smallint[] DEFAULT '{}' NOT NULL,
	"claimed_weekdays" smallint[] DEFAULT '{}' NOT NULL,
	"bonus_claimed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "character_weekly_rewards_character_id_week_pk" PRIMARY KEY("character_id","week"),
	CONSTRAINT "character_weekly_rewards_counters" CHECK (jsonb_typeof("character_weekly_rewards"."counters") = 'object'),
	CONSTRAINT "character_weekly_rewards_claims" CHECK ("character_weekly_rewards"."claimed_milestones" <@ '{50,100,200}'::smallint[] and "character_weekly_rewards"."claimed_weekdays" <@ '{1,2,3,4,5,6,7}'::smallint[])
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "dice_day" date;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "dice_used" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "dice_bought" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "twenty_min_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "twenty_min_day" date;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "twenty_min_count" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_daily_login" ADD CONSTRAINT "character_daily_login_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_weekly_rewards" ADD CONSTRAINT "character_weekly_rewards_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_daily_events" CHECK ("characters"."dice_used" >= 0 and "characters"."dice_bought" >= 0 and "characters"."twenty_min_count" >= 0);