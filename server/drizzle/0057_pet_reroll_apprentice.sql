-- Master and Apprentice (hand-written; meta snapshot not regenerated): one row per apprentice.
-- Pet Reroll needs no table (it changes the pet item's item_id).
CREATE TABLE "apprenticeships" (
	"apprentice_id" uuid PRIMARY KEY NOT NULL,
	"master_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "apprenticeships_not_self" CHECK ("apprenticeships"."apprentice_id" <> "apprenticeships"."master_id")
);
--> statement-breakpoint
ALTER TABLE "apprenticeships" ADD CONSTRAINT "apprenticeships_apprentice_id_characters_id_fk" FOREIGN KEY ("apprentice_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apprenticeships" ADD CONSTRAINT "apprenticeships_master_id_characters_id_fk" FOREIGN KEY ("master_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apprenticeships_master_idx" ON "apprenticeships" USING btree ("master_id");
