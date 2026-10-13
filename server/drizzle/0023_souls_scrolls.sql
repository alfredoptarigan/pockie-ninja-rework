CREATE TABLE "character_bloodline_prayer" (
	"character_id" uuid NOT NULL,
	"limit_id" smallint NOT NULL,
	"attribute" smallint NOT NULL,
	"level" smallint DEFAULT 0 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "character_bloodline_prayer_character_id_limit_id_pk" PRIMARY KEY("character_id","limit_id"),
	CONSTRAINT "character_bloodline_prayer_attribute" CHECK ("character_bloodline_prayer"."attribute" between 1 and 3),
	CONSTRAINT "character_bloodline_prayer_level" CHECK ("character_bloodline_prayer"."level" between 0 and 9 and "character_bloodline_prayer"."progress" >= 0)
);
--> statement-breakpoint
CREATE TABLE "character_souls" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"character_id" uuid NOT NULL,
	"type" smallint NOT NULL,
	"level" smallint DEFAULT 1 NOT NULL,
	"limit_id" smallint,
	"socket" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_souls_type" CHECK ("character_souls"."type" between 1 and 13),
	CONSTRAINT "character_souls_level" CHECK ("character_souls"."level" between 1 and 10),
	CONSTRAINT "character_souls_socket" CHECK (("character_souls"."limit_id" is null) = ("character_souls"."socket" is null) and "character_souls"."socket" between 0 and 4)
);
--> statement-breakpoint
ALTER TABLE "character_skills" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "soul_day" date;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "souls_discovered" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_bloodline_prayer" ADD CONSTRAINT "character_bloodline_prayer_character_id_limit_id_character_bloodlines_character_id_limit_id_fk" FOREIGN KEY ("character_id","limit_id") REFERENCES "public"."character_bloodlines"("character_id","limit_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_souls" ADD CONSTRAINT "character_souls_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_souls" ADD CONSTRAINT "character_souls_character_id_limit_id_character_bloodlines_character_id_limit_id_fk" FOREIGN KEY ("character_id","limit_id") REFERENCES "public"."character_bloodlines"("character_id","limit_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_souls_character_idx" ON "character_souls" USING btree ("character_id","level");--> statement-breakpoint
CREATE UNIQUE INDEX "character_souls_socket_key" ON "character_souls" USING btree ("character_id","limit_id","socket") WHERE "character_souls"."limit_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "character_souls_type_key" ON "character_souls" USING btree ("character_id","limit_id","type") WHERE "character_souls"."limit_id" is not null;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_souls_discovered" CHECK ("characters"."souls_discovered" >= 0);--> statement-breakpoint
-- Soul inventory cap (decision 15, SOUL_INVENTORY_MAX in schema.ts). Hand-written: drizzle-kit
-- does not model triggers. Locks the character row (no key update, so it does not deadlock with
-- the foreign key's key share lock) so two concurrent inserts cannot both pass the count.
CREATE FUNCTION "character_souls_cap"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	PERFORM 1 FROM "characters" WHERE "id" = NEW."character_id" FOR NO KEY UPDATE;
	IF (SELECT count(*) FROM "character_souls" WHERE "character_id" = NEW."character_id") > 250 THEN
		RAISE EXCEPTION 'soul inventory full' USING ERRCODE = 'check_violation', CONSTRAINT = 'character_souls_cap';
	END IF;
	RETURN NULL;
END $$;--> statement-breakpoint
CREATE TRIGGER "character_souls_cap" AFTER INSERT ON "character_souls" FOR EACH ROW EXECUTE FUNCTION "character_souls_cap"();
