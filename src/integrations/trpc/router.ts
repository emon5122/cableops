import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/db"
import * as schema from "@/db/schema"
import { createTRPCRouter, publicProcedure } from "./init"

import type { TRPCRouterRecord } from "@trpc/server"

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
				portCount: z.number().int().min(1).max(9999),
				positionX: z.number().int().optional(),
				positionY: z.number().int().optional(),
				maxSpeed: z.string().optional(),
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
				portCount: z.number().int().min(1).max(9999).optional(),
				maxSpeed: z.string().nullable().optional(),
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
				portA: z.number().int().min(1),
				deviceBId: z.string(),
				portB: z.number().int().min(1),
				speed: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
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

/* ── Port configs ── */

const portConfigsRouter = {
	list: publicProcedure
		.input(z.object({ deviceId: z.string() }))
		.query(({ input }) =>
			db
				.select()
				.from(schema.portConfigs)
				.where(eq(schema.portConfigs.deviceId, input.deviceId)),
		),

	upsert: publicProcedure
		.input(
			z.object({
				deviceId: z.string(),
				portNumber: z.number().int().min(1),
				alias: z.string().nullable().optional(),
				reserved: z.boolean().optional(),
				reservedLabel: z.string().nullable().optional(),
				speed: z.string().nullable().optional(),
				vlan: z.number().int().min(1).max(4094).nullable().optional(),
				ipAddress: z.string().nullable().optional(),
				macAddress: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const existing = await db
				.select()
				.from(schema.portConfigs)
				.where(eq(schema.portConfigs.deviceId, input.deviceId))

			const match = existing.find(
				(p) => p.portNumber === input.portNumber,
			)

			if (match) {
				const { deviceId: _d, portNumber: _p, ...fields } = input
				const rows = await db
					.update(schema.portConfigs)
					.set(fields)
					.where(eq(schema.portConfigs.id, match.id))
					.returning()
				return rows[0] ?? null
			}

			const id = crypto.randomUUID()
			const rows = await db
				.insert(schema.portConfigs)
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
				})
				.returning()
			return rows[0] ?? null
		}),
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
	portConfigs: portConfigsRouter,
	annotations: annotationsRouter,
})

export type TRPCRouter = typeof trpcRouter
