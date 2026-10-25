CREATE TYPE "public"."org_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TABLE "organization_members" (
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "org_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_members_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "organization_members_user_idx" ON "organization_members" USING btree ("user_id");--> statement-breakpoint
-- Backfill: every existing farm joins an organization.
--   * one organization per user, holding the farms where they are the first owner
--     (named after the farm when there is only one, else after the user)
--   * farms with no owner yet (e.g. created by the platform team) get their own
DO $$
DECLARE
  r record;
  org_id uuid;
BEGIN
  FOR r IN
    WITH first_owner AS (
      SELECT DISTINCT ON (fm.farm_id) fm.farm_id, fm.user_id
      FROM farm_members fm
      WHERE fm.role = 'owner'
      ORDER BY fm.farm_id, fm.created_at
    )
    SELECT fo.user_id, u.name AS user_name, count(*) AS farm_count, min(f.name) AS farm_name, array_agg(fo.farm_id) AS farm_ids
    FROM first_owner fo
    JOIN users u ON u.id = fo.user_id
    JOIN farms f ON f.id = fo.farm_id
    GROUP BY fo.user_id, u.name
  LOOP
    INSERT INTO organizations (name, created_by_id)
    VALUES (CASE WHEN r.farm_count = 1 THEN r.farm_name ELSE left(r.user_name, 100) END, r.user_id)
    RETURNING id INTO org_id;
    INSERT INTO organization_members (organization_id, user_id, role) VALUES (org_id, r.user_id, 'owner');
    UPDATE farms SET organization_id = org_id WHERE id = ANY (r.farm_ids);
  END LOOP;

  FOR r IN SELECT id, name, created_by_id FROM farms WHERE organization_id IS NULL LOOP
    INSERT INTO organizations (name, created_by_id) VALUES (r.name, r.created_by_id) RETURNING id INTO org_id;
    UPDATE farms SET organization_id = org_id WHERE id = r.id;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "farms" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "farms" ADD CONSTRAINT "farms_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "farms_organization_idx" ON "farms" USING btree ("organization_id");