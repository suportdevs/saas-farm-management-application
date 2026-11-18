CREATE TABLE "pen_types" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "pen_types_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"type_name" varchar(100) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "pen_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "pens" ADD COLUMN "pen_type_id" integer;--> statement-breakpoint
ALTER TABLE "pen_types" ADD CONSTRAINT "pen_types_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pen_types" ADD CONSTRAINT "pen_types_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pen_types" ADD CONSTRAINT "pen_types_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pen_types" ADD CONSTRAINT "pen_types_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pen_types_type_name_uq" ON "pen_types" USING btree ("tenant_id",lower("type_name")) WHERE deleted_at is null;--> statement-breakpoint
ALTER TABLE "pens" ADD CONSTRAINT "pens_pen_type_id_pen_types_id_fk" FOREIGN KEY ("pen_type_id") REFERENCES "public"."pen_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pens_pen_type_idx" ON "pens" USING btree ("pen_type_id");--> statement-breakpoint
-- Keep existing data: each farm gets a pen type for every fixed type its pens used, and the pens point at it.
INSERT INTO "pen_types" ("tenant_id", "type_name", "created_by", "updated_by")
SELECT DISTINCT p."tenant_id", l.label, NULL::uuid, NULL::uuid
FROM "pens" p
JOIN (VALUES ('barn', 'Barn'), ('free_stall', 'Free stall'), ('paddock', 'Paddock'), ('calf_pen', 'Calf pen'),
             ('maternity', 'Maternity'), ('isolation', 'Isolation'), ('other', 'Other')) AS l(value, label)
  ON l.value = p."type";--> statement-breakpoint
UPDATE "pens" p SET "pen_type_id" = t."id"
FROM (VALUES ('barn', 'Barn'), ('free_stall', 'Free stall'), ('paddock', 'Paddock'), ('calf_pen', 'Calf pen'),
             ('maternity', 'Maternity'), ('isolation', 'Isolation'), ('other', 'Other')) AS l(value, label),
     "pen_types" t
WHERE l.value = p."type" AND t."tenant_id" = p."tenant_id" AND t."type_name" = l.label AND t."deleted_at" IS NULL;
