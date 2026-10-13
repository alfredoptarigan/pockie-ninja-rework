CREATE TABLE "character_skill_slots" (
	"character_id" uuid NOT NULL,
	"tree" smallint NOT NULL,
	"slot" smallint NOT NULL,
	"skill_id" integer NOT NULL,
	"use_level" smallint NOT NULL,
	CONSTRAINT "character_skill_slots_character_id_tree_slot_pk" PRIMARY KEY("character_id","tree","slot"),
	CONSTRAINT "character_skill_slots_tree" CHECK ("character_skill_slots"."tree" between 0 and 2),
	CONSTRAINT "character_skill_slots_slot" CHECK ("character_skill_slots"."slot" between 0 and 5),
	CONSTRAINT "character_skill_slots_level" CHECK ("character_skill_slots"."use_level" between 1 and 13)
);
--> statement-breakpoint
ALTER TABLE "character_skill_state" ADD COLUMN "active_tree" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_skill_state" ADD COLUMN "free_resets" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_skill_slots" ADD CONSTRAINT "character_skill_slots_character_id_skill_id_character_skills_character_id_skill_id_fk" FOREIGN KEY ("character_id","skill_id") REFERENCES "public"."character_skills"("character_id","skill_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_skill_slots_skill_key" ON "character_skill_slots" USING btree ("character_id","tree","skill_id");--> statement-breakpoint
ALTER TABLE "character_skill_state" ADD CONSTRAINT "character_skill_state_tree" CHECK ("character_skill_state"."active_tree" between 0 and 2);--> statement-breakpoint
ALTER TABLE "character_skill_state" ADD CONSTRAINT "character_skill_state_resets" CHECK ("character_skill_state"."free_resets" >= 0);