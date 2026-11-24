CREATE TABLE "finish_receive_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "finish_receive_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"finish_receive_id" integer NOT NULL,
	"product_size_id" integer NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"rate" numeric(12, 2) NOT NULL,
	"price" numeric(14, 2) NOT NULL,
	"status" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "finish_receive_items_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "finish_receives" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "finish_receives_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_no" varchar(30) NOT NULL,
	"receive_date" date NOT NULL,
	"warehouse_id" integer NOT NULL,
	"receive_by" integer,
	"note" text,
	"status" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "finish_receives_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "designations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "designations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "designations_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "employees_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"employee_code" varchar(30) NOT NULL,
	"name" varchar(150) NOT NULL,
	"designation_id" integer,
	"phone" varchar(20),
	"email" varchar(255),
	"gender" varchar(10),
	"date_of_birth" date,
	"nid_number" varchar(30),
	"joining_date" date,
	"employment_type" varchar(20) DEFAULT 'permanent' NOT NULL,
	"salary" numeric(12, 2),
	"address" text,
	"emergency_contact_name" varchar(150),
	"emergency_contact_phone" varchar(20),
	"status" smallint DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "employees_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "finish_receive_items" ADD CONSTRAINT "finish_receive_items_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finish_receive_items" ADD CONSTRAINT "finish_receive_items_finish_receive_id_finish_receives_id_fk" FOREIGN KEY ("finish_receive_id") REFERENCES "public"."finish_receives"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finish_receive_items" ADD CONSTRAINT "finish_receive_items_product_size_id_product_sizes_id_fk" FOREIGN KEY ("product_size_id") REFERENCES "public"."product_sizes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finish_receive_items" ADD CONSTRAINT "finish_receive_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finish_receive_items" ADD CONSTRAINT "finish_receive_items_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finish_receive_items" ADD CONSTRAINT "finish_receive_items_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finish_receives" ADD CONSTRAINT "finish_receives_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finish_receives" ADD CONSTRAINT "finish_receives_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finish_receives" ADD CONSTRAINT "finish_receives_receive_by_employees_id_fk" FOREIGN KEY ("receive_by") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finish_receives" ADD CONSTRAINT "finish_receives_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finish_receives" ADD CONSTRAINT "finish_receives_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finish_receives" ADD CONSTRAINT "finish_receives_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designations" ADD CONSTRAINT "designations_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designations" ADD CONSTRAINT "designations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designations" ADD CONSTRAINT "designations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "designations" ADD CONSTRAINT "designations_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_designation_id_designations_id_fk" FOREIGN KEY ("designation_id") REFERENCES "public"."designations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "finish_receive_items_receive_idx" ON "finish_receive_items" USING btree ("finish_receive_id");--> statement-breakpoint
CREATE INDEX "finish_receive_items_product_size_idx" ON "finish_receive_items" USING btree ("product_size_id");--> statement-breakpoint
CREATE UNIQUE INDEX "finish_receives_order_no_uq" ON "finish_receives" USING btree ("tenant_id",lower("order_no")) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "finish_receives_tenant_date_idx" ON "finish_receives" USING btree ("tenant_id","receive_date");--> statement-breakpoint
CREATE INDEX "finish_receives_warehouse_idx" ON "finish_receives" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "finish_receives_receive_by_idx" ON "finish_receives" USING btree ("receive_by");--> statement-breakpoint
CREATE UNIQUE INDEX "designations_name_uq" ON "designations" USING btree ("tenant_id",lower("name")) WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "employees_employee_code_uq" ON "employees" USING btree ("tenant_id",lower("employee_code")) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "employees_designation_idx" ON "employees" USING btree ("designation_id");--> statement-breakpoint
CREATE INDEX "employees_tenant_status_idx" ON "employees" USING btree ("tenant_id","status");