CREATE TABLE "farm_role_permissions" (
	"farm_id" uuid NOT NULL,
	"role" "farm_role" NOT NULL,
	"overrides" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "farm_role_permissions_farm_id_role_pk" PRIMARY KEY("farm_id","role")
);
--> statement-breakpoint
ALTER TABLE "farm_members" ADD COLUMN "permission_overrides" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "farm_role_permissions" ADD CONSTRAINT "farm_role_permissions_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_role_permissions" ADD CONSTRAINT "farm_role_permissions_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;