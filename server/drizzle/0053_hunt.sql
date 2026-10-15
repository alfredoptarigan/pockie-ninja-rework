-- Hunt, Chain Attack and Adventure with Jiraiya (hand-written; meta snapshot not regenerated).
CREATE TABLE "chain_attacks" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"monster_id" text NOT NULL,
	"scene_id" integer NOT NULL,
	"amount" smallint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	CONSTRAINT "chain_attacks_amount" CHECK ("chain_attacks"."amount" between 1 and 30)
);
--> statement-breakpoint
CREATE TABLE "hunts" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"targets" text[] DEFAULT '{}' NOT NULL,
	"target_scenes" integer[] DEFAULT '{}' NOT NULL,
	"killed" boolean[] DEFAULT '{}' NOT NULL,
	"day" date,
	"hunts_done" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "hunts_done" CHECK ("hunts"."hunts_done" >= 0)
);
--> statement-breakpoint
CREATE TABLE "jiraiya_adventures" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chain_attacks" ADD CONSTRAINT "chain_attacks_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hunts" ADD CONSTRAINT "hunts_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jiraiya_adventures" ADD CONSTRAINT "jiraiya_adventures_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
