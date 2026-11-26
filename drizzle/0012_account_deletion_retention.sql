ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;--> statement-breakpoint
-- Retention (#78): audit rows are kept 6 years, then the daily cron deletes them
-- (lib/retention.ts). The table stays append-only for everything younger: UPDATE is never
-- allowed, and DELETE only for a row older than 6 years. Keep '6 years' in step with
-- RETENTION.auditLogYears; a test checks they agree.
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF TG_OP = 'DELETE' AND OLD.at < now() - interval '6 years' THEN
		RETURN OLD;
	END IF;
	RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP;
END;
$$;
