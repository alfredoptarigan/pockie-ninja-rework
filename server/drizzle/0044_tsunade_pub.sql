-- Tsunade Pub (hand-written; meta snapshot not regenerated): spins, the wheel and unclaimed prizes.
CREATE TABLE "tsunade_pub" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"free_day" date,
	"free_used" smallint DEFAULT 0 NOT NULL,
	"reward_attempts" integer DEFAULT 0 NOT NULL,
	"paid_attempts" integer DEFAULT 0 NOT NULL,
	"spins" integer DEFAULT 0 NOT NULL,
	"board" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"won" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "tsunade_pub_values" CHECK ("tsunade_pub"."free_used" >= 0 and "tsunade_pub"."reward_attempts" >= 0 and "tsunade_pub"."paid_attempts" >= 0 and "tsunade_pub"."spins" >= 0)
);
--> statement-breakpoint
ALTER TABLE "tsunade_pub" ADD CONSTRAINT "tsunade_pub_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
