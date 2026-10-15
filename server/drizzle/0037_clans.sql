CREATE TYPE "public"."clan_role" AS ENUM('leader', 'vice', 'officer', 'member');--> statement-breakpoint
CREATE TABLE "clan_applications" (
	"clan_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clan_applications_clan_id_character_id_pk" PRIMARY KEY("clan_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "clan_members" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"clan_id" uuid NOT NULL,
	"role" "clan_role" DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"weekly_points" bigint DEFAULT 0 NOT NULL,
	"week" date,
	"total_points" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "clan_members_points" CHECK ("clan_members"."weekly_points" >= 0 and "clan_members"."total_points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "clans" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"name_lower" text GENERATED ALWAYS AS (lower(name)) STORED NOT NULL,
	"founder_id" uuid NOT NULL,
	"notice" text DEFAULT '' NOT NULL,
	"level" smallint DEFAULT 1 NOT NULL,
	"stone" bigint DEFAULT 0 NOT NULL,
	"gold" bigint DEFAULT 0 NOT NULL,
	"gift_coupon" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disbanded_at" timestamp with time zone,
	CONSTRAINT "clans_name_format" CHECK ("clans"."name" ~ '^[A-Za-z0-9]{4,10}$'),
	CONSTRAINT "clans_notice_length" CHECK (char_length("clans"."notice") <= 120),
	CONSTRAINT "clans_level" CHECK ("clans"."level" >= 1),
	CONSTRAINT "clans_amounts" CHECK ("clans"."stone" >= 0 and "clans"."gold" >= 0 and "clans"."gift_coupon" >= 0)
);
--> statement-breakpoint
ALTER TABLE "clan_applications" ADD CONSTRAINT "clan_applications_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_applications" ADD CONSTRAINT "clan_applications_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_members" ADD CONSTRAINT "clan_members_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clans" ADD CONSTRAINT "clans_founder_id_characters_id_fk" FOREIGN KEY ("founder_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clan_applications_character_id_idx" ON "clan_applications" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "clan_members_clan_id_idx" ON "clan_members" USING btree ("clan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clan_members_leader_key" ON "clan_members" USING btree ("clan_id") WHERE "clan_members"."role" = 'leader';--> statement-breakpoint
CREATE UNIQUE INDEX "clan_members_vice_key" ON "clan_members" USING btree ("clan_id") WHERE "clan_members"."role" = 'vice';--> statement-breakpoint
CREATE UNIQUE INDEX "clans_name_lower_key" ON "clans" USING btree ("name_lower") WHERE "clans"."disbanded_at" is null;--> statement-breakpoint
CREATE INDEX "clans_founder_id_idx" ON "clans" USING btree ("founder_id");