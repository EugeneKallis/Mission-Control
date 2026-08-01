-- Hide generated guest action macros and make them one-shot.
ALTER TABLE "macros" ADD COLUMN "is_internal" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "macros" ADD COLUMN "is_consumed" BOOLEAN NOT NULL DEFAULT false;
