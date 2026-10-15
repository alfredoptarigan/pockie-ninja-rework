-- Home farm, clan level progress, Picnic in Garden and Ninja Garden (hand-written; meta snapshot not regenerated).
CREATE TABLE "home_farms" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"plots" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clan_progress" (
	"clan_id" uuid PRIMARY KEY NOT NULL,
	"exp" bigint DEFAULT 0 NOT NULL,
	"picnic_week" date,
	"picnic_points" integer DEFAULT 0 NOT NULL,
	"picnic_last_points" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "clan_progress_values" CHECK ("clan_progress"."exp" >= 0 and "clan_progress"."picnic_points" >= 0 and "clan_progress"."picnic_last_points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "clan_picnic_members" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"clan_id" uuid NOT NULL,
	"week" date,
	"points" integer DEFAULT 0 NOT NULL,
	"claimed_week" date,
	CONSTRAINT "clan_picnic_members_points" CHECK ("clan_picnic_members"."points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "clan_gardens" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"plots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scrolls" smallint DEFAULT 18 NOT NULL,
	"scrolls_week" date,
	"plant_day" date,
	"plants" smallint DEFAULT 0 NOT NULL,
	"pending_level" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "clan_gardens_values" CHECK ("clan_gardens"."scrolls" between 0 and 18 and "clan_gardens"."plants" >= 0 and "clan_gardens"."pending_level" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "home_farms" ADD CONSTRAINT "home_farms_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_progress" ADD CONSTRAINT "clan_progress_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_picnic_members" ADD CONSTRAINT "clan_picnic_members_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_picnic_members" ADD CONSTRAINT "clan_picnic_members_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_gardens" ADD CONSTRAINT "clan_gardens_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clan_picnic_members_clan_id_idx" ON "clan_picnic_members" USING btree ("clan_id");
