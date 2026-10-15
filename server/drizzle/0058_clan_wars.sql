-- Clan Training, Protection, Clan Wars, Clan Missions and the clan Logs tab (hand-written; meta snapshot not regenerated).
CREATE TABLE "clan_member_daily" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"training_day" date,
	"training_done" smallint DEFAULT 0 NOT NULL,
	"protection_day" date,
	"protection_fights" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "clan_member_daily_values" CHECK ("clan_member_daily"."training_done" between 0 and 7 and "clan_member_daily"."protection_fights" >= 0)
);
--> statement-breakpoint
CREATE TABLE "clan_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"clan_id" uuid NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clan_war_fighters" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"set" smallint NOT NULL,
	"power" integer NOT NULL,
	"name" text NOT NULL,
	"level" smallint NOT NULL,
	"clothing" smallint NOT NULL,
	"snapshot" jsonb NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clan_war_fighters_values" CHECK ("clan_war_fighters"."set" between 1 and 5 and "clan_war_fighters"."power" >= 0)
);
--> statement-breakpoint
CREATE TABLE "clan_wars" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"day" date NOT NULL,
	"attacker_clan_id" uuid NOT NULL,
	"defender_clan_id" uuid NOT NULL,
	"size" smallint NOT NULL,
	"winner_clan_id" uuid,
	"attacker" jsonb NOT NULL,
	"defender" jsonb NOT NULL,
	"duels" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clan_war_weeks" (
	"week" date PRIMARY KEY NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clan_missions" (
	"clan_id" uuid PRIMARY KEY NOT NULL,
	"unlocked_boss" smallint DEFAULT 0 NOT NULL,
	"free_entries" integer DEFAULT 0 NOT NULL,
	"battles_day" date,
	"battles_used" smallint DEFAULT 0 NOT NULL,
	"boss_index" smallint,
	"start_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"hp" integer,
	"max_hp" integer,
	"paid" jsonb,
	"attacks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_outcome" jsonb,
	CONSTRAINT "clan_missions_values" CHECK ("clan_missions"."unlocked_boss" between 0 and 14 and "clan_missions"."free_entries" >= 0 and "clan_missions"."battles_used" >= 0)
);
--> statement-breakpoint
ALTER TABLE "clan_member_daily" ADD CONSTRAINT "clan_member_daily_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_logs" ADD CONSTRAINT "clan_logs_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_war_fighters" ADD CONSTRAINT "clan_war_fighters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_wars" ADD CONSTRAINT "clan_wars_attacker_clan_id_clans_id_fk" FOREIGN KEY ("attacker_clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_wars" ADD CONSTRAINT "clan_wars_defender_clan_id_clans_id_fk" FOREIGN KEY ("defender_clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clan_missions" ADD CONSTRAINT "clan_missions_clan_id_clans_id_fk" FOREIGN KEY ("clan_id") REFERENCES "public"."clans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clan_logs_clan_created_idx" ON "clan_logs" USING btree ("clan_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "clan_wars_daily_key" ON "clan_wars" USING btree ("attacker_clan_id","defender_clan_id","day");--> statement-breakpoint
CREATE INDEX "clan_wars_defender_idx" ON "clan_wars" USING btree ("defender_clan_id","created_at");--> statement-breakpoint
CREATE INDEX "clan_wars_created_idx" ON "clan_wars" USING btree ("created_at");
