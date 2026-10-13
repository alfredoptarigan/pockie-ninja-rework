CREATE TYPE "public"."arena_log_kind" AS ENUM('attack', 'revenge', 'boss', 'defense', 'duel', 'duel_defense');--> statement-breakpoint
CREATE TYPE "public"."arena_opponent_kind" AS ENUM('npc', 'player', 'referee');--> statement-breakpoint
CREATE TABLE "arena_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"character_id" uuid NOT NULL,
	"kind" "arena_log_kind" NOT NULL,
	"opponent_id" uuid,
	"opponent_npc_id" text,
	"opponent_name" text NOT NULL,
	"result" smallint NOT NULL,
	"score_delta" integer DEFAULT 0 NOT NULL,
	"honor" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"replay" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arena_logs_result" CHECK ("arena_logs"."result" between 0 and 2),
	CONSTRAINT "arena_logs_honor" CHECK ("arena_logs"."honor" >= 0 and "arena_logs"."streak" >= 0)
);
--> statement-breakpoint
CREATE TABLE "arena_opponents" (
	"character_id" uuid NOT NULL,
	"slot" smallint NOT NULL,
	"kind" "arena_opponent_kind" NOT NULL,
	"npc_id" text,
	"opponent_id" uuid,
	"referee_place" smallint,
	"beaten" boolean DEFAULT false NOT NULL,
	CONSTRAINT "arena_opponents_character_id_slot_pk" PRIMARY KEY("character_id","slot"),
	CONSTRAINT "arena_opponents_slot" CHECK ("arena_opponents"."slot" between 0 and 17),
	CONSTRAINT "arena_opponents_kind" CHECK (case "arena_opponents"."kind"
        when 'npc' then "arena_opponents"."npc_id" is not null and "arena_opponents"."opponent_id" is null and "arena_opponents"."referee_place" is null
        when 'player' then "arena_opponents"."npc_id" is null and "arena_opponents"."opponent_id" is not null and "arena_opponents"."referee_place" is null
        else "arena_opponents"."npc_id" is null and "arena_opponents"."opponent_id" is null and "arena_opponents"."referee_place" between -10 and -1 end)
);
--> statement-breakpoint
CREATE TABLE "arena_players" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"tier" smallint DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 93500 NOT NULL,
	"score_at" timestamp with time zone DEFAULT now() NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"fights" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"day" date,
	"tries_used" smallint DEFAULT 0 NOT NULL,
	"tries_bought" smallint DEFAULT 0 NOT NULL,
	"duels_used" smallint DEFAULT 0 NOT NULL,
	"free_refresh_at" timestamp with time zone,
	"snapshot" jsonb,
	"snapshot_at" timestamp with time zone,
	CONSTRAINT "arena_players_tier" CHECK ("arena_players"."tier" between 0 and 21),
	CONSTRAINT "arena_players_counts" CHECK ("arena_players"."score" >= 0 and "arena_players"."streak" >= 0 and "arena_players"."fights" >= 0 and "arena_players"."wins" between 0 and "arena_players"."fights"),
	CONSTRAINT "arena_players_daily" CHECK ("arena_players"."tries_used" >= 0 and "arena_players"."tries_bought" between 0 and 15 and "arena_players"."duels_used" >= 0),
	CONSTRAINT "arena_players_snapshot" CHECK (jsonb_typeof("arena_players"."snapshot") = 'object')
);
--> statement-breakpoint
CREATE TABLE "arena_revenges" (
	"character_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"day" date NOT NULL,
	"used" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "arena_revenges_character_id_target_id_pk" PRIMARY KEY("character_id","target_id"),
	CONSTRAINT "arena_revenges_used" CHECK ("arena_revenges"."used" >= 0)
);
--> statement-breakpoint
ALTER TABLE "arena_logs" ADD CONSTRAINT "arena_logs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_logs" ADD CONSTRAINT "arena_logs_opponent_id_characters_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_opponents" ADD CONSTRAINT "arena_opponents_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_opponents" ADD CONSTRAINT "arena_opponents_opponent_id_characters_id_fk" FOREIGN KEY ("opponent_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_players" ADD CONSTRAINT "arena_players_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_revenges" ADD CONSTRAINT "arena_revenges_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_revenges" ADD CONSTRAINT "arena_revenges_target_id_characters_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arena_logs_character_idx" ON "arena_logs" USING btree ("character_id","created_at");--> statement-breakpoint
CREATE INDEX "arena_logs_opponent_id_idx" ON "arena_logs" USING btree ("opponent_id");--> statement-breakpoint
CREATE INDEX "arena_opponents_opponent_id_idx" ON "arena_opponents" USING btree ("opponent_id");--> statement-breakpoint
CREATE INDEX "arena_players_rank_idx" ON "arena_players" USING btree ("tier" DESC NULLS FIRST,"score" DESC NULLS FIRST,"score_at","character_id");--> statement-breakpoint
CREATE INDEX "arena_players_streak_idx" ON "arena_players" USING btree ("streak" DESC NULLS FIRST,"character_id");--> statement-breakpoint
CREATE INDEX "arena_revenges_target_id_idx" ON "arena_revenges" USING btree ("target_id");