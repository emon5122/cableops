ALTER TABLE "devices" ADD COLUMN "management_ip" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "nat_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "gateway" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "dhcp_enabled" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "dhcp_range_start" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "dhcp_range_end" text;--> statement-breakpoint
ALTER TABLE "port_configs" ADD COLUMN "port_mode" text;