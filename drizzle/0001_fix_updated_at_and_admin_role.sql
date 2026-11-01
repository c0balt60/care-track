ALTER TABLE "appointments" RENAME COLUMN "Updated_at" TO "updated_at";--> statement-breakpoint
ALTER TABLE "clinics" RENAME COLUMN "Updated_at" TO "updated_at";--> statement-breakpoint
ALTER TABLE "patients" RENAME COLUMN "Updated_at" TO "updated_at";--> statement-breakpoint
ALTER TABLE "payments" RENAME COLUMN "Updated_at" TO "updated_at";--> statement-breakpoint
ALTER TABLE "practitioners" RENAME COLUMN "Updated_at" TO "updated_at";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "Updated_at" TO "updated_at";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_check";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK (role IN ('patient', 'practitioner', 'staff', 'admin'));