-- Collection, Avatars / Pets / Gear Sets (hand-written; meta snapshot not regenerated).
CREATE TABLE "character_collection" (
	"character_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"entry" text NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_collection_character_id_kind_entry_pk" PRIMARY KEY("character_id","kind","entry"),
	CONSTRAINT "character_collection_kind" CHECK ("character_collection"."kind" in ('outfit', 'pet', 'gear'))
);
--> statement-breakpoint
ALTER TABLE "character_collection" ADD CONSTRAINT "character_collection_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;
