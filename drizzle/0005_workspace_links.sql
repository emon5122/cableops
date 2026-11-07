CREATE TYPE "public"."workspace_link_type" AS ENUM('wired', 'wifi', 'vpn', 'tunnel', 'wan');--> statement-breakpoint
CREATE TABLE "workspace_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_a_id" text NOT NULL,
	"device_a_id" text NOT NULL,
	"port_a" integer NOT NULL,
	"workspace_b_id" text NOT NULL,
	"device_b_id" text NOT NULL,
	"port_b" integer NOT NULL,
	"link_type" "workspace_link_type" DEFAULT 'wired' NOT NULL,
	"label" text,
	"speed" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "workspace_links" ADD CONSTRAINT "workspace_links_workspace_a_id_workspaces_id_fk" FOREIGN KEY ("workspace_a_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_links" ADD CONSTRAINT "workspace_links_device_a_id_devices_id_fk" FOREIGN KEY ("device_a_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_links" ADD CONSTRAINT "workspace_links_workspace_b_id_workspaces_id_fk" FOREIGN KEY ("workspace_b_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_links" ADD CONSTRAINT "workspace_links_device_b_id_devices_id_fk" FOREIGN KEY ("device_b_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_links" ADD CONSTRAINT "workspace_links_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_links_workspace_a_idx" ON "workspace_links" USING btree ("workspace_a_id");--> statement-breakpoint
CREATE INDEX "workspace_links_workspace_b_idx" ON "workspace_links" USING btree ("workspace_b_id");--> statement-breakpoint
CREATE INDEX "workspace_links_device_a_port_idx" ON "workspace_links" USING btree ("device_a_id","port_a");--> statement-breakpoint
CREATE INDEX "workspace_links_device_b_port_idx" ON "workspace_links" USING btree ("device_b_id","port_b");