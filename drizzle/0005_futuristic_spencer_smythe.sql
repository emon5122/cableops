ALTER TABLE "connections" ADD COLUMN "connection_type" text DEFAULT 'wired';--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "ssid" text;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "wifi_password" text;