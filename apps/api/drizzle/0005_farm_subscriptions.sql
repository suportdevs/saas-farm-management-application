CREATE TABLE "farm_subscriptions" (
	"farm_id" uuid PRIMARY KEY NOT NULL,
	"plan" varchar(20) DEFAULT 'free' NOT NULL,
	"status" varchar(30),
	"source" varchar(10),
	"interval" varchar(10),
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"trial_ends_at" timestamp with time zone,
	"stripe_customer_id" varchar(100),
	"stripe_subscription_id" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farm_subscriptions_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
ALTER TABLE "farms" DROP CONSTRAINT "farms_stripe_customer_id_unique";--> statement-breakpoint
ALTER TABLE "farm_subscriptions" ADD CONSTRAINT "farm_subscriptions_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Hand-written: move each farm's billing data into the subscriptions module's table before the columns are dropped.
INSERT INTO "farm_subscriptions" ("farm_id", "plan", "status", "source", "interval", "current_period_end", "cancel_at_period_end", "trial_ends_at", "stripe_customer_id", "stripe_subscription_id")
SELECT "id", "plan", "subscription_status", "billing_source", "billing_interval", "current_period_end", "cancel_at_period_end", "trial_ends_at", "stripe_customer_id", "stripe_subscription_id" FROM "farms";--> statement-breakpoint
ALTER TABLE "farms" DROP COLUMN "plan";--> statement-breakpoint
ALTER TABLE "farms" DROP COLUMN "subscription_status";--> statement-breakpoint
ALTER TABLE "farms" DROP COLUMN "billing_source";--> statement-breakpoint
ALTER TABLE "farms" DROP COLUMN "billing_interval";--> statement-breakpoint
ALTER TABLE "farms" DROP COLUMN "current_period_end";--> statement-breakpoint
ALTER TABLE "farms" DROP COLUMN "cancel_at_period_end";--> statement-breakpoint
ALTER TABLE "farms" DROP COLUMN "trial_ends_at";--> statement-breakpoint
ALTER TABLE "farms" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "farms" DROP COLUMN "stripe_subscription_id";