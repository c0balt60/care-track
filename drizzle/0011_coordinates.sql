-- Was 0010_coordinates on feat/map, renumbered after main took 0010. Previews already ran the
-- old 0010 on the shared preview database, so IF NOT EXISTS lets this run there without failing.
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "lat" double precision;--> statement-breakpoint
ALTER TABLE "clinics" ADD COLUMN IF NOT EXISTS "lng" double precision;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN IF NOT EXISTS "lat" double precision;--> statement-breakpoint
ALTER TABLE "practitioners" ADD COLUMN IF NOT EXISTS "lng" double precision;
