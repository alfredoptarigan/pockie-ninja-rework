-- Energy (hand-written; meta snapshot not regenerated): the VP state {current, day, refills, items}; null = a ninja that never used energy (starts full).
ALTER TABLE "characters" ADD COLUMN "energy" jsonb;
