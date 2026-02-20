import { DEVICE_TYPES } from "@/lib/topology-types";
import { z } from "zod";

const DEVICE_TYPE_ALIASES: Record<string, (typeof DEVICE_TYPES)[number]> = {
	ap: "access-point",
	accesspoint: "access-point",
};

function normalizeDeviceType(raw: string): (typeof DEVICE_TYPES)[number] | string {
	const lowered = raw.trim().toLowerCase();
	if (lowered in DEVICE_TYPE_ALIASES) {
		return DEVICE_TYPE_ALIASES[lowered];
	}
	return lowered;
}

const snapshotDeviceTypeSchema = z.preprocess(
	(value) => (typeof value === "string" ? normalizeDeviceType(value) : value),
	z.enum(DEVICE_TYPES),
);

const snapshotConnectionTypeSchema = z.preprocess(
	(value) => (typeof value === "string" ? value.toLowerCase().trim() : value),
	z.enum(["wired", "wifi"]).default("wired"),
);

const snapshotAnnotationKindSchema = z.preprocess(
	(value) => (typeof value === "string" ? value.toLowerCase().trim() : value),
	z.enum(["rect", "label"]).default("rect"),
);

export const workspaceSnapshotSchema = z.object({
	version: z.literal(1),
	exportedAt: z.string(),
	workspace: z.object({
		id: z.string().optional(),
		name: z.string().min(1).optional(),
	}),
	devices: z.array(
		z.object({
			id: z.string(),
			workspaceId: z.string().optional(),
			name: z.string().min(1),
			deviceType: snapshotDeviceTypeSchema,
			color: z.string().min(1),
			portCount: z.number().int().min(0),
			positionX: z.number().int(),
			positionY: z.number().int(),
			maxSpeed: z.string().nullable().optional(),
			ipForwarding: z.boolean().nullable().optional(),
			createdAt: z.string().optional(),
		}),
	),
	interfaces: z.array(
		z.object({
			id: z.string(),
			deviceId: z.string(),
			portNumber: z.number().int(),
			alias: z.string().nullable().optional(),
			reserved: z.boolean().default(false),
			reservedLabel: z.string().nullable().optional(),
			speed: z.string().nullable().optional(),
			vlan: z.number().int().nullable().optional(),
			ipAddress: z.string().nullable().optional(),
			macAddress: z.string().nullable().optional(),
			portMode: z.string().nullable().optional(),
			portRole: z.string().nullable().optional(),
			dhcpEnabled: z.boolean().nullable().optional(),
			dhcpRangeStart: z.string().nullable().optional(),
			dhcpRangeEnd: z.string().nullable().optional(),
			ssid: z.string().nullable().optional(),
			wifiPassword: z.string().nullable().optional(),
			natEnabled: z.boolean().nullable().optional(),
			gateway: z.string().nullable().optional(),
			createdAt: z.string().optional(),
		}),
	),
	connections: z.array(
		z.object({
			id: z.string(),
			workspaceId: z.string().optional(),
			deviceAId: z.string(),
			portA: z.number().int(),
			deviceBId: z.string(),
			portB: z.number().int(),
			speed: z.string().nullable().optional(),
			connectionType: snapshotConnectionTypeSchema.optional(),
			createdAt: z.string().optional(),
		}),
	),
	routes: z.array(
		z.object({
			id: z.string(),
			deviceId: z.string(),
			destination: z.string().min(1),
			nextHop: z.string().min(1),
			interfacePort: z.number().int().nullable().optional(),
			metric: z.number().int().nullable().optional(),
			createdAt: z.string().optional(),
		}),
	),
	annotations: z.array(
		z.object({
			id: z.string(),
			workspaceId: z.string().optional(),
			kind: snapshotAnnotationKindSchema.optional(),
			label: z.string().nullable().optional(),
			x: z.number().int(),
			y: z.number().int(),
			width: z.number().int(),
			height: z.number().int(),
			color: z.string().min(1),
			createdAt: z.string().optional(),
		}),
	),
});

export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;

export function parseWorkspaceSnapshot(input: unknown): WorkspaceSnapshot {
	return workspaceSnapshotSchema.parse(input);
}

export function safeParseWorkspaceSnapshot(input: unknown) {
	return workspaceSnapshotSchema.safeParse(input);
}
