import { eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import * as schema from "@/db/schema"
import { getNetworkSegment, parseIp, type ConnectionRow, type DeviceRow } from "@/lib/topology-types"
import { createTRPCRouter, publicProcedure } from "./init"

import type { TRPCRouterRecord } from "@trpc/server"

/* ── IP Validation Helpers (server-side) ── */

/** Parse a plain IPv4 like "192.168.1.1" into a 32-bit number */
function parseIpv4(ip: string): number | null {
	const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
	if (!m) return null
	const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
	if (o.some((v) => v > 255)) return null
	return ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0
}

/** Parse "1.2.3.4/24" or plain "1.2.3.4" → { ip, cidr, network, mask } */
function parseIpMaybeCidr(raw: string): { ip: number; cidr: number; network: number; mask: number } | null {
	const mCidr = raw.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
	if (mCidr) {
		const o = [Number(mCidr[1]), Number(mCidr[2]), Number(mCidr[3]), Number(mCidr[4])]
		if (o.some((v) => v > 255)) return null
		const cidr = Number(mCidr[5])
		if (cidr > 32) return null
		const ip = ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0
		const mask = cidr > 0 ? (~0 << (32 - cidr)) >>> 0 : 0
		return { ip, cidr, network: (ip & mask) >>> 0, mask }
	}
	const plain = parseIpv4(raw)
	if (plain !== null) {
		const mask = (~0 << 8) >>> 0 /* /24 default */
		return { ip: plain, cidr: 24, network: (plain & mask) >>> 0, mask }
	}
	return null
}

/** Validate an IP string is well-formed (plain or CIDR) */
function isValidIp(ip: string): boolean {
	return parseIpMaybeCidr(ip) !== null
}

/** Strip CIDR suffix to get the plain IP part */
function stripCidr(ip: string): string {
	return ip.split("/")[0]
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
				.where(eq(schema.workspaces.id, input.id))
			return rows[0] ?? null
		}),

	create: publicProcedure
		.input(z.object({ name: z.string().min(1), ownerId: z.string() }))
		.mutation(async ({ input }) => {
			const id = crypto.randomUUID()
			const rows = await db
				.insert(schema.workspaces)
				.values({ id, name: input.name, ownerId: input.ownerId })
				.returning()
			const row = rows[0]
			if (!row) throw new Error("Failed to create workspace")
			return row
		}),

	update: publicProcedure
		.input(z.object({ id: z.string(), name: z.string().min(1) }))
		.mutation(async ({ input }) => {
			const rows = await db
				.update(schema.workspaces)
				.set({ name: input.name })
				.where(eq(schema.workspaces.id, input.id))
				.returning()
			return rows[0] ?? null
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) =>
			db
				.delete(schema.workspaces)
				.where(eq(schema.workspaces.id, input.id)),
		),
} satisfies TRPCRouterRecord

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
			const id = crypto.randomUUID()
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
				.returning()
			const row = rows[0]
			if (!row) throw new Error("Failed to create device")
			return row
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
			const { id, ...fields } = input
			const rows = await db
				.update(schema.devices)
				.set(fields)
				.where(eq(schema.devices.id, id))
				.returning()
			return rows[0] ?? null
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
} satisfies TRPCRouterRecord

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
				throw new Error("Cannot connect a device to itself")
			}

			/* For wired connections, check port isn't already occupied */
			if (input.connectionType === "wired") {
				const existing = await db
					.select()
					.from(schema.connections)
					.where(eq(schema.connections.workspaceId, input.workspaceId))
				for (const conn of existing) {
					if (
						(conn.deviceAId === input.deviceAId && conn.portA === input.portA) ||
						(conn.deviceBId === input.deviceAId && conn.portB === input.portA)
					) {
						throw new Error(`Port ${input.portA} on device A is already connected`)
					}
					if (
						(conn.deviceAId === input.deviceBId && conn.portA === input.portB) ||
						(conn.deviceBId === input.deviceBId && conn.portB === input.portB)
					) {
						throw new Error(`Port ${input.portB} on device B is already connected`)
					}
				}
			}

			/* For WiFi, prevent duplicate WiFi link between same two devices */
			if (input.connectionType === "wifi") {
				const existing = await db
					.select()
					.from(schema.connections)
					.where(eq(schema.connections.workspaceId, input.workspaceId))
				const duplicate = existing.find(
					(c) =>
						c.connectionType === "wifi" &&
						((c.deviceAId === input.deviceAId && c.deviceBId === input.deviceBId) ||
							(c.deviceAId === input.deviceBId && c.deviceBId === input.deviceAId)),
				)
				if (duplicate) {
					throw new Error("These devices are already connected via WiFi")
				}
			}

			const id = crypto.randomUUID()
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
				.returning()
			const row = rows[0]
			if (!row) throw new Error("Failed to create connection")
			return row
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) =>
			db
				.delete(schema.connections)
				.where(eq(schema.connections.id, input.id)),
		),
} satisfies TRPCRouterRecord

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
				.where(eq(schema.devices.workspaceId, input.workspaceId))
			const deviceIds = wsDevices.map((d) => d.id)
			if (deviceIds.length === 0) return []
			return db
				.select()
				.from(schema.interfaces)
				.where(inArray(schema.interfaces.deviceId, deviceIds))
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
			/* ── IP validation ── */
			if (input.ipAddress) {
				if (!isValidIp(input.ipAddress)) {
					throw new Error(`Invalid IP address format: ${input.ipAddress}`)
				}

				const deviceRows = await db
					.select()
					.from(schema.devices)
					.where(eq(schema.devices.id, input.deviceId))
				const device = deviceRows[0]
				if (device) {
					const wsDevices = await db
						.select()
						.from(schema.devices)
						.where(eq(schema.devices.workspaceId, device.workspaceId))
					const wsConns = await db
						.select()
						.from(schema.connections)
						.where(eq(schema.connections.workspaceId, device.workspaceId))
					const wsInterfaces = await db
						.select()
						.from(schema.interfaces)
						.where(inArray(schema.interfaces.deviceId, wsDevices.map((d) => d.id)))

					/* Get the network segment for this specific port */
					const seg = getNetworkSegment(
						input.deviceId,
						input.portNumber,
						wsConns as ConnectionRow[],
						wsDevices as DeviceRow[],
						wsInterfaces as InterfaceRow[],
					)
					const segDeviceIds = [...new Set(seg.ports.map((p) => p.deviceId))]

					if (segDeviceIds.length > 0) {
						const segConfigs = wsInterfaces.filter(
							(pc) => seg.ports.some((sp) => sp.deviceId === pc.deviceId && sp.portNumber === pc.portNumber),
						)

						const proposedPlain = stripCidr(input.ipAddress).trim()
						for (const pc of segConfigs) {
							if (pc.deviceId === input.deviceId && pc.portNumber === input.portNumber) continue
							if (!pc.ipAddress) continue
							const existingPlain = stripCidr(pc.ipAddress).trim()
							if (existingPlain === proposedPlain) {
								throw new Error(`IP ${proposedPlain} is already assigned to another device in this network segment`)
							}
						}

						/* Subnet validation: non-gateway ports must match the segment gateway subnet */
						if (seg.gateway) {
							const isGwPort = seg.gateway.deviceId === input.deviceId && seg.gateway.portNumber === input.portNumber
							if (!isGwPort) {
								const parsed = parseIp(input.ipAddress)
								if (parsed && ((parsed.ip & seg.gateway.mask) >>> 0) !== seg.gateway.network) {
									const gwDev = wsDevices.find((d) => d.id === seg.gateway!.deviceId)
									throw new Error(
										`IP ${input.ipAddress} is not in subnet ${seg.subnet} (gateway: ${gwDev?.name ?? "?"} P${seg.gateway.portNumber})`,
									)
								}
							}
						}
					}
				}
			}

			/* ── Gateway IP validation ── */
			if (input.gateway && !isValidIp(input.gateway)) {
				throw new Error("Invalid gateway IP format")
			}

			/* ── DHCP range validation ── */
			if (input.dhcpRangeStart || input.dhcpRangeEnd) {
				const start = input.dhcpRangeStart ?? null
				const end = input.dhcpRangeEnd ?? null
				if (start && !parseIpv4(start)) throw new Error("Invalid DHCP range start IP")
				if (end && !parseIpv4(end)) throw new Error("Invalid DHCP range end IP")
				if (start && end) {
					const s = parseIpv4(start)!
					const e = parseIpv4(end)!
					if (s > e) throw new Error("DHCP range start must be less than or equal to end")
					if ((s >>> 8) !== (e >>> 8)) {
						throw new Error("DHCP range start and end must be in the same /24 subnet")
					}
				}
			}

			/* ── Upsert logic ── */
			const existing = await db
				.select()
				.from(schema.interfaces)
				.where(eq(schema.interfaces.deviceId, input.deviceId))

			const match = existing.find(
				(p) => p.portNumber === input.portNumber,
			)

			if (match) {
				const { deviceId: _d, portNumber: _p, ...fields } = input
				const rows = await db
					.update(schema.interfaces)
					.set(fields)
					.where(eq(schema.interfaces.id, match.id))
					.returning()
				return rows[0] ?? null
			}

			const id = crypto.randomUUID()
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
				.returning()
			return rows[0] ?? null
		}),
} satisfies TRPCRouterRecord

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
			if (!isValidIp(input.destination)) {
				throw new Error(`Invalid destination format: ${input.destination}`)
			}
			if (!isValidIp(input.nextHop)) {
				throw new Error(`Invalid next-hop format: ${input.nextHop}`)
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
					.returning()
				return rows[0] ?? null
			}

			const id = crypto.randomUUID()
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
				.returning()
			return rows[0] ?? null
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) =>
			db.delete(schema.routes).where(eq(schema.routes.id, input.id)),
		),
} satisfies TRPCRouterRecord

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
			const id = crypto.randomUUID()
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
				.returning()
			const row = rows[0]
			if (!row) throw new Error("Failed to create annotation")
			return row
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
			const { id, ...fields } = input
			const rows = await db
				.update(schema.annotations)
				.set(fields)
				.where(eq(schema.annotations.id, id))
				.returning()
			return rows[0] ?? null
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(({ input }) =>
			db.delete(schema.annotations).where(eq(schema.annotations.id, input.id)),
		),
} satisfies TRPCRouterRecord

/* ── Root router ── */

export const trpcRouter = createTRPCRouter({
	workspaces: workspacesRouter,
	devices: devicesRouter,
	connections: connectionsRouter,
	interfaces: interfacesRouter,
	routes: routesRouter,
	annotations: annotationsRouter,
})

export type TRPCRouter = typeof trpcRouter
