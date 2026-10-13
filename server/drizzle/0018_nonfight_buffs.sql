CREATE TABLE "character_buffs" (
	"character_id" uuid NOT NULL,
	"buff_id" integer NOT NULL,
	"replacement_group" integer NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "character_buffs_character_id_buff_id_pk" PRIMARY KEY("character_id","buff_id"),
	CONSTRAINT "character_buffs_source" CHECK ("character_buffs"."source" in ('food', 'title'))
);
--> statement-breakpoint
CREATE TABLE "character_titles" (
	"character_id" uuid NOT NULL,
	"title_id" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	CONSTRAINT "character_titles_character_id_title_id_pk" PRIMARY KEY("character_id","title_id")
);
--> statement-breakpoint
ALTER TABLE "character_buffs" ADD CONSTRAINT "character_buffs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_titles" ADD CONSTRAINT "character_titles_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_buffs_group_key" ON "character_buffs" USING btree ("character_id","replacement_group");--> statement-breakpoint
CREATE UNIQUE INDEX "character_titles_active_key" ON "character_titles" USING btree ("character_id") WHERE "character_titles"."active" = true;