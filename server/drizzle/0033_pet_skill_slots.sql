ALTER TABLE "character_pets" ADD COLUMN "halo_slots" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_pets" ADD COLUMN "help_slots" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_pets" ADD COLUMN "pass_slots" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Unlocked slots were skill rows (negative ids for empty ones); a kind's slots are 0..n-1.
UPDATE "character_pets" SET
	"halo_slots" = coalesce((SELECT max("slot") + 1 FROM "character_pet_skills" s WHERE s."pet_id" = "character_pets"."id" AND s."kind" = 1), 0),
	"help_slots" = coalesce((SELECT max("slot") + 1 FROM "character_pet_skills" s WHERE s."pet_id" = "character_pets"."id" AND s."kind" = 2), 0),
	"pass_slots" = coalesce((SELECT max("slot") + 1 FROM "character_pet_skills" s WHERE s."pet_id" = "character_pets"."id" AND s."kind" = 3), 0);--> statement-breakpoint
DELETE FROM "character_pet_skills" WHERE "skill_id" <= 0;--> statement-breakpoint
ALTER TABLE "character_pet_skills" ADD CONSTRAINT "character_pet_skills_skill" CHECK ("character_pet_skills"."skill_id" > 0);--> statement-breakpoint
ALTER TABLE "character_pets" ADD CONSTRAINT "character_pets_skill_slots" CHECK ("character_pets"."halo_slots" between 0 and 6 and "character_pets"."help_slots" between 0 and 6 and "character_pets"."pass_slots" between 0 and 6);