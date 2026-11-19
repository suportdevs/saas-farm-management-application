ALTER TABLE "batches" ALTER COLUMN "batch_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ALTER COLUMN "arrival_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "batches" DROP COLUMN "code";--> statement-breakpoint
ALTER TABLE "batches" DROP COLUMN "start_date";--> statement-breakpoint
ALTER TABLE "batches" DROP COLUMN "end_date";--> statement-breakpoint
ALTER TABLE "batches" DROP COLUMN "description";