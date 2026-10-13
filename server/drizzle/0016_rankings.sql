CREATE TABLE "toll_gate_weekly" (
	"gate_id" integer NOT NULL,
	"week" date NOT NULL,
	"character_id" uuid NOT NULL,
	"schedule" smallint NOT NULL,
	"reached_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "toll_gate_weekly_gate_id_week_character_id_pk" PRIMARY KEY("gate_id","week","character_id"),
	CONSTRAINT "toll_gate_weekly_schedule" CHECK ("toll_gate_weekly"."schedule" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "toll_gate_weekly_claims" (
	"character_id" uuid NOT NULL,
	"gate_id" integer NOT NULL,
	"week" date NOT NULL,
	"place" smallint NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "toll_gate_weekly_claims_character_id_gate_id_week_pk" PRIMARY KEY("character_id","gate_id","week"),
	CONSTRAINT "toll_gate_weekly_claims_place" CHECK ("toll_gate_weekly_claims"."place" between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "toll_gate_weekly" ADD CONSTRAINT "toll_gate_weekly_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "toll_gate_weekly_claims" ADD CONSTRAINT "toll_gate_weekly_claims_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "toll_gate_weekly_rank_idx" ON "toll_gate_weekly" USING btree ("gate_id","week","schedule" DESC NULLS FIRST,"reached_at","character_id");--> statement-breakpoint
CREATE INDEX "toll_gate_weekly_character_idx" ON "toll_gate_weekly" USING btree ("character_id","week");--> statement-breakpoint
CREATE INDEX "characters_level_rank_idx" ON "characters" USING btree ("level" DESC NULLS FIRST,"exp" DESC NULLS FIRST,"created_at","id");--> statement-breakpoint
CREATE INDEX "characters_stone_rank_idx" ON "characters" USING btree ("stone" DESC NULLS FIRST,"created_at","id");--> statement-breakpoint
CREATE INDEX "single_gate_best_floor_rank_idx" ON "single_gate" USING btree ("best_floor" DESC NULLS FIRST,"character_id");