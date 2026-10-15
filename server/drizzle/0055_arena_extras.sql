-- Arena extras: Buy Tickets, Weekly Rewards, Squad Arena and Championship (hand-written; meta snapshot not regenerated).
CREATE TABLE "arena_extras" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"arena_tickets" integer DEFAULT 0 NOT NULL,
	"squad_tickets" integer DEFAULT 0 NOT NULL,
	"team_coins" integer DEFAULT 0 NOT NULL,
	"hero_coins" integer DEFAULT 0 NOT NULL,
	"championship_wins" integer DEFAULT 0 NOT NULL,
	"championship_losses" integer DEFAULT 0 NOT NULL,
	"championship_top3" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "arena_extras_amounts" CHECK ("arena_extras"."arena_tickets" >= 0 and "arena_extras"."squad_tickets" >= 0 and "arena_extras"."team_coins" >= 0 and "arena_extras"."hero_coins" >= 0 and "arena_extras"."championship_wins" >= 0 and "arena_extras"."championship_losses" >= 0 and "arena_extras"."championship_top3" >= 0)
);
--> statement-breakpoint
CREATE TABLE "arena_weekly_points" (
	"kind" text NOT NULL,
	"week" date NOT NULL,
	"character_id" uuid NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "arena_weekly_points_kind_week_character_id_pk" PRIMARY KEY("kind","week","character_id"),
	CONSTRAINT "arena_weekly_points_kind" CHECK ("arena_weekly_points"."kind" in ('arena', 'squad')),
	CONSTRAINT "arena_weekly_points_points" CHECK ("arena_weekly_points"."points" >= 0)
);
--> statement-breakpoint
CREATE TABLE "arena_weekly_hours" (
	"kind" text NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	CONSTRAINT "arena_weekly_hours_kind_hour_pk" PRIMARY KEY("kind","hour")
);
--> statement-breakpoint
CREATE TABLE "arena_weekly_claims" (
	"kind" text NOT NULL,
	"week" date NOT NULL,
	"character_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arena_weekly_claims_kind_week_character_id_pk" PRIMARY KEY("kind","week","character_id")
);
--> statement-breakpoint
CREATE TABLE "squad_players" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"loadouts" smallint[] DEFAULT '{}' NOT NULL,
	"score" integer DEFAULT 93500 NOT NULL,
	"score_at" timestamp with time zone DEFAULT now() NOT NULL,
	"fights" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"day" date,
	"tickets_used" smallint DEFAULT 0 NOT NULL,
	"opponents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "squad_players_counts" CHECK ("squad_players"."score" >= 0 and "squad_players"."wins" between 0 and "squad_players"."fights" and "squad_players"."tickets_used" >= 0 and cardinality("squad_players"."loadouts") in (0, 3))
);
--> statement-breakpoint
CREATE TABLE "championships" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"day" date NOT NULL,
	"registration_ends_at" timestamp with time zone NOT NULL,
	"battling_ends_at" timestamp with time zone NOT NULL,
	"cooldown_ends_at" timestamp with time zone NOT NULL,
	"rounds_settled" smallint DEFAULT 0 NOT NULL,
	"winner_id" uuid,
	"winner_name" text,
	CONSTRAINT "championships_rounds" CHECK ("championships"."rounds_settled" between 0 and 4)
);
--> statement-breakpoint
CREATE TABLE "championship_slots" (
	"championship_id" uuid NOT NULL,
	"slot" smallint NOT NULL,
	"character_id" uuid NOT NULL,
	"name" text NOT NULL,
	"level" smallint NOT NULL,
	"clothing" smallint NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "championship_slots_championship_id_slot_pk" PRIMARY KEY("championship_id","slot"),
	CONSTRAINT "championship_slots_slot" CHECK ("championship_slots"."slot" between 0 and 15)
);
--> statement-breakpoint
CREATE TABLE "championship_matches" (
	"championship_id" uuid NOT NULL,
	"round" smallint NOT NULL,
	"match_index" smallint NOT NULL,
	"slot1" smallint NOT NULL,
	"slot2" smallint NOT NULL,
	"winner_slot" smallint NOT NULL,
	"replay" jsonb,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "championship_matches_championship_id_round_match_index_pk" PRIMARY KEY("championship_id","round","match_index"),
	CONSTRAINT "championship_matches_round" CHECK ("championship_matches"."round" between 1 and 4)
);
--> statement-breakpoint
CREATE TABLE "championship_challenges" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"championship_id" uuid NOT NULL,
	"challenger_id" uuid,
	"challenger_name" text NOT NULL,
	"defender_id" uuid,
	"defender_name" text NOT NULL,
	"won" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arena_extras" ADD CONSTRAINT "arena_extras_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_weekly_points" ADD CONSTRAINT "arena_weekly_points_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_weekly_claims" ADD CONSTRAINT "arena_weekly_claims_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "squad_players" ADD CONSTRAINT "squad_players_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championships" ADD CONSTRAINT "championships_winner_id_characters_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_slots" ADD CONSTRAINT "championship_slots_championship_id_championships_id_fk" FOREIGN KEY ("championship_id") REFERENCES "public"."championships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_slots" ADD CONSTRAINT "championship_slots_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_matches" ADD CONSTRAINT "championship_matches_championship_id_championships_id_fk" FOREIGN KEY ("championship_id") REFERENCES "public"."championships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_challenges" ADD CONSTRAINT "championship_challenges_championship_id_championships_id_fk" FOREIGN KEY ("championship_id") REFERENCES "public"."championships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_challenges" ADD CONSTRAINT "championship_challenges_challenger_id_characters_id_fk" FOREIGN KEY ("challenger_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_challenges" ADD CONSTRAINT "championship_challenges_defender_id_characters_id_fk" FOREIGN KEY ("defender_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arena_weekly_points_rank_idx" ON "arena_weekly_points" USING btree ("kind","week","points" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "arena_weekly_points_character_idx" ON "arena_weekly_points" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "arena_weekly_claims_character_idx" ON "arena_weekly_claims" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "squad_players_rank_idx" ON "squad_players" USING btree ("score" DESC NULLS FIRST,"score_at","character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "championships_day_key" ON "championships" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX "championship_slots_character_key" ON "championship_slots" USING btree ("championship_id","character_id");--> statement-breakpoint
CREATE INDEX "championship_slots_character_idx" ON "championship_slots" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "championship_challenges_championship_idx" ON "championship_challenges" USING btree ("championship_id","created_at");--> statement-breakpoint
CREATE INDEX "championship_challenges_challenger_idx" ON "championship_challenges" USING btree ("challenger_id");--> statement-breakpoint
CREATE INDEX "championship_challenges_defender_idx" ON "championship_challenges" USING btree ("defender_id");
