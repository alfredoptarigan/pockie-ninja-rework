CREATE TABLE "character_pet_skills" (
	"pet_id" uuid NOT NULL,
	"skill_id" integer NOT NULL,
	"level" smallint DEFAULT 1 NOT NULL,
	"learned_order" integer NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"kind" smallint NOT NULL,
	"slot" smallint,
	CONSTRAINT "character_pet_skills_pet_id_skill_id_pk" PRIMARY KEY("pet_id","skill_id"),
	CONSTRAINT "character_pet_skills_kind" CHECK ("character_pet_skills"."kind" between 1 and 3),
	CONSTRAINT "character_pet_skills_slot" CHECK ("character_pet_skills"."slot" between 0 and 5),
	CONSTRAINT "character_pet_skills_amounts" CHECK ("character_pet_skills"."level" >= 1 and "character_pet_skills"."learned_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "character_pets" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"character_id" uuid NOT NULL,
	"species" text NOT NULL,
	"name" text,
	"kennel_slot" smallint NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"level" smallint DEFAULT 1 NOT NULL,
	"exp" integer DEFAULT 0 NOT NULL,
	"growth" smallint NOT NULL,
	"base_attack" integer NOT NULL,
	"base_defence" integer NOT NULL,
	"base_disturb" integer NOT NULL,
	"base_active" integer NOT NULL,
	"base_savvy" integer NOT NULL,
	"appetite" smallint DEFAULT 0 NOT NULL,
	"digest_ends_at" timestamp with time zone,
	"food_slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"adopted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_pets_kennel_slot" CHECK ("character_pets"."kennel_slot" between 0 and 4),
	CONSTRAINT "character_pets_level" CHECK ("character_pets"."level" between 1 and 50),
	CONSTRAINT "character_pets_appetite" CHECK ("character_pets"."appetite" between 0 and 7200),
	CONSTRAINT "character_pets_amounts" CHECK ("character_pets"."exp" >= 0 and "character_pets"."growth" >= 0 and "character_pets"."base_attack" >= 0 and "character_pets"."base_defence" >= 0 and "character_pets"."base_disturb" >= 0 and "character_pets"."base_active" >= 0 and "character_pets"."base_savvy" >= 0),
	CONSTRAINT "character_pets_food_slots" CHECK (jsonb_typeof("character_pets"."food_slots") = 'array' and jsonb_array_length("character_pets"."food_slots") <= 6)
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "pet_slots" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_pet_skills" ADD CONSTRAINT "character_pet_skills_pet_id_character_pets_id_fk" FOREIGN KEY ("pet_id") REFERENCES "public"."character_pets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_pets" ADD CONSTRAINT "character_pets_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_pet_skills_slot_key" ON "character_pet_skills" USING btree ("pet_id","kind","slot") WHERE "character_pet_skills"."slot" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "character_pets_kennel_slot_key" ON "character_pets" USING btree ("character_id","kennel_slot");--> statement-breakpoint
CREATE UNIQUE INDEX "character_pets_active_key" ON "character_pets" USING btree ("character_id") WHERE "character_pets"."active";--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_pet_slots" CHECK ("characters"."pet_slots" between 1 and 5);