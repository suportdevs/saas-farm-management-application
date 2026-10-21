CREATE TABLE "manual_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"farm_id" uuid NOT NULL,
	"number" varchar(30) NOT NULL,
	"description" varchar(255) NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) NOT NULL,
	"issued_at" date NOT NULL,
	"due_at" date NOT NULL,
	"plan_id" varchar(20),
	"period_end" date,
	"notes" text,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "manual_invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "manual_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"method" varchar(20) NOT NULL,
	"reference" varchar(120),
	"paid_at" date NOT NULL,
	"notes" text,
	"recorded_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farm_subscriptions" ADD COLUMN "limit_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "farm_subscriptions" ADD COLUMN "capability_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "farm_subscriptions" ADD COLUMN "deal_notes" text;--> statement-breakpoint
ALTER TABLE "manual_invoices" ADD CONSTRAINT "manual_invoices_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_invoices" ADD CONSTRAINT "manual_invoices_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_invoice_id_manual_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."manual_invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_recorded_by_id_users_id_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manual_invoices_farm_idx" ON "manual_invoices" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "manual_invoices_due_idx" ON "manual_invoices" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "manual_payments_invoice_idx" ON "manual_payments" USING btree ("invoice_id");