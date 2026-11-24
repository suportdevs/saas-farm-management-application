CREATE TABLE "animal_movements" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "animal_movements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"animal_id" integer NOT NULL,
	"from_pen_id" integer,
	"to_pen_id" integer NOT NULL,
	"movement_date" date DEFAULT now() NOT NULL,
	"reason" varchar(255),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "animal_movements_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "animal_status_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "animal_status_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"animal_id" integer NOT NULL,
	"previous_status" varchar(20),
	"new_status" varchar(20) NOT NULL,
	"change_date" date DEFAULT now() NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "animal_status_history_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "animal_movements" ADD CONSTRAINT "animal_movements_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_movements" ADD CONSTRAINT "animal_movements_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_movements" ADD CONSTRAINT "animal_movements_from_pen_id_pens_id_fk" FOREIGN KEY ("from_pen_id") REFERENCES "public"."pens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_movements" ADD CONSTRAINT "animal_movements_to_pen_id_pens_id_fk" FOREIGN KEY ("to_pen_id") REFERENCES "public"."pens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_movements" ADD CONSTRAINT "animal_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_movements" ADD CONSTRAINT "animal_movements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_movements" ADD CONSTRAINT "animal_movements_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_status_history" ADD CONSTRAINT "animal_status_history_tenant_id_farms_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_status_history" ADD CONSTRAINT "animal_status_history_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_status_history" ADD CONSTRAINT "animal_status_history_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_status_history" ADD CONSTRAINT "animal_status_history_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "animal_status_history" ADD CONSTRAINT "animal_status_history_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "animal_movements_animal_idx" ON "animal_movements" USING btree ("animal_id","movement_date");--> statement-breakpoint
CREATE INDEX "animal_movements_tenant_date_idx" ON "animal_movements" USING btree ("tenant_id","movement_date");--> statement-breakpoint
CREATE INDEX "animal_movements_to_pen_idx" ON "animal_movements" USING btree ("to_pen_id");--> statement-breakpoint
CREATE INDEX "animal_movements_from_pen_idx" ON "animal_movements" USING btree ("from_pen_id");--> statement-breakpoint
CREATE INDEX "animal_status_history_animal_idx" ON "animal_status_history" USING btree ("animal_id","change_date");--> statement-breakpoint
CREATE INDEX "animal_status_history_tenant_date_idx" ON "animal_status_history" USING btree ("tenant_id","change_date");