ALTER TABLE "users" ADD COLUMN "language" varchar(5);--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "language" varchar(5) DEFAULT 'en' NOT NULL;