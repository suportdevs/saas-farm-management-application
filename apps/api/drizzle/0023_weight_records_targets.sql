CREATE TABLE "weight_records" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "weight_records_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"animal_id" integer NOT NULL,
	"batch_id" integer,
	"weigh_date" date NOT NULL,
	"weight" numeric(8, 2) NOT NULL,
	"weight_unit" varchar(10) DEFAULT 'kg',
	"previous_weight" numeric(8, 2),
	"weight_gain" numeric(8, 2),
	"days_since_last" integer,
	"adg" numeric(6, 3),
	"weigh_type" varchar(50) NOT NULL,
	"body_condition_score" numeric(3, 1),
	"hip_height" numeric(6, 2),
	"scale_id" varchar(50),
	"weigh_method" varchar(50),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "weight_records_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "weight_targets" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "weight_targets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"animal_id" integer,
	"batch_id" integer,
	"target_weight" numeric(8, 2) NOT NULL,
	"target_date" date NOT NULL,
	"target_adg" numeric(6, 3),
	"current_progress" numeric(5, 2),
	"status" varchar(20) DEFAULT 'active',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "weight_targets_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "weight_records" ADD CONSTRAINT "weight_records_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_records" ADD CONSTRAINT "weight_records_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_records" ADD CONSTRAINT "weight_records_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_records" ADD CONSTRAINT "weight_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_records" ADD CONSTRAINT "weight_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_records" ADD CONSTRAINT "weight_records_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_targets" ADD CONSTRAINT "weight_targets_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_targets" ADD CONSTRAINT "weight_targets_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_targets" ADD CONSTRAINT "weight_targets_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_targets" ADD CONSTRAINT "weight_targets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_targets" ADD CONSTRAINT "weight_targets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weight_targets" ADD CONSTRAINT "weight_targets_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "weight_records_animal_idx" ON "weight_records" USING btree ("animal_id","weigh_date");--> statement-breakpoint
CREATE INDEX "weight_records_tenant_date_idx" ON "weight_records" USING btree ("tenant_id","weigh_date");--> statement-breakpoint
CREATE INDEX "weight_records_batch_idx" ON "weight_records" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "weight_targets_animal_idx" ON "weight_targets" USING btree ("animal_id");--> statement-breakpoint
CREATE INDEX "weight_targets_batch_idx" ON "weight_targets" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "weight_targets_tenant_date_idx" ON "weight_targets" USING btree ("tenant_id","target_date");--> statement-breakpoint
-- Copy every weighing from "weights" (same id and key). Old method values map to the new ones;
-- the weigh type of old rows is "routine" and the batch is the animal's batch.
INSERT INTO "weight_records" ("id", "key", "tenant_id", "animal_id", "batch_id", "weigh_date", "weight", "weight_unit", "weigh_type", "weigh_method", "notes", "created_at", "created_by", "updated_at", "updated_by", "deleted_at", "deleted_by")
OVERRIDING SYSTEM VALUE
SELECT w."id", w."key", w."tenant_id", w."animal_id", a."batch_id", w."weighed_on", w."weight", 'kg', 'routine',
  CASE w."method" WHEN 'scale' THEN 'digital_scale' WHEN 'tape' THEN 'tape_measure' WHEN 'estimate' THEN 'visual_estimate' END,
  w."notes", w."created_at", w."created_by", w."updated_at", w."updated_by", w."deleted_at", w."deleted_by"
FROM "weights" w JOIN "animals" a ON a."id" = w."animal_id";
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"weight_records"', 'id'), coalesce((SELECT max("id") FROM "weight_records"), 0) + 1, false);
--> statement-breakpoint
-- Previous weight, gain, days since last and ADG for the copied rows.
UPDATE "weight_records" r SET "previous_weight" = c.prev, "weight_gain" = r."weight" - c.prev, "days_since_last" = r."weigh_date" - c.prev_date,
  "adg" = CASE WHEN r."weigh_date" - c.prev_date > 0 THEN round((r."weight" - c.prev) / (r."weigh_date" - c.prev_date), 3) END
FROM (
  SELECT "id", lag("weight") OVER w AS prev, lag("weigh_date") OVER w AS prev_date
  FROM "weight_records" WHERE "deleted_at" IS NULL
  WINDOW w AS (PARTITION BY "animal_id" ORDER BY "weigh_date", "id")
) c
WHERE r."id" = c."id" AND c.prev IS NOT NULL;
