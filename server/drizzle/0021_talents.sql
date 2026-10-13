CREATE TABLE "character_talents" (
	"character_id" uuid NOT NULL,
	"talent_id" smallint NOT NULL,
	"level" smallint DEFAULT 0 NOT NULL,
	"exp" integer DEFAULT 0 NOT NULL,
	"active_slot" smallint,
	CONSTRAINT "character_talents_character_id_talent_id_pk" PRIMARY KEY("character_id","talent_id"),
	CONSTRAINT "character_talents_id" CHECK ("character_talents"."talent_id" between 1 and 8),
	CONSTRAINT "character_talents_level" CHECK ("character_talents"."level" between 0 and 60 and "character_talents"."exp" >= 0),
	CONSTRAINT "character_talents_active" CHECK ("character_talents"."active_slot" is null or ("character_talents"."active_slot" between 0 and 2 and "character_talents"."level" >= 1))
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "talent_day" date;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "talent_attempts_used" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_talents" ADD CONSTRAINT "character_talents_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_talents_active_key" ON "character_talents" USING btree ("character_id","active_slot") WHERE "character_talents"."active_slot" is not null;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_talent_attempts" CHECK ("characters"."talent_attempts_used" >= 0);