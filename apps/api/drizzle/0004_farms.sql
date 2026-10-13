CREATE TYPE "public"."farm_role" AS ENUM('owner', 'manager', 'veterinarian', 'accountant', 'worker', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."farm_type" AS ENUM('dairy', 'beef', 'mixed', 'breeding', 'calf_rearing');--> statement-breakpoint
CREATE TABLE "billing_events" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"farm_id" uuid NOT NULL,
	"email" varchar(254) NOT NULL,
	"role" "farm_role" DEFAULT 'worker' NOT NULL,
	"title" varchar(80),
	"token_hash" text NOT NULL,
	"invited_by_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farm_invitations_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "farm_invitations_farm_email_unique" UNIQUE("farm_id","email")
);
--> statement-breakpoint
CREATE TABLE "farm_members" (
	"farm_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "farm_role" DEFAULT 'worker' NOT NULL,
	"title" varchar(80),
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farm_members_farm_id_user_id_pk" PRIMARY KEY("farm_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "farms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(60) NOT NULL,
	"type" "farm_type" DEFAULT 'dairy' NOT NULL,
	"description" text,
	"country" varchar(2) NOT NULL,
	"region" varchar(100),
	"city" varchar(100),
	"address" varchar(255),
	"postal_code" varchar(20),
	"timezone" varchar(64) DEFAULT 'UTC' NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"locale" varchar(35) DEFAULT 'en-US' NOT NULL,
	"unit_system" varchar(10) DEFAULT 'metric' NOT NULL,
	"milk_unit" varchar(5) DEFAULT 'L' NOT NULL,
	"weight_unit" varchar(5) DEFAULT 'kg' NOT NULL,
	"area_unit" varchar(5) DEFAULT 'ha' NOT NULL,
	"total_area" numeric(12, 2),
	"herd_size" integer,
	"phone" varchar(40),
	"email" varchar(254),
	"website" varchar(255),
	"registration_number" varchar(100),
	"tax_id" varchar(100),
	"fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
	"goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"plan" varchar(20) DEFAULT 'free' NOT NULL,
	"subscription_status" varchar(30),
	"billing_source" varchar(10),
	"billing_interval" varchar(10),
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" varchar(100),
	"stripe_subscription_id" varchar(100),
	"suspended_at" timestamp with time zone,
	"suspended_reason" varchar(500),
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farms_slug_unique" UNIQUE("slug"),
	CONSTRAINT "farms_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
ALTER TABLE "farm_invitations" ADD CONSTRAINT "farm_invitations_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_invitations" ADD CONSTRAINT "farm_invitations_invited_by_id_users_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_members" ADD CONSTRAINT "farm_members_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_members" ADD CONSTRAINT "farm_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "farm_members_user_idx" ON "farm_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "farms_created_at_idx" ON "farms" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "farms_country_idx" ON "farms" USING btree ("country");