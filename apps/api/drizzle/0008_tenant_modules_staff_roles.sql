ALTER TABLE "users" ADD COLUMN "staff_role" varchar(20);--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "disabled_modules" jsonb DEFAULT '[]'::jsonb NOT NULL;