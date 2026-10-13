ALTER TABLE "single_gate" ADD COLUMN "mode" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "single_gate" ADD COLUMN "exp_bonus" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "single_gate" ADD COLUMN "auto_runs_left" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "single_gate" ADD COLUMN "auto_runs_bought" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "single_gate" ADD COLUMN "auto_end_floor" smallint;--> statement-breakpoint
ALTER TABLE "single_gate" ADD COLUMN "auto_reach_floor" smallint;--> statement-breakpoint
ALTER TABLE "single_gate" ADD COLUMN "auto_tick_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "single_gate" ADD COLUMN "floor_50_broadcast" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "single_gate" ADD CONSTRAINT "single_gate_auto" CHECK ("single_gate"."mode" between 0 and 2 and "single_gate"."exp_bonus" >= 0 and "single_gate"."auto_runs_left" between 0 and "single_gate"."auto_runs_bought" and "single_gate"."auto_runs_bought" between 0 and 3 and "single_gate"."auto_end_floor" between 1 and 170 and "single_gate"."auto_reach_floor" between 1 and 170);--> statement-breakpoint
-- Runs started before this migration are manual runs (SGateType 2).
UPDATE "single_gate" SET "mode" = 2 WHERE "current_floor" IS NOT NULL;
