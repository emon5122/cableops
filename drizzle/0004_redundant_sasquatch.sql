DROP INDEX "connections_device_a_port_uq";--> statement-breakpoint
DROP INDEX "connections_device_b_port_uq";--> statement-breakpoint
CREATE INDEX "connections_device_a_port_idx" ON "connections" USING btree ("device_a_id","port_a");--> statement-breakpoint
CREATE INDEX "connections_device_b_port_idx" ON "connections" USING btree ("device_b_id","port_b");