ALTER TABLE "appointments" DROP CONSTRAINT "appointments_status_check";--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_status_check";--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_status_check" CHECK (status IN ('awaiting_payment', 'pending', 'confirmed', 'declined', 'cancelled', 'completed'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_status_check" CHECK (status IN ('pending', 'authorized', 'succeeded', 'failed', 'refunded', 'cancelled'));