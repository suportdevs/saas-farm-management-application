CREATE TABLE "customer_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customer_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "customer_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50),
	"contact_person" varchar(255),
	"phone" varchar(20),
	"email" varchar(255),
	"address" text,
	"city" varchar(100),
	"state" varchar(100),
	"country" varchar(100),
	"tax_id" varchar(50),
	"bank_details" jsonb,
	"is_active" smallint DEFAULT 1 NOT NULL,
	"notes" text,
	"type_id" integer,
	"preferred_breeds" jsonb,
	"preferred_weight_range" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "customers_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "supplier_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "supplier_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "supplier_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "suppliers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"code" varchar(50),
	"contact_person" varchar(255),
	"phone" varchar(20),
	"email" varchar(255),
	"address" text,
	"city" varchar(100),
	"state" varchar(100),
	"country" varchar(100),
	"tax_id" varchar(50),
	"bank_details" jsonb,
	"is_active" smallint DEFAULT 1 NOT NULL,
	"notes" text,
	"type_id" integer,
	"rating" numeric(3, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "suppliers_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "customer_types" ADD CONSTRAINT "customer_types_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_types" ADD CONSTRAINT "customer_types_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_types" ADD CONSTRAINT "customer_types_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_types" ADD CONSTRAINT "customer_types_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_type_id_customer_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."customer_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_types" ADD CONSTRAINT "supplier_types_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_types" ADD CONSTRAINT "supplier_types_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_types" ADD CONSTRAINT "supplier_types_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_types" ADD CONSTRAINT "supplier_types_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_type_id_supplier_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."supplier_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_types_name_uq" ON "customer_types" USING btree ("tenant_id",lower("name")) WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "customers_code_uq" ON "customers" USING btree ("tenant_id",lower("code")) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "customers_type_idx" ON "customers" USING btree ("type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_types_name_uq" ON "supplier_types" USING btree ("tenant_id",lower("name")) WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_code_uq" ON "suppliers" USING btree ("tenant_id",lower("code")) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "suppliers_type_idx" ON "suppliers" USING btree ("type_id");