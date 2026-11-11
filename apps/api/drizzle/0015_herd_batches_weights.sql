CREATE TABLE "batches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "batches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(30),
	"purpose" varchar(20),
	"pen_id" integer,
	"start_date" date,
	"end_date" date,
	"status" smallint DEFAULT 1 NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "batches_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "weights" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "weights_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"animal_id" integer NOT NULL,
	"weighed_on" date NOT NULL,
	"weight" numeric(8, 2) NOT NULL,
	"method" varchar(10),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "weights_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "batch_id" integer;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_pen_id_pens_id_fk" FOREIGN KEY ("pen_id") REFERENCES "public"."pens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weights" ADD CONSTRAINT "weights_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weights" ADD CONSTRAINT "weights_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weights" ADD CONSTRAINT "weights_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weights" ADD CONSTRAINT "weights_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weights" ADD CONSTRAINT "weights_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "batches_name_uq" ON "batches" USING btree ("tenant_id",lower("name")) WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "batches_code_uq" ON "batches" USING btree ("tenant_id",lower("code")) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "batches_pen_idx" ON "batches" USING btree ("pen_id");--> statement-breakpoint
CREATE INDEX "weights_animal_idx" ON "weights" USING btree ("animal_id","weighed_on");--> statement-breakpoint
CREATE INDEX "weights_tenant_date_idx" ON "weights" USING btree ("tenant_id","weighed_on");--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "animals_batch_idx" ON "animals" USING btree ("batch_id");