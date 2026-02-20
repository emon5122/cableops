CREATE INDEX "annotations_workspace_idx" ON "annotations" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "connections_workspace_idx" ON "connections" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "connections_device_a_idx" ON "connections" USING btree ("device_a_id");--> statement-breakpoint
CREATE INDEX "connections_device_b_idx" ON "connections" USING btree ("device_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_device_a_port_uq" ON "connections" USING btree ("device_a_id","port_a");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_device_b_port_uq" ON "connections" USING btree ("device_b_id","port_b");--> statement-breakpoint
CREATE INDEX "devices_workspace_idx" ON "devices" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "interfaces_device_idx" ON "interfaces" USING btree ("device_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interfaces_device_port_uq" ON "interfaces" USING btree ("device_id","port_number");--> statement-breakpoint
CREATE INDEX "routes_device_idx" ON "routes" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_idx" ON "workspaces" USING btree ("owner_id");