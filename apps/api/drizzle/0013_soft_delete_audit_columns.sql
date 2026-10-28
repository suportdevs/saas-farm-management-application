ALTER TABLE "platform_roles" DROP CONSTRAINT "platform_roles_key_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "farms" DROP CONSTRAINT "farms_slug_unique";--> statement-breakpoint
ALTER TABLE "farm_invitations" DROP CONSTRAINT "farm_invitations_farm_email_unique";--> statement-breakpoint
DROP INDEX "farm_custom_roles_farm_name_unique";--> statement-breakpoint
ALTER TABLE "platform_roles" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_invitations" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_invitations" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "farm_invitations" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_invitations" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "farm_invitations" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_members" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_members" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "farm_members" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_members" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "farm_members" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization_members" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_custom_roles" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_custom_roles" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_custom_roles" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "farm_custom_roles" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_role_permissions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "farm_role_permissions" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_role_permissions" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_role_permissions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "farm_role_permissions" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "manual_invoices" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "manual_invoices" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "manual_invoices" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "manual_invoices" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_subscriptions" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_subscriptions" ADD COLUMN "updated_by" uuid;--> statement-breakpoint
ALTER TABLE "farm_subscriptions" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "farm_subscriptions" ADD COLUMN "deleted_by" uuid;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_roles" ADD CONSTRAINT "platform_roles_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_invitations" ADD CONSTRAINT "farm_invitations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_invitations" ADD CONSTRAINT "farm_invitations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_invitations" ADD CONSTRAINT "farm_invitations_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_members" ADD CONSTRAINT "farm_members_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_members" ADD CONSTRAINT "farm_members_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_members" ADD CONSTRAINT "farm_members_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_custom_roles" ADD CONSTRAINT "farm_custom_roles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_custom_roles" ADD CONSTRAINT "farm_custom_roles_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_custom_roles" ADD CONSTRAINT "farm_custom_roles_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_role_permissions" ADD CONSTRAINT "farm_role_permissions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_role_permissions" ADD CONSTRAINT "farm_role_permissions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_role_permissions" ADD CONSTRAINT "farm_role_permissions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_invoices" ADD CONSTRAINT "manual_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_invoices" ADD CONSTRAINT "manual_invoices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_invoices" ADD CONSTRAINT "manual_invoices_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_payments" ADD CONSTRAINT "manual_payments_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_subscriptions" ADD CONSTRAINT "farm_subscriptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_subscriptions" ADD CONSTRAINT "farm_subscriptions_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_subscriptions" ADD CONSTRAINT "farm_subscriptions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "platform_roles_key_active_unique" ON "platform_roles" USING btree ("key") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_active_unique" ON "users" USING btree ("email") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "farms_slug_active_unique" ON "farms" USING btree ("slug") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "farm_invitations_farm_email_active_unique" ON "farm_invitations" USING btree ("farm_id","email") WHERE deleted_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "farm_custom_roles_farm_name_unique" ON "farm_custom_roles" USING btree ("farm_id",lower("name")) WHERE deleted_at is null;--> statement-breakpoint
-- Backfill: who created existing rows, where the table already recorded it (old columns are kept).
UPDATE "platform_roles" SET "created_by" = "created_by_id", "updated_by" = "created_by_id";--> statement-breakpoint
UPDATE "farms" SET "created_by" = "created_by_id";--> statement-breakpoint
UPDATE "organizations" SET "created_by" = "created_by_id";--> statement-breakpoint
UPDATE "farm_custom_roles" SET "created_by" = "created_by_id";--> statement-breakpoint
UPDATE "manual_invoices" SET "created_by" = "created_by_id";--> statement-breakpoint
UPDATE "plans" SET "updated_by" = "updated_by_id";--> statement-breakpoint
UPDATE "farm_invitations" SET "created_by" = "invited_by_id", "updated_at" = "created_at";--> statement-breakpoint
UPDATE "manual_payments" SET "created_by" = "recorded_by_id", "updated_at" = "created_at";--> statement-breakpoint
UPDATE "farm_role_permissions" SET "updated_by" = "updated_by_id", "created_at" = "updated_at";--> statement-breakpoint
UPDATE "farm_members" SET "updated_at" = "created_at";--> statement-breakpoint
UPDATE "organization_members" SET "updated_at" = "created_at";
