CREATE TABLE "character_skill_state" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"learned_through" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "character_skill_state_level" CHECK ("character_skill_state"."learned_through" between 1 and 90)
);
--> statement-breakpoint
CREATE TABLE "character_skills" (
	"character_id" uuid NOT NULL,
	"skill_id" integer NOT NULL,
	"skill_level" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "character_skills_character_id_skill_id_pk" PRIMARY KEY("character_id","skill_id"),
	CONSTRAINT "character_skills_level" CHECK ("character_skills"."skill_level" between 1 and 13)
);
--> statement-breakpoint
ALTER TABLE "character_skill_state" ADD CONSTRAINT "character_skill_state_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_skills" ADD CONSTRAINT "character_skills_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;