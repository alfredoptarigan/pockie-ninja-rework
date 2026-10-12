CREATE TABLE "pub_fight_lineups" (
	"character_id" uuid NOT NULL,
	"scene_id" integer NOT NULL,
	"npc_ids" text[] NOT NULL,
	CONSTRAINT "pub_fight_lineups_character_id_scene_id_pk" PRIMARY KEY("character_id","scene_id"),
	CONSTRAINT "pub_fight_lineups_npc_ids" CHECK (cardinality("pub_fight_lineups"."npc_ids") = 3)
);
--> statement-breakpoint
CREATE TABLE "single_gate" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"best_floor" smallint DEFAULT 0 NOT NULL,
	"current_floor" smallint,
	"pot_exp" bigint DEFAULT 0 NOT NULL,
	"lives" smallint DEFAULT 0 NOT NULL,
	"lives_bought" smallint DEFAULT 0 NOT NULL,
	"runs_day" date,
	"runs_today" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "single_gate_best_floor" CHECK ("single_gate"."best_floor" between 0 and 170),
	CONSTRAINT "single_gate_current_floor" CHECK ("single_gate"."current_floor" between 1 and 170),
	CONSTRAINT "single_gate_amounts" CHECK ("single_gate"."pot_exp" >= 0 and "single_gate"."lives" >= 0 and "single_gate"."lives_bought" between 0 and 999 and "single_gate"."runs_today" >= 0)
);
--> statement-breakpoint
CREATE TABLE "toll_gate_runs" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"gate_id" integer NOT NULL,
	"sub_gate" smallint DEFAULT 0 NOT NULL,
	"point" smallint DEFAULT 0 NOT NULL,
	"passed_point" smallint,
	"lost" boolean DEFAULT false NOT NULL,
	"card_state" smallint DEFAULT 0 NOT NULL,
	"cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"peeks" smallint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "toll_gate_runs_progress" CHECK ("toll_gate_runs"."sub_gate" >= 0 and "toll_gate_runs"."point" >= 0),
	CONSTRAINT "toll_gate_runs_card_state" CHECK ("toll_gate_runs"."card_state" between 0 and 3),
	CONSTRAINT "toll_gate_runs_cards" CHECK (jsonb_typeof("toll_gate_runs"."cards") = 'array' and jsonb_array_length("toll_gate_runs"."cards") <= 5),
	CONSTRAINT "toll_gate_runs_peeks" CHECK ("toll_gate_runs"."peeks" between 0 and 5)
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "toll_gate_day" date;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "toll_gate_entries" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "pub_fight_day" date;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "pub_fights_today" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "pub_fight_pulled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pub_fight_lineups" ADD CONSTRAINT "pub_fight_lineups_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "single_gate" ADD CONSTRAINT "single_gate_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toll_gate_runs" ADD CONSTRAINT "toll_gate_runs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_instance_counts" CHECK ("characters"."toll_gate_entries" >= 0 and "characters"."pub_fights_today" >= 0);