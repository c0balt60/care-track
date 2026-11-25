ALTER TABLE "practitioners" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
-- Practitioners listed before verification existed stay listed. Only new ones start unverified.
UPDATE "practitioners" SET "verified_at" = now();
