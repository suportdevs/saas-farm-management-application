CREATE TABLE "plans" (
	"id" varchar(20) PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"tagline" varchar(160) DEFAULT '' NOT NULL,
	"price_month" integer,
	"price_year" integer,
	"custom" boolean DEFAULT false NOT NULL,
	"highlighted" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT true NOT NULL,
	"self_serve" boolean DEFAULT false NOT NULL,
	"limits" jsonb NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stripe_price_month" varchar(100),
	"stripe_price_year" varchar(100),
	"archived_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Seed: the plans that used to live in code (DEFAULT_PLANS in packages/shared).
INSERT INTO "plans" ("id", "name", "tagline", "price_month", "price_year", "custom", "highlighted", "is_public", "self_serve", "limits", "capabilities", "features", "sort_order") VALUES
('free', 'Starter', 'For smallholders getting organised.', NULL, NULL, false, false, true, false, '{"animals":25,"members":2}'::jsonb, '["herd","milk","health","breeding","products"]'::jsonb, '["Up to 25 animals","2 team members","Herd register & animal profiles","Milk, health and breeding records","Mobile-friendly web app"]'::jsonb, 0),
('growth', 'Growth', 'For family farms ready to grow.', 2900, 28800, false, false, true, true, '{"animals":250,"members":10}'::jsonb, '["herd","milk","health","breeding","products","feed","finance","data_export"]'::jsonb, '["Up to 250 animals","10 team members","Feed & inventory management","Income, expenses & profitability","CSV / Excel exports","Email support"]'::jsonb, 1),
('pro', 'Professional', 'For commercial dairy and beef operations.', 7900, 79200, false, true, true, true, '{"animals":2000,"members":50}'::jsonb, '["herd","milk","health","breeding","products","feed","finance","data_export","advanced_reports","api_access","priority_support"]'::jsonb, '["Up to 2,000 animals","50 team members","Everything in Growth","Advanced analytics & benchmarks","API access & integrations","Priority support"]'::jsonb, 2),
('enterprise', 'Enterprise', 'For agri-groups, co-ops and integrators.', NULL, NULL, true, false, true, false, '{"animals":null,"members":null}'::jsonb, '["herd","milk","health","breeding","feed","products","finance","advanced_reports","data_export","api_access","priority_support","sso"]'::jsonb, '["Unlimited animals & members","Everything in Professional","Single sign-on (SSO)","Custom onboarding & data migration","Dedicated success manager","Uptime SLA"]'::jsonb, 3)
ON CONFLICT ("id") DO NOTHING;
