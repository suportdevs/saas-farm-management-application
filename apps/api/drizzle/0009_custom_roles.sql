CREATE TABLE "platform_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(60) NOT NULL,
	"description" varchar(255),
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_roles_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "farm_custom_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"farm_id" uuid NOT NULL,
	"name" varchar(60) NOT NULL,
	"description" varchar(255),
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "staff_role" SET DATA TYPE varchar(40);--> statement-breakpoint
ALTER TABLE "farm_invitations" ADD COLUMN "custom_role_id" uuid;--> statement-breakpoint
ALTER TABLE "farm_members" ADD COLUMN "custom_role_id" uuid;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_custom_roles" ADD CONSTRAINT "farm_custom_roles_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_custom_roles" ADD CONSTRAINT "farm_custom_roles_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "farm_custom_roles_farm_name_unique" ON "farm_custom_roles" USING btree ("farm_id",lower("name"));--> statement-breakpoint
ALTER TABLE "farm_invitations" ADD CONSTRAINT "farm_invitations_custom_role_id_farm_custom_roles_id_fk" FOREIGN KEY ("custom_role_id") REFERENCES "public"."farm_custom_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_members" ADD CONSTRAINT "farm_members_custom_role_id_farm_custom_roles_id_fk" FOREIGN KEY ("custom_role_id") REFERENCES "public"."farm_custom_roles"("id") ON DELETE no action ON UPDATE no action;