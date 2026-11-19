DROP INDEX "batches_name_uq";--> statement-breakpoint
DROP INDEX "batches_code_uq";--> statement-breakpoint
ALTER TABLE "batches" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
-- status was 1 = active / 0 = inactive; now active · completed · cancelled.
ALTER TABLE "batches" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "batches" ALTER COLUMN "status" SET DATA TYPE varchar(20) USING (CASE WHEN "status" = 1 THEN 'active' ELSE 'completed' END);--> statement-breakpoint
ALTER TABLE "batches" ALTER COLUMN "status" SET DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "batch_number" varchar(50);--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "batch_name" varchar(255);--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "arrival_date" date;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "expected_exit_date" date;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "actual_exit_date" date;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "supplier_id" integer;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "target_weight" numeric(8, 2);--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "target_weight_unit" varchar(10) DEFAULT 'kg' NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "total_purchase_cost" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "total_sale_revenue" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "batches" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batches_batch_number_uq" ON "batches" USING btree ("tenant_id",lower("batch_number")) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "batches_supplier_idx" ON "batches" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "batches_tenant_arrival_idx" ON "batches" USING btree ("tenant_id","arrival_date");--> statement-breakpoint
-- Copy the old columns into the new ones (the old ones are dropped by the next migration).
UPDATE "batches" SET
  "batch_number" = COALESCE(NULLIF("code", ''), 'BATCH-' || "id"),
  "batch_name" = "name",
  "arrival_date" = COALESCE("start_date", ("created_at")::date),
  "expected_exit_date" = "end_date",
  "notes" = "description";