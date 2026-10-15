-- Konoha Boutique (hand-written; meta snapshot not regenerated): slot machine coins, EXP, free
-- coins, and a waiting Bonus Round or Double Chance.
CREATE TABLE "konoha_boutique" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"exp" integer DEFAULT 0 NOT NULL,
	"last_won" integer DEFAULT 0 NOT NULL,
	"free_day" date,
	"free_claimed" smallint DEFAULT 0 NOT NULL,
	"next_free_at" timestamp with time zone,
	"bonus_bet" integer DEFAULT 0 NOT NULL,
	"bonus_picks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"double_coins" integer DEFAULT 0 NOT NULL,
	"double_number" smallint DEFAULT 0 NOT NULL,
	"double_operator" text DEFAULT 'higher' NOT NULL,
	CONSTRAINT "konoha_boutique_values" CHECK ("konoha_boutique"."coins" >= 0 and "konoha_boutique"."exp" >= 0 and "konoha_boutique"."last_won" >= 0 and "konoha_boutique"."free_claimed" >= 0 and "konoha_boutique"."bonus_bet" >= 0 and "konoha_boutique"."double_coins" >= 0)
);
--> statement-breakpoint
ALTER TABLE "konoha_boutique" ADD CONSTRAINT "konoha_boutique_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
