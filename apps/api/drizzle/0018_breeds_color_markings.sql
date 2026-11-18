CREATE TABLE "breeds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "breeds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid,
	"breed_name" varchar(100) NOT NULL,
	"breed_code" varchar(50),
	"breed_type" varchar(50),
	"origin_country" varchar(100),
	"avg_mature_weight" numeric(8, 2),
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "breeds_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "color_markings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "color_markings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"color_name" varchar(50) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "color_markings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "color_markings" ADD CONSTRAINT "color_markings_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "color_markings" ADD CONSTRAINT "color_markings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "color_markings" ADD CONSTRAINT "color_markings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "color_markings" ADD CONSTRAINT "color_markings_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "breeds_breed_name_uq" ON "breeds" USING btree ("tenant_id",lower("breed_name")) WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "color_markings_color_name_uq" ON "color_markings" USING btree ("tenant_id",lower("color_name")) WHERE deleted_at is null;--> statement-breakpoint
-- Built-in breeds shared by every farm (tenant_id null, read-only). Weights: approximate mature cow weight in kg.
INSERT INTO "breeds" ("tenant_id", "breed_name", "breed_code", "breed_type", "origin_country", "avg_mature_weight", "description", "is_system") VALUES
  (NULL, 'Holstein Friesian', 'HF', 'dairy', 'Netherlands', 680, 'High-yielding black-and-white dairy breed', true),
  (NULL, 'Jersey', 'JER', 'dairy', 'Jersey (Channel Islands)', 450, 'Small dairy breed with rich, high-fat milk', true),
  (NULL, 'Guernsey', 'GUE', 'dairy', 'Guernsey (Channel Islands)', 500, 'Dairy breed known for golden, high-butterfat milk', true),
  (NULL, 'Brown Swiss', 'BS', 'dairy', 'Switzerland', 650, 'Hardy, long-lived dairy breed', true),
  (NULL, 'Ayrshire', 'AYR', 'dairy', 'Scotland', 550, 'Red-and-white dairy breed, good forager', true),
  (NULL, 'Sahiwal', 'SAH', 'dairy', 'Pakistan', 400, 'Heat-tolerant zebu dairy breed', true),
  (NULL, 'Red Sindhi', 'RS', 'dairy', 'Pakistan', 340, 'Heat- and tick-tolerant zebu dairy breed', true),
  (NULL, 'Gir', 'GIR', 'dairy', 'India', 385, 'Zebu dairy breed from Gujarat', true),
  (NULL, 'Red Chittagong', 'RCC', 'dual_purpose', 'Bangladesh', 250, 'Small, hardy local breed of Bangladesh', true),
  (NULL, 'Angus', 'ANG', 'beef', 'Scotland', 550, 'Polled beef breed with well-marbled meat', true),
  (NULL, 'Hereford', 'HER', 'beef', 'England', 545, 'Docile red-and-white beef breed', true),
  (NULL, 'Charolais', 'CHA', 'beef', 'France', 750, 'Large, fast-growing white beef breed', true),
  (NULL, 'Brahman', 'BRA', 'beef', 'United States', 500, 'Heat-tolerant zebu beef breed', true),
  (NULL, 'Limousin', 'LIM', 'beef', 'France', 650, 'Lean, heavily muscled beef breed', true),
  (NULL, 'Simmental', 'SIM', 'dual_purpose', 'Switzerland', 700, 'Large breed for milk and beef', true),
  (NULL, 'Shorthorn', 'SH', 'dual_purpose', 'England', 600, 'Milk and beef breed in red, white or roan', true);
