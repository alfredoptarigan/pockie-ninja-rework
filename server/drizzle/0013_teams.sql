CREATE TYPE "public"."team_prompt_kind" AS ENUM('invite', 'apply');--> statement-breakpoint
CREATE TABLE "team_board_entries" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"scene_id" integer NOT NULL,
	"team_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"fight_order" smallint NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"offline_since" timestamp with time zone,
	CONSTRAINT "team_members_fight_order" CHECK ("team_members"."fight_order" between 0 and 2)
);
--> statement-breakpoint
CREATE TABLE "team_prompts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" "team_prompt_kind" NOT NULL,
	"from_id" uuid NOT NULL,
	"to_id" uuid NOT NULL,
	"team_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "team_prompts_not_self" CHECK ("team_prompts"."from_id" <> "team_prompts"."to_id"),
	CONSTRAINT "team_prompts_apply_team" CHECK ("team_prompts"."kind" = 'invite' or "team_prompts"."team_id" is not null),
	CONSTRAINT "team_prompts_expiry" CHECK ("team_prompts"."expires_at" > "team_prompts"."created_at")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"captain_id" uuid NOT NULL,
	"scene_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "toll_gate_runs" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "team_board_entries" ADD CONSTRAINT "team_board_entries_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_board_entries" ADD CONSTRAINT "team_board_entries_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_prompts" ADD CONSTRAINT "team_prompts_from_id_characters_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_prompts" ADD CONSTRAINT "team_prompts_to_id_characters_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_prompts" ADD CONSTRAINT "team_prompts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_captain_id_characters_id_fk" FOREIGN KEY ("captain_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_board_entries_scene_idx" ON "team_board_entries" USING btree ("scene_id","created_at");--> statement-breakpoint
CREATE INDEX "team_board_entries_team_id_idx" ON "team_board_entries" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "team_members_team_id_idx" ON "team_members" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_prompts_pair_key" ON "team_prompts" USING btree ("from_id","to_id");--> statement-breakpoint
CREATE INDEX "team_prompts_to_id_idx" ON "team_prompts" USING btree ("to_id");--> statement-breakpoint
CREATE INDEX "team_prompts_team_id_idx" ON "team_prompts" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teams_captain_id_key" ON "teams" USING btree ("captain_id");--> statement-breakpoint
ALTER TABLE "toll_gate_runs" ADD CONSTRAINT "toll_gate_runs_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "toll_gate_runs_team_id_idx" ON "toll_gate_runs" USING btree ("team_id");