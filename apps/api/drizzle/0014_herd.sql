CREATE TABLE "animals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "animals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"tag" varchar(50) NOT NULL,
	"name" varchar(100),
	"sex" varchar(10) NOT NULL,
	"type" varchar(10),
	"breed" varchar(100),
	"pen_id" integer,
	"birth_date" date,
	"origin" varchar(10) DEFAULT 'born' NOT NULL,
	"purchase_date" date,
	"mother_id" integer,
	"father_id" integer,
	"weight" numeric(8, 2),
	"herd_status" varchar(10) DEFAULT 'in_herd' NOT NULL,
	"notes" text,
	"image" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "animals_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "pens" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pens_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(30),
	"type" varchar(20),
	"capacity" integer,
	"status" smallint DEFAULT 1 NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "pens_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_pen_id_pens_id_fk" FOREIGN KEY ("pen_id") REFERENCES "public"."pens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_mother_id_animals_id_fk" FOREIGN KEY ("mother_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_father_id_animals_id_fk" FOREIGN KEY ("father_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pens" ADD CONSTRAINT "pens_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pens" ADD CONSTRAINT "pens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pens" ADD CONSTRAINT "pens_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pens" ADD CONSTRAINT "pens_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "animals_tag_uq" ON "animals" USING btree ("tenant_id",lower("tag")) WHERE deleted_at is null;--> statement-breakpoint
CREATE INDEX "animals_pen_idx" ON "animals" USING btree ("pen_id");--> statement-breakpoint
CREATE INDEX "animals_mother_idx" ON "animals" USING btree ("mother_id");--> statement-breakpoint
CREATE INDEX "animals_father_idx" ON "animals" USING btree ("father_id");--> statement-breakpoint
CREATE INDEX "animals_herd_status_idx" ON "animals" USING btree ("tenant_id","herd_status");--> statement-breakpoint
CREATE UNIQUE INDEX "pens_name_uq" ON "pens" USING btree ("tenant_id",lower("name")) WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "pens_code_uq" ON "pens" USING btree ("tenant_id",lower("code")) WHERE deleted_at is null;