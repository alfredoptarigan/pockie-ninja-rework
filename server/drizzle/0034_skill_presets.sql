ALTER TABLE "character_skill_slots" DROP CONSTRAINT "character_skill_slots_tree";--> statement-breakpoint
ALTER TABLE "character_skill_state" DROP CONSTRAINT "character_skill_state_tree";--> statement-breakpoint
ALTER TABLE "character_skill_slots" ADD CONSTRAINT "character_skill_slots_tree" CHECK ("character_skill_slots"."tree" between 0 and 4);--> statement-breakpoint
ALTER TABLE "character_skill_state" ADD CONSTRAINT "character_skill_state_tree" CHECK ("character_skill_state"."active_tree" between 0 and 4);