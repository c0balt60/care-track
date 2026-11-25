-- Was 0008_rate_limits on fix/backend-security, renumbered after main took 0008 and 0009.
-- IF NOT EXISTS: a database that already ran the old 0008 has this table, and shouldn't fail here.
CREATE TABLE IF NOT EXISTS "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
