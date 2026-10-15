-- Player-to-player Trade (hand-written; meta snapshot not regenerated): one row per completed
-- trade with what each side gave.
CREATE TABLE "trade_logs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"initiator_id" uuid,
	"partner_id" uuid,
	"initiator_offer" jsonb NOT NULL,
	"partner_offer" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trade_logs" ADD CONSTRAINT "trade_logs_initiator_id_characters_id_fk" FOREIGN KEY ("initiator_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trade_logs" ADD CONSTRAINT "trade_logs_partner_id_characters_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trade_logs_initiator_idx" ON "trade_logs" USING btree ("initiator_id","created_at");--> statement-breakpoint
CREATE INDEX "trade_logs_partner_idx" ON "trade_logs" USING btree ("partner_id","created_at");
