import { db } from "@/db";
import * as schema from "@/db/schema";
import {
	type ConnectionRow,
	type DeviceRow,
	getNetworkSegment,
	type InterfaceRow,
	parseIp,
} from "@/lib/topology-types";
import type { TRPCRouterRecord } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "./init";

/* ── IP Validation Helpers (server-side) ── */

/** Parse a plain IPv4 like "192.168.1.1" into a 32-bit number */
function parseIpv4(ip: string): number | null {
	const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (!m) return null;
	const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
	if (o.some((v) => v > 255)) return null;
	return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
}

/** Parse "1.2.3.4/24" or plain "1.2.3.4" → { ip, cidr, network, mask } */
function parseIpMaybeCidr(
	raw: string,
): { ip: number; cidr: number; network: number; mask: number } | null {
	const mCidr = raw.match(
		/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/,
	);
	if (mCidr) {
		const o = [
			Number(mCidr[1]),
			Number(mCidr[2]),
			Number(mCidr[3]),
			Number(mCidr[4]),
		];
		if (o.some((v) => v > 255)) return null;
		const cidr = Number(mCidr[5]);
		if (cidr > 32) return null;
		const ip = ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
		const mask = cidr > 0 ? (~0 << (32 - cidr)) >>> 0 : 0;
		return { ip, cidr, network: (ip & mask) >>> 0, mask };
	}
	const plain = parseIpv4(raw);
	if (plain !== null) {
		const mask = (~0 << 8) >>> 0; /* /24 default */
		return { ip: plain, cidr: 24, network: (plain & mask) >>> 0, mask };
	}
	return null;
}

/** Validate an IP string is well-formed (plain or CIDR) */
function isValidIp(ip: string): boolean {
	return parseIpMaybeCidr(ip) !== null;
}

/** Validate CIDR notation like 192.168.1.0/24 */
function isValidCidr(ipCidr: string): boolean {
	return parseIp(ipCidr) !== null;
}

/** Validate plain IPv4 like 192.168.1.1 */
function isValidPlainIpv4(ip: string): boolean {
	return parseIpv4(ip) !== null;
}

/** Check if a plain IPv4 address belongs to a subnet */
function ipv4InSubnet(ip: string, network: number, mask: number): boolean {
	const n = parseIpv4(ip);
	if (n === null) return false;
	return ((n & mask) >>> 0) === network;
}

/** Strip CIDR suffix to get the plain IP part */
function stripCidr(ip: string): string {
	return ip.split("/")[0];
}

/* ── Workspaces ── */

const workspacesRouter = {
	list: publicProcedure
		.input(z.object({ ownerId: z.string() }))
		.query(({ input }) =>
			db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.ownerId, input.ownerId)),
		),

	get: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const rows = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, input.id));
			return rows[0] ?? null;
		}),

	create: publicProcedure
		.input(z.object({ name: z.string().min(1), ownerId: z.string() }))
		.mutation(async ({ input }) => {
			const id = crypto.randomUUID();
			const rows = await db
				.insert(schema.workspaces)
				.values({ id, name: input.name, ownerId: input.ownerId })
				.returning();
			const row = rows[0];
			if (!row) throw new Error("Failed to create workspace");
			return row;
		}),

	update: publicProcedure
		.input(z.object({ id: z.string(), name: z.string().min(1) }))
		.mutation(async ({ input }) => {
			const rows = await db
				.update(schema.workspaces)
				.set({ name: input.name })
				.where(eq(schema.workspaces.id, input.id))
				.returning();
			return rows[0] ?? null;
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) =>
			db.delete(schema.workspaces).where(eq(schema.workspaces.id, input.id)),
		),

	createShare: publicProcedure
		.input(z.object({ workspaceId: z.string(), createdBy: z.string() }))
		.mutation(async ({ input }) => {
			const wsRows = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, input.workspaceId));
			const ws = wsRows[0];
			if (!ws) throw new Error("Workspace not found");

			const existing = await db
				.select()
				.from(schema.workspaceShares)
				.where(eq(schema.workspaceShares.workspaceId, input.workspaceId));
			if (existing[0]) return existing[0];

			const id = crypto.randomUUID();
			const token = crypto.randomUUID().replace(/-/g, "");
			const rows = await db
				.insert(schema.workspaceShares)
				.values({
					id,
					workspaceId: input.workspaceId,
					token,
					createdBy: input.createdBy,
				})
				.returning();
			const row = rows[0];
			if (!row) throw new Error("Failed to create share link");
			return row;
		}),

	resolveShare: publicProcedure
		.input(z.object({ token: z.string().min(8) }))
		.query(async ({ input }) => {
			const rows = await db
				.select()
				.from(schema.workspaceShares)
				.where(eq(schema.workspaceShares.token, input.token));
			const share = rows[0];
			if (!share) return null;

			const wsRows = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, share.workspaceId));
			return wsRows[0]
				? {
					workspaceId: wsRows[0].id,
					workspaceName: wsRows[0].name,
				}
				: null;
		}),

	exportSnapshot: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ input }) => {
			const wsRows = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, input.workspaceId));
			const workspace = wsRows[0];
			if (!workspace) throw new Error("Workspace not found");

			const devices = await db
				.select()
				.from(schema.devices)
				.where(eq(schema.devices.workspaceId, input.workspaceId));
			const deviceIds = devices.map((d) => d.id);

			const connections = await db
				.select()
				.from(schema.connections)
				.where(eq(schema.connections.workspaceId, input.workspaceId));

			const annotations = await db
				.select()
				.from(schema.annotations)
				.where(eq(schema.annotations.workspaceId, input.workspaceId));

			const interfaces =
				deviceIds.length > 0
					? await db
							.select()
							.from(schema.interfaces)
							.where(inArray(schema.interfaces.deviceId, deviceIds))
					: [];

			const routes =
				deviceIds.length > 0
					? await db
							.select()
							.from(schema.routes)
							.where(inArray(schema.routes.deviceId, deviceIds))
					: [];

			return {
				version: 1,
				exportedAt: new Date().toISOString(),
				workspace: {
					id: workspace.id,
					name: workspace.name,
				},
				devices,
				interfaces,
				connections,
				routes,
				annotations,
			};
		}),

	importSnapshot: publicProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				snapshot: z.object({
					version: z.number(),
					workspace: z.object({
						name: z.string().optional(),
					}),
					devices: z.array(
						z.object({
							id: z.string(),
							name: z.string(),
							deviceType: z.string(),
							color: z.string(),
							portCount: z.number().int(),
							positionX: z.number().int(),
							positionY: z.number().int(),
							maxSpeed: z.string().nullable().optional(),
							ipForwarding: z.boolean().nullable().optional(),
						}),
					),
					interfaces: z.array(
						z.object({
							id: z.string(),
							deviceId: z.string(),
							portNumber: z.number().int(),
							alias: z.string().nullable().optional(),
							reserved: z.boolean(),
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
						}),
					),
					connections: z.array(
						z.object({
							id: z.string(),
							deviceAId: z.string(),
							portA: z.number().int(),
							deviceBId: z.string(),
							portB: z.number().int(),
							speed: z.string().nullable().optional(),
							connectionType: z.string().nullable().optional(),
						}),
					),
					routes: z.array(
						z.object({
							id: z.string(),
							deviceId: z.string(),
							destination: z.string(),
							nextHop: z.string(),
							interfacePort: z.number().int().nullable().optional(),
							metric: z.number().int().nullable().optional(),
						}),
					),
					annotations: z.array(
						z.object({
							id: z.string(),
							kind: z.string(),
							label: z.string().nullable().optional(),
							x: z.number().int(),
							y: z.number().int(),
							width: z.number().int(),
							height: z.number().int(),
							color: z.string(),
						}),
					),
				}),
			}),
		)
		.mutation(async ({ input }) => {
			const wsRows = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, input.workspaceId));
			const ws = wsRows[0];
			if (!ws) throw new Error("Workspace not found");

			const currentDevices = await db
				.select()
				.from(schema.devices)
				.where(eq(schema.devices.workspaceId, input.workspaceId));
			const currentDeviceIds = currentDevices.map((d) => d.id);

			if (currentDeviceIds.length > 0) {
				await db
					.delete(schema.interfaces)
					.where(inArray(schema.interfaces.deviceId, currentDeviceIds));
				await db
					.delete(schema.routes)
					.where(inArray(schema.routes.deviceId, currentDeviceIds));
			}
			await db
				.delete(schema.connections)
				.where(eq(schema.connections.workspaceId, input.workspaceId));
			await db
				.delete(schema.annotations)
				.where(eq(schema.annotations.workspaceId, input.workspaceId));
			await db
				.delete(schema.devices)
				.where(eq(schema.devices.workspaceId, input.workspaceId));

			const deviceIdMap = new Map<string, string>();
			for (const d of input.snapshot.devices) {
				const newId = crypto.randomUUID();
				deviceIdMap.set(d.id, newId);
			}

			if (input.snapshot.devices.length > 0) {
				await db.insert(schema.devices).values(
					input.snapshot.devices.map((d) => ({
						id: deviceIdMap.get(d.id)!,
						workspaceId: input.workspaceId,
						name: d.name,
						deviceType: d.deviceType,
						color: d.color,
						portCount: d.portCount,
						positionX: d.positionX,
						positionY: d.positionY,
						maxSpeed: d.maxSpeed ?? null,
						ipForwarding: d.ipForwarding ?? false,
					})),
				);
			}

			if (input.snapshot.interfaces.length > 0) {
				await db.insert(schema.interfaces).values(
					input.snapshot.interfaces
						.map((i) => ({
							id: crypto.randomUUID(),
							deviceId: deviceIdMap.get(i.deviceId) ?? "",
							portNumber: i.portNumber,
							alias: i.alias ?? null,
							reserved: i.reserved,
							reservedLabel: i.reservedLabel ?? null,
							speed: i.speed ?? null,
							vlan: i.vlan ?? null,
							ipAddress: i.ipAddress ?? null,
							macAddress: i.macAddress ?? null,
							portMode: i.portMode ?? null,
							portRole: i.portRole ?? null,
							dhcpEnabled: i.dhcpEnabled ?? false,
							dhcpRangeStart: i.dhcpRangeStart ?? null,
							dhcpRangeEnd: i.dhcpRangeEnd ?? null,
							ssid: i.ssid ?? null,
							wifiPassword: i.wifiPassword ?? null,
							natEnabled: i.natEnabled ?? false,
							gateway: i.gateway ?? null,
						}))
						.filter((i) => i.deviceId.length > 0),
				);
			}

			if (input.snapshot.connections.length > 0) {
				await db.insert(schema.connections).values(
					input.snapshot.connections
						.map((c) => ({
							id: crypto.randomUUID(),
							workspaceId: input.workspaceId,
							deviceAId: deviceIdMap.get(c.deviceAId) ?? "",
							portA: c.portA,
							deviceBId: deviceIdMap.get(c.deviceBId) ?? "",
							portB: c.portB,
							speed: c.speed ?? null,
							connectionType: c.connectionType ?? "wired",
						}))
						.filter(
							(c) => c.deviceAId.length > 0 && c.deviceBId.length > 0,
						),
				);
			}

			if (input.snapshot.routes.length > 0) {
				await db.insert(schema.routes).values(
					input.snapshot.routes
						.map((r) => ({
							id: crypto.randomUUID(),
							deviceId: deviceIdMap.get(r.deviceId) ?? "",
							destination: r.destination,
							nextHop: r.nextHop,
							interfacePort: r.interfacePort ?? null,
							metric: r.metric ?? 100,
						}))
						.filter((r) => r.deviceId.length > 0),
				);
			}

			if (input.snapshot.annotations.length > 0) {
				await db.insert(schema.annotations).values(
					input.snapshot.annotations.map((a) => ({
						id: crypto.randomUUID(),
						workspaceId: input.workspaceId,
						kind: a.kind,
						label: a.label ?? null,
						x: a.x,
						y: a.y,
						width: a.width,
						height: a.height,
						color: a.color,
					})),
				);
			}

			if (input.snapshot.workspace.name?.trim()) {
				await db
					.update(schema.workspaces)
					.set({ name: input.snapshot.workspace.name.trim() })
					.where(eq(schema.workspaces.id, input.workspaceId));
			}

			return {
				success: true,
				devicesImported: input.snapshot.devices.length,
				connectionsImported: input.snapshot.connections.length,
			};
		}),
} satisfies TRPCRouterRecord;

/* ── Devices ── */

const devicesRouter = {
	list: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(({ input }) =>
			db
				.select()
				.from(schema.devices)
				.where(eq(schema.devices.workspaceId, input.workspaceId)),
		),

	create: publicProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				name: z.string().min(1),
				deviceType: z.string().default("switch"),
				color: z.string(),
				portCount: z.number().int().min(0).max(9999),
				positionX: z.number().int().optional(),
				positionY: z.number().int().optional(),
				maxSpeed: z.string().optional(),
				ipForwarding: z.boolean().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const id = crypto.randomUUID();
			const rows = await db
				.insert(schema.devices)
				.values({
					id,
					workspaceId: input.workspaceId,
					name: input.name,
					deviceType: input.deviceType,
					color: input.color,
					portCount: input.portCount,
					positionX: input.positionX ?? 100,
					positionY: input.positionY ?? 100,
					maxSpeed: input.maxSpeed ?? null,
					ipForwarding: input.ipForwarding ?? false,
				})
				.returning();
			const row = rows[0];
			if (!row) throw new Error("Failed to create device");
			return row;
		}),

	update: publicProcedure
		.input(
			z.object({
				id: z.string(),
				name: z.string().min(1).optional(),
				deviceType: z.string().optional(),
				color: z.string().optional(),
				portCount: z.number().int().min(0).max(9999).optional(),
				maxSpeed: z.string().nullable().optional(),
				ipForwarding: z.boolean().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const { id, ...fields } = input;
			const rows = await db
				.update(schema.devices)
				.set(fields)
				.where(eq(schema.devices.id, id))
				.returning();
			return rows[0] ?? null;
		}),

	move: publicProcedure
		.input(
			z.object({
				id: z.string(),
				positionX: z.number().int(),
				positionY: z.number().int(),
			}),
		)
		.mutation(({ input }) =>
			db
				.update(schema.devices)
				.set({ positionX: input.positionX, positionY: input.positionY })
				.where(eq(schema.devices.id, input.id)),
		),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) =>
			db.delete(schema.devices).where(eq(schema.devices.id, input.id)),
		),
} satisfies TRPCRouterRecord;

/* ── Connections ── */

const connectionsRouter = {
	list: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(({ input }) =>
			db
				.select()
				.from(schema.connections)
				.where(eq(schema.connections.workspaceId, input.workspaceId)),
		),

	create: publicProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				deviceAId: z.string(),
				portA: z.number().int().min(0),
				deviceBId: z.string(),
				portB: z.number().int().min(0),
				speed: z.string().optional(),
				connectionType: z.enum(["wired", "wifi"]).default("wired"),
			}),
		)
		.mutation(async ({ input }) => {
			/* Prevent self-connection */
			if (input.deviceAId === input.deviceBId) {
				throw new Error("Cannot connect a device to itself");
			}

			/* Validate both devices exist and belong to the same workspace */
			const linkedDevices = await db
				.select()
				.from(schema.devices)
				.where(inArray(schema.devices.id, [input.deviceAId, input.deviceBId]));
			const deviceA = linkedDevices.find((d) => d.id === input.deviceAId);
			const deviceB = linkedDevices.find((d) => d.id === input.deviceBId);
			if (!deviceA || !deviceB) {
				throw new Error("Both connection endpoints must reference valid devices");
			}
			if (
				deviceA.workspaceId !== input.workspaceId ||
				deviceB.workspaceId !== input.workspaceId
			) {
				throw new Error("Both devices must belong to the same workspace");
			}

			/* Validate port numbers exist on both devices (0..portCount) */
			if (input.portA < 0 || input.portA > deviceA.portCount) {
				throw new Error(`Port ${input.portA} does not exist on device A`);
			}
			if (input.portB < 0 || input.portB > deviceB.portCount) {
				throw new Error(`Port ${input.portB} does not exist on device B`);
			}

			/* A port can only participate in one connection */
			const existing = await db
				.select()
				.from(schema.connections)
				.where(eq(schema.connections.workspaceId, input.workspaceId));
			for (const conn of existing) {
				if (
					(conn.deviceAId === input.deviceAId && conn.portA === input.portA) ||
					(conn.deviceBId === input.deviceAId && conn.portB === input.portA)
				) {
					throw new Error(`Port ${input.portA} on device A is already connected`);
				}
				if (
					(conn.deviceAId === input.deviceBId && conn.portA === input.portB) ||
					(conn.deviceBId === input.deviceBId && conn.portB === input.portB)
				) {
					throw new Error(`Port ${input.portB} on device B is already connected`);
				}
			}

			/* For WiFi, prevent duplicate WiFi link between same two devices */
			if (input.connectionType === "wifi") {
				const duplicate = existing.find(
					(c) =>
						c.connectionType === "wifi" &&
						((c.deviceAId === input.deviceAId &&
							c.deviceBId === input.deviceBId) ||
							(c.deviceAId === input.deviceBId &&
								c.deviceBId === input.deviceAId)),
				);
				if (duplicate) {
					throw new Error("These devices are already connected via WiFi");
				}
			}

			const id = crypto.randomUUID();
			const rows = await db
				.insert(schema.connections)
				.values({
					id,
					workspaceId: input.workspaceId,
					deviceAId: input.deviceAId,
					portA: input.portA,
					deviceBId: input.deviceBId,
					portB: input.portB,
					speed: input.speed ?? null,
					connectionType: input.connectionType,
				})
				.returning();
			const row = rows[0];
			if (!row) throw new Error("Failed to create connection");
			return row;
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) =>
			db.delete(schema.connections).where(eq(schema.connections.id, input.id)),
		),
} satisfies TRPCRouterRecord;

/* ── Interfaces (replaces port configs) ── */

const interfacesRouter = {
	list: publicProcedure
		.input(z.object({ deviceId: z.string() }))
		.query(({ input }) =>
			db
				.select()
				.from(schema.interfaces)
				.where(eq(schema.interfaces.deviceId, input.deviceId)),
		),

	listByWorkspace: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ input }) => {
			const wsDevices = await db
				.select()
				.from(schema.devices)
				.where(eq(schema.devices.workspaceId, input.workspaceId));
			const deviceIds = wsDevices.map((d) => d.id);
			if (deviceIds.length === 0) return [];
			return db
				.select()
				.from(schema.interfaces)
				.where(inArray(schema.interfaces.deviceId, deviceIds));
		}),

	upsert: publicProcedure
		.input(
			z.object({
				deviceId: z.string(),
				portNumber: z.number().int().min(0),
				alias: z.string().nullable().optional(),
				reserved: z.boolean().optional(),
				reservedLabel: z.string().nullable().optional(),
				speed: z.string().nullable().optional(),
				vlan: z.number().int().min(1).max(4094).nullable().optional(),
				ipAddress: z.string().nullable().optional(),
				macAddress: z.string().nullable().optional(),
				portMode: z.string().nullable().optional(),
				portRole: z.string().nullable().optional(),
				dhcpEnabled: z.boolean().optional(),
				dhcpRangeStart: z.string().nullable().optional(),
				dhcpRangeEnd: z.string().nullable().optional(),
				ssid: z.string().nullable().optional(),
				wifiPassword: z.string().nullable().optional(),
				natEnabled: z.boolean().optional(),
				gateway: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const deviceRows = await db
				.select()
				.from(schema.devices)
				.where(eq(schema.devices.id, input.deviceId));
			const device = deviceRows[0];
			if (!device) throw new Error("Device not found");
			if (input.portNumber < 0 || input.portNumber > device.portCount) {
				throw new Error(
					`Port ${input.portNumber} does not exist on device ${device.name}`,
				);
			}

			const existing = await db
				.select()
				.from(schema.interfaces)
				.where(eq(schema.interfaces.deviceId, input.deviceId));
			const match = existing.find((p) => p.portNumber === input.portNumber);

			/* ── IP validation ── */
			if (input.ipAddress) {
				if (!isValidIp(input.ipAddress)) {
					throw new Error(`Invalid IP address format: ${input.ipAddress}`);
				}

				const wsDevices = await db
					.select()
					.from(schema.devices)
					.where(eq(schema.devices.workspaceId, device.workspaceId));
				const wsConns = await db
					.select()
					.from(schema.connections)
					.where(eq(schema.connections.workspaceId, device.workspaceId));
				const wsInterfaces = await db
					.select()
					.from(schema.interfaces)
					.where(
						inArray(
							schema.interfaces.deviceId,
							wsDevices.map((d) => d.id),
						),
					);

				/* Get the network segment for this specific port */
				const seg = getNetworkSegment(
					input.deviceId,
					input.portNumber,
					wsConns as ConnectionRow[],
					wsDevices as DeviceRow[],
					wsInterfaces as InterfaceRow[],
				);
				const segDeviceIds = [...new Set(seg.ports.map((p) => p.deviceId))];

				if (segDeviceIds.length > 0) {
					const segConfigs = wsInterfaces.filter((pc) =>
						seg.ports.some(
							(sp) =>
								sp.deviceId === pc.deviceId && sp.portNumber === pc.portNumber,
						),
					);

					const proposedPlain = stripCidr(input.ipAddress).trim();
					for (const pc of segConfigs) {
						if (
							pc.deviceId === input.deviceId &&
							pc.portNumber === input.portNumber
						)
							continue;
						if (!pc.ipAddress) continue;
						const existingPlain = stripCidr(pc.ipAddress).trim();
						if (existingPlain === proposedPlain) {
							throw new Error(
								`IP ${proposedPlain} is already assigned to another device in this network segment`,
							);
						}
					}

					/* Subnet validation: non-gateway ports must match the segment gateway subnet */
					if (seg.gateway) {
						const isGwPort =
							seg.gateway.deviceId === input.deviceId &&
							seg.gateway.portNumber === input.portNumber;
						if (!isGwPort) {
							const parsed = parseIp(input.ipAddress);
							if (
								parsed &&
								(parsed.ip & seg.gateway.mask) >>> 0 !== seg.gateway.network
							) {
								const gwDev = wsDevices.find((d) => d.id === seg.gateway?.deviceId);
								throw new Error(
									`IP ${input.ipAddress} is not in subnet ${seg.subnet} (gateway: ${gwDev?.name ?? "?"} P${seg.gateway.portNumber})`,
								);
							}
						}
					}
				}
			}

			/* ── Gateway IP validation ── */
			if (input.gateway && !isValidIp(input.gateway)) {
				throw new Error("Invalid gateway IP format");
			}

			/* ── DHCP range validation ── */
			const effectiveDhcpEnabled = input.dhcpEnabled ?? match?.dhcpEnabled ?? false;
			const effectiveDhcpStart =
				input.dhcpRangeStart ?? match?.dhcpRangeStart ?? null;
			const effectiveDhcpEnd = input.dhcpRangeEnd ?? match?.dhcpRangeEnd ?? null;
			const effectiveInterfaceIp = input.ipAddress ?? match?.ipAddress ?? null;

			if (
				effectiveDhcpEnabled ||
				input.dhcpRangeStart !== undefined ||
				input.dhcpRangeEnd !== undefined
			) {
				if (effectiveDhcpEnabled) {
					if (!effectiveDhcpStart || !effectiveDhcpEnd) {
						throw new Error(
							"DHCP enabled requires both start and end range addresses",
						);
					}
					if (!effectiveInterfaceIp) {
						throw new Error(
							"DHCP enabled requires an interface IP in CIDR format",
						);
					}

					const iface = parseIp(effectiveInterfaceIp);
					if (!iface) {
						throw new Error(
							"Interface IP must be valid CIDR when DHCP is enabled",
						);
					}

					const s = parseIpv4(effectiveDhcpStart);
					const e = parseIpv4(effectiveDhcpEnd);
					if (s === null) throw new Error("Invalid DHCP range start IP");
					if (e === null) throw new Error("Invalid DHCP range end IP");
					if (s > e) {
						throw new Error(
							"DHCP range start must be less than or equal to end",
						);
					}
					if (
						!ipv4InSubnet(effectiveDhcpStart, iface.network, iface.mask) ||
						!ipv4InSubnet(effectiveDhcpEnd, iface.network, iface.mask)
					) {
						throw new Error(
							"DHCP range must be inside the interface subnet",
						);
					}

					const wsDevices = await db
						.select()
						.from(schema.devices)
						.where(eq(schema.devices.workspaceId, device.workspaceId));
					const wsConns = await db
						.select()
						.from(schema.connections)
						.where(eq(schema.connections.workspaceId, device.workspaceId));
					const wsInterfaces = await db
						.select()
						.from(schema.interfaces)
						.where(
							inArray(
								schema.interfaces.deviceId,
								wsDevices.map((d) => d.id),
							),
						);

					const seg = getNetworkSegment(
						input.deviceId,
						input.portNumber,
						wsConns as ConnectionRow[],
						wsDevices as DeviceRow[],
						wsInterfaces as InterfaceRow[],
					);
					const segConfigs = wsInterfaces.filter((pc) =>
						seg.ports.some(
							(sp) =>
								sp.deviceId === pc.deviceId && sp.portNumber === pc.portNumber,
						),
					);

					for (const pc of segConfigs) {
						if (
							pc.deviceId === input.deviceId &&
							pc.portNumber === input.portNumber
						)
							continue;
						if (!pc.ipAddress) continue;
						const staticIp = parseIpv4(stripCidr(pc.ipAddress));
						if (staticIp === null) continue;
						if (staticIp >= s && staticIp <= e) {
							throw new Error(
								`DHCP range collides with static IP ${stripCidr(pc.ipAddress)} in this segment`,
							);
						}
					}
				}
			}

			/* ── Upsert logic ── */
			if (match) {
				const { deviceId: _d, portNumber: _p, ...fields } = input;
				const rows = await db
					.update(schema.interfaces)
					.set(fields)
					.where(eq(schema.interfaces.id, match.id))
					.returning();
				return rows[0] ?? null;
			}

			const id = crypto.randomUUID();
			const rows = await db
				.insert(schema.interfaces)
				.values({
					id,
					deviceId: input.deviceId,
					portNumber: input.portNumber,
					alias: input.alias ?? null,
					reserved: input.reserved ?? false,
					reservedLabel: input.reservedLabel ?? null,
					speed: input.speed ?? null,
					vlan: input.vlan ?? null,
					ipAddress: input.ipAddress ?? null,
					macAddress: input.macAddress ?? null,
					portMode: input.portMode ?? null,
					portRole: input.portRole ?? null,
					dhcpEnabled: input.dhcpEnabled ?? false,
					dhcpRangeStart: input.dhcpRangeStart ?? null,
					dhcpRangeEnd: input.dhcpRangeEnd ?? null,
					ssid: input.ssid ?? null,
					wifiPassword: input.wifiPassword ?? null,
					natEnabled: input.natEnabled ?? false,
					gateway: input.gateway ?? null,
				})
				.returning();
			return rows[0] ?? null;
		}),
} satisfies TRPCRouterRecord;

/* ── Routes ── */

const routesRouter = {
	list: publicProcedure
		.input(z.object({ deviceId: z.string() }))
		.query(({ input }) =>
			db
				.select()
				.from(schema.routes)
				.where(eq(schema.routes.deviceId, input.deviceId)),
		),

	upsert: publicProcedure
		.input(
			z.object({
				id: z.string().optional(),
				deviceId: z.string(),
				destination: z.string(),
				nextHop: z.string(),
				interfacePort: z.number().int().min(0).nullable().optional(),
				metric: z.number().int().min(0).default(100),
			}),
		)
		.mutation(async ({ input }) => {
			const deviceRows = await db
				.select()
				.from(schema.devices)
				.where(eq(schema.devices.id, input.deviceId));
			const device = deviceRows[0];
			if (!device) {
				throw new Error("Route must reference a valid device");
			}

			if (!isValidCidr(input.destination)) {
				throw new Error(`Invalid destination format: ${input.destination}`);
			}
			if (!isValidPlainIpv4(input.nextHop)) {
				throw new Error(`Invalid next-hop format: ${input.nextHop}`);
			}

			if (input.interfacePort !== null && input.interfacePort !== undefined) {
				if (input.interfacePort < 0 || input.interfacePort > device.portCount) {
					throw new Error(
						`Interface port ${input.interfacePort} does not exist on ${device.name}`,
					);
				}
				const ifaceRows = await db
					.select()
					.from(schema.interfaces)
					.where(
						and(
							eq(schema.interfaces.deviceId, input.deviceId),
							eq(schema.interfaces.portNumber, input.interfacePort),
						),
					);
				if (!ifaceRows[0]) {
					throw new Error(
						`Interface port ${input.interfacePort} must be configured before using it in a route`,
					);
				}
			}

			if (input.id) {
				const rows = await db
					.update(schema.routes)
					.set({
						destination: input.destination,
						nextHop: input.nextHop,
						interfacePort: input.interfacePort ?? null,
						metric: input.metric,
					})
					.where(eq(schema.routes.id, input.id))
					.returning();
				return rows[0] ?? null;
			}

			const id = crypto.randomUUID();
			const rows = await db
				.insert(schema.routes)
				.values({
					id,
					deviceId: input.deviceId,
					destination: input.destination,
					nextHop: input.nextHop,
					interfacePort: input.interfacePort ?? null,
					metric: input.metric,
				})
				.returning();
			return rows[0] ?? null;
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) =>
			db.delete(schema.routes).where(eq(schema.routes.id, input.id)),
		),
} satisfies TRPCRouterRecord;

/* ── Annotations (barriers, rooms, labels) ── */

const annotationsRouter = {
	list: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(({ input }) =>
			db
				.select()
				.from(schema.annotations)
				.where(eq(schema.annotations.workspaceId, input.workspaceId)),
		),

	create: publicProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				kind: z.enum(["rect", "label"]).default("rect"),
				label: z.string().nullable().optional(),
				x: z.number().int(),
				y: z.number().int(),
				width: z.number().int().min(20).default(200),
				height: z.number().int().min(20).default(150),
				color: z.string().default("#334155"),
			}),
		)
		.mutation(async ({ input }) => {
			const id = crypto.randomUUID();
			const rows = await db
				.insert(schema.annotations)
				.values({
					id,
					workspaceId: input.workspaceId,
					kind: input.kind,
					label: input.label ?? null,
					x: input.x,
					y: input.y,
					width: input.width,
					height: input.height,
					color: input.color,
				})
				.returning();
			const row = rows[0];
			if (!row) throw new Error("Failed to create annotation");
			return row;
		}),

	update: publicProcedure
		.input(
			z.object({
				id: z.string(),
				label: z.string().nullable().optional(),
				x: z.number().int().optional(),
				y: z.number().int().optional(),
				width: z.number().int().min(20).optional(),
				height: z.number().int().min(20).optional(),
				color: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const { id, ...fields } = input;
			const rows = await db
				.update(schema.annotations)
				.set(fields)
				.where(eq(schema.annotations.id, id))
				.returning();
			return rows[0] ?? null;
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) =>
			db.delete(schema.annotations).where(eq(schema.annotations.id, input.id)),
		),
} satisfies TRPCRouterRecord;

/* ── Root router ── */

export const trpcRouter = createTRPCRouter({
	workspaces: workspacesRouter,
	devices: devicesRouter,
	connections: connectionsRouter,
	interfaces: interfacesRouter,
	routes: routesRouter,
	annotations: annotationsRouter,
});

export type TRPCRouter = typeof trpcRouter;
