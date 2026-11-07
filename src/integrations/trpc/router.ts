import { db } from "@/db";
import * as schema from "@/db/schema";
import {
	type ConnectionRow,
	type DeviceRow,
	getNetworkSegment,
	type InterfaceRow,
	ipToString,
	parseIp,
} from "@/lib/topology-types";
import { buildWorkspaceSnapshot } from "@/server/workspace-snapshot";
import { collectLinkedWorkspaces } from "@/lib/linked-network";
import {
	planSnapshotLinkImport,
	type SkippedLink,
} from "@/lib/snapshot-links";
import {
	resolveWorkspaceAccess,
	type WorkspaceAccess,
} from "@/lib/workspace-access";
import {
	aggregateSiteEdges,
	checkLinkEditAccess,
	type LinkEnd,
	type LinkEndContext,
	type LinkValidationError,
	orientLink,
	portOccupant,
	toLinkView,
	validateNewLink,
	WORKSPACE_LINK_TYPES,
	type WorkspaceLinkRow,
	type WorkspaceLinkView,
} from "@/lib/workspace-links";
import {
	type SnapshotWorkspaceLink,
	workspaceSnapshotSchema,
} from "@/lib/workspace-snapshot-schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { apiTokensRouter } from "./api-tokens-router";
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

/* ── Workspace access (shared by getPermission and cross-workspace links) ── */

type WorkspaceWithAccess = {
	workspace: typeof schema.workspaces.$inferSelect;
	access: WorkspaceAccess;
};

/** Load workspaces and the caller's access to each. Missing ids are absent. */
async function loadWorkspaceAccess(
	workspaceIds: string[],
	userId: string | null,
): Promise<Map<string, WorkspaceWithAccess>> {
	const ids = [...new Set(workspaceIds)];
	const result = new Map<string, WorkspaceWithAccess>();
	if (ids.length === 0) return result;
	const rows = await db
		.select()
		.from(schema.workspaces)
		.where(inArray(schema.workspaces.id, ids));
	const memberOf = new Set<string>();
	if (userId) {
		const memberships = await db
			.select({ workspaceId: schema.workspaceMembers.workspaceId })
			.from(schema.workspaceMembers)
			.where(
				and(
					eq(schema.workspaceMembers.userId, userId),
					inArray(schema.workspaceMembers.workspaceId, ids),
				),
			);
		for (const m of memberships) memberOf.add(m.workspaceId);
	}
	for (const workspace of rows) {
		result.set(workspace.id, {
			workspace,
			access: resolveWorkspaceAccess(
				workspace,
				userId,
				memberOf.has(workspace.id),
			),
		});
	}
	return result;
}

type AccessLevel = "read" | "edit" | "owner";

const ACCESS_DENIED: Record<AccessLevel, string> = {
	read: "You cannot view this workspace",
	edit: "You need edit access to this workspace",
	owner: "Only the workspace owner can do this",
};

/**
 * Throw unless the caller has `level` access to the workspace: "read" for
 * owners, members and ownerless drafts; "edit" for owners, collaborators and
 * drafts; "owner" for the owner (or anyone on an ownerless draft).
 */
async function requireWorkspaceAccess(
	workspaceId: string,
	userId: string | null,
	level: AccessLevel,
): Promise<WorkspaceWithAccess> {
	const entry = (await loadWorkspaceAccess([workspaceId], userId)).get(
		workspaceId,
	);
	if (!entry) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });
	}
	const { access } = entry;
	const allowed =
		level === "read"
			? access.canRead
			: level === "edit"
				? access.canEdit
				: access.permission === "owner";
	if (!allowed) {
		throw new TRPCError({ code: "FORBIDDEN", message: ACCESS_DENIED[level] });
	}
	return entry;
}

/** The device, after checking the caller may edit its workspace. */
async function requireDeviceEdit(
	deviceId: string,
	userId: string | null,
): Promise<typeof schema.devices.$inferSelect> {
	const rows = await db
		.select()
		.from(schema.devices)
		.where(eq(schema.devices.id, deviceId));
	const device = rows[0];
	if (!device) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Device not found" });
	}
	await requireWorkspaceAccess(device.workspaceId, userId, "edit");
	return device;
}

/** The annotation, after checking the caller may edit its workspace. */
async function requireAnnotationEdit(
	annotationId: string,
	userId: string | null,
): Promise<typeof schema.annotations.$inferSelect> {
	const rows = await db
		.select()
		.from(schema.annotations)
		.where(eq(schema.annotations.id, annotationId));
	const annotation = rows[0];
	if (!annotation) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Annotation not found" });
	}
	await requireWorkspaceAccess(annotation.workspaceId, userId, "edit");
	return annotation;
}

/** True when an update payload sets at least one column. */
function hasValues(fields: Record<string, unknown>): boolean {
	return Object.values(fields).some((v) => v !== undefined);
}

function throwLinkError(err: LinkValidationError): never {
	throw new TRPCError({ code: err.code, message: err.message });
}

/** Cross-links touching any of the given devices. */
async function linksTouchingDevices(
	deviceIds: string[],
): Promise<WorkspaceLinkRow[]> {
	if (deviceIds.length === 0) return [];
	return db
		.select()
		.from(schema.workspaceLinks)
		.where(
			or(
				inArray(schema.workspaceLinks.deviceAId, deviceIds),
				inArray(schema.workspaceLinks.deviceBId, deviceIds),
			),
		);
}

/** Cross-links touching any of the given workspaces. */
async function linksTouchingWorkspaces(
	workspaceIds: string[],
): Promise<WorkspaceLinkRow[]> {
	if (workspaceIds.length === 0) return [];
	return db
		.select()
		.from(schema.workspaceLinks)
		.where(
			or(
				inArray(schema.workspaceLinks.workspaceAId, workspaceIds),
				inArray(schema.workspaceLinks.workspaceBId, workspaceIds),
			),
		);
}

/** Everything `validateNewLink` needs to know about one end. */
async function loadLinkEndContext(
	end: LinkEnd,
	access: WorkspaceAccess | null,
	extraLinks: WorkspaceLinkRow[] = [],
): Promise<LinkEndContext> {
	const deviceRows = await db
		.select()
		.from(schema.devices)
		.where(eq(schema.devices.id, end.deviceId));
	const connections = await db
		.select()
		.from(schema.connections)
		.where(
			or(
				eq(schema.connections.deviceAId, end.deviceId),
				eq(schema.connections.deviceBId, end.deviceId),
			),
		);
	const links = await linksTouchingDevices([end.deviceId]);
	return {
		access,
		device: deviceRows[0] ?? null,
		connections,
		links: [...links, ...extraLinks],
	};
}

/** Access to the far workspaces, and device names for the readable ones. */
async function farSideNames(
	links: WorkspaceLinkRow[],
	workspaceId: string,
	userId: string | null,
): Promise<{
	accessMap: Map<string, WorkspaceWithAccess>;
	deviceNames: Map<string, string>;
}> {
	const farEnds = links
		.map((l) => orientLink(l, workspaceId)?.far)
		.filter((e): e is LinkEnd => !!e);
	const accessMap = await loadWorkspaceAccess(
		farEnds.map((e) => e.workspaceId),
		userId,
	);
	const readableDeviceIds = farEnds
		.filter((e) => accessMap.get(e.workspaceId)?.access.canRead)
		.map((e) => e.deviceId);
	const deviceNames = new Map<string, string>();
	if (readableDeviceIds.length > 0) {
		const rows = await db
			.select({ id: schema.devices.id, name: schema.devices.name })
			.from(schema.devices)
			.where(inArray(schema.devices.id, [...new Set(readableDeviceIds)]));
		for (const r of rows) deviceNames.set(r.id, r.name);
	}
	return { accessMap, deviceNames };
}

function viewLink(
	link: WorkspaceLinkRow,
	workspaceId: string,
	accessMap: Map<string, WorkspaceWithAccess>,
	deviceNames: Map<string, string>,
): WorkspaceLinkView | null {
	const o = orientLink(link, workspaceId);
	if (!o) return null;
	const far = accessMap.get(o.far.workspaceId);
	const farInfo = far?.access.canRead
		? {
				workspaceName: far.workspace.name,
				deviceName: deviceNames.get(o.far.deviceId) ?? "Unknown device",
			}
		: null;
	return toLinkView(link, workspaceId, farInfo);
}

/**
 * Recreate a snapshot's cross-links after its devices were imported (see
 * `planSnapshotLinkImport` for the rules); skipped links come back with the
 * reason so the UI can report them.
 */
async function importSnapshotLinks(
	workspaceId: string,
	links: SnapshotWorkspaceLink[],
	deviceIdMap: Map<string, string>,
	userId: string | null,
): Promise<{ imported: number; skipped: SkippedLink[] }> {
	if (links.length === 0) return { imported: 0, skipped: [] };

	const accessMap = await loadWorkspaceAccess(
		[workspaceId, ...links.map((l) => l.remote.workspaceId)],
		userId,
	);
	const remoteDeviceIds = [...new Set(links.map((l) => l.remote.deviceId))];
	const [localDevices, localConnections, remoteDevices, remoteConnections, remoteLinks] =
		await Promise.all([
			db
				.select()
				.from(schema.devices)
				.where(eq(schema.devices.workspaceId, workspaceId)),
			db
				.select()
				.from(schema.connections)
				.where(eq(schema.connections.workspaceId, workspaceId)),
			db
				.select()
				.from(schema.devices)
				.where(inArray(schema.devices.id, remoteDeviceIds)),
			db
				.select()
				.from(schema.connections)
				.where(
					or(
						inArray(schema.connections.deviceAId, remoteDeviceIds),
						inArray(schema.connections.deviceBId, remoteDeviceIds),
					),
				),
			linksTouchingDevices(remoteDeviceIds),
		]);

	const plan = planSnapshotLinkImport({
		workspaceId,
		links,
		deviceIdMap,
		access: new Map(
			[...accessMap].map(([id, entry]) => [id, entry.access] as const),
		),
		localDevices,
		localConnections,
		remoteDevices,
		remoteConnections,
		remoteLinks,
	});
	if (plan.create.length > 0) {
		await db.insert(schema.workspaceLinks).values(
			plan.create.map((p) => ({
				id: crypto.randomUUID(),
				...p,
				createdBy: userId,
			})),
		);
	}
	return { imported: plan.create.length, skipped: plan.skipped };
}

/* ── Workspaces ── */

const workspacesRouter = {
	/** Workspaces owned by `ownerId`; callers only ever see their own. */
	list: publicProcedure
		.input(z.object({ ownerId: z.string() }))
		.query(({ input, ctx }) => {
			if (!ctx.userId || input.ownerId !== ctx.userId) return [];
			return db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.ownerId, input.ownerId));
		}),

	get: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const rows = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, input.id));
			return rows[0] ?? null;
		}),

	/** Get the current user's permission level for a workspace */
	getPermission: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ input, ctx }) => {
			const ws = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, input.workspaceId));
			const workspace = ws[0];
			if (!workspace) return { permission: "none" as const };

			// Ownerless drafts: anyone edits; members edit in collaboration mode
			const userId = ctx.userId;
			let isMember = false;
			if (userId && workspace.ownerId && workspace.ownerId !== userId) {
				const members = await db
					.select()
					.from(schema.workspaceMembers)
					.where(
						and(
							eq(schema.workspaceMembers.workspaceId, input.workspaceId),
							eq(schema.workspaceMembers.userId, userId),
						),
					);
				isMember = members.length > 0;
			}
			const { permission } = resolveWorkspaceAccess(
				workspace,
				userId,
				isMember,
			);
			return { permission, mode: workspace.mode };
		}),

	create: publicProcedure
		.input(z.object({ name: z.string().min(1), ownerId: z.string().optional() }))
		.mutation(async ({ input, ctx }) => {
			if (input.ownerId && input.ownerId !== ctx.userId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You can only create workspaces for yourself",
				});
			}
			const id = crypto.randomUUID();
			const rows = await db
				.insert(schema.workspaces)
				.values({ id, name: input.name, ownerId: input.ownerId ?? null })
				.returning();
			const row = rows[0];
			if (!row) throw new Error("Failed to create workspace");
			return row;
		}),

	/** Create an anonymous workspace (no owner) */
	createAnonymous: publicProcedure
		.input(z.object({ name: z.string().min(1).default("My Workspace") }))
		.mutation(async () => {
			const id = crypto.randomUUID();
			const rows = await db
				.insert(schema.workspaces)
				.values({ id, name: "My Workspace", ownerId: null })
				.returning();
			const row = rows[0];
			if (!row) throw new Error("Failed to create workspace");
			return row;
		}),

	/** Claim an ownerless workspace for the current signed-in user */
	claimOwnership: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			if (!ctx.userId) throw new Error("Must be signed in to claim a workspace");

			const ws = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, input.workspaceId));
			const workspace = ws[0];
			if (!workspace) throw new Error("Workspace not found");
			if (workspace.ownerId) throw new Error("Workspace already has an owner");

			const rows = await db
				.update(schema.workspaces)
				.set({ ownerId: ctx.userId })
				.where(eq(schema.workspaces.id, input.workspaceId))
				.returning();
			return rows[0] ?? null;
		}),

	/** Toggle workspace mode between presentation and collaboration */
	setMode: publicProcedure
		.input(z.object({ workspaceId: z.string(), mode: z.enum(["presentation", "collaboration"]) }))
		.mutation(async ({ input, ctx }) => {
			if (!ctx.userId) throw new Error("Must be signed in");

			const ws = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, input.workspaceId));
			const workspace = ws[0];
			if (!workspace) throw new Error("Workspace not found");
			if (workspace.ownerId !== ctx.userId) throw new Error("Only the owner can change workspace mode");

			const rows = await db
				.update(schema.workspaces)
				.set({ mode: input.mode })
				.where(eq(schema.workspaces.id, input.workspaceId))
				.returning();
			return rows[0] ?? null;
		}),

	/** Join a workspace via share link — auto-adds signed-in user as member */
	joinViaShare: publicProcedure
		.input(z.object({ token: z.string().min(8) }))
		.mutation(async ({ input, ctx }) => {
			if (!ctx.userId) return { joined: false, workspaceId: null };

			const shareRows = await db
				.select()
				.from(schema.workspaceShares)
				.where(eq(schema.workspaceShares.token, input.token));
			const share = shareRows[0];
			if (!share) throw new Error("Invalid share token");

			// Check if workspace exists
			const wsRows = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, share.workspaceId));
			const workspace = wsRows[0];
			if (!workspace) throw new Error("Workspace not found");

			// Don't add owner as member
			if (workspace.ownerId === ctx.userId) {
				return { joined: false, workspaceId: share.workspaceId };
			}

			// Check if already a member
			const existing = await db
				.select()
				.from(schema.workspaceMembers)
				.where(
					and(
						eq(schema.workspaceMembers.workspaceId, share.workspaceId),
						eq(schema.workspaceMembers.userId, ctx.userId),
					),
				);
			if (existing.length > 0) {
				return { joined: false, workspaceId: share.workspaceId };
			}

			const id = crypto.randomUUID();
			await db.insert(schema.workspaceMembers).values({
				id,
				workspaceId: share.workspaceId,
				userId: ctx.userId,
			});
			return { joined: true, workspaceId: share.workspaceId };
		}),

	/** List members of a workspace */
	listMembers: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ input, ctx }) => {
			/* Member names and emails are for the owner and members only */
			const entry = (
				await loadWorkspaceAccess([input.workspaceId], ctx.userId)
			).get(input.workspaceId);
			if (!entry?.access.canRead) return [];
			const members = await db
				.select({
					id: schema.workspaceMembers.id,
					userId: schema.workspaceMembers.userId,
					userName: schema.user.name,
					userEmail: schema.user.email,
					joinedAt: schema.workspaceMembers.joinedAt,
				})
				.from(schema.workspaceMembers)
				.innerJoin(schema.user, eq(schema.workspaceMembers.userId, schema.user.id))
				.where(eq(schema.workspaceMembers.workspaceId, input.workspaceId));
			return members;
		}),

	removeMember: publicProcedure
		.input(z.object({ workspaceId: z.string(), memberId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			if (!ctx.userId) throw new Error("Must be signed in");
			const wsRows = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, input.workspaceId));
			const ws = wsRows[0];
			if (!ws || ws.ownerId !== ctx.userId) throw new Error("Only the owner can remove members");
			await db
				.delete(schema.workspaceMembers)
				.where(eq(schema.workspaceMembers.id, input.memberId));
			return { success: true };
		}),

	listShares: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ input, ctx }) => {
			if (!ctx.userId) return [];
			const wsRows = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, input.workspaceId));
			const ws = wsRows[0];
			if (!ws || ws.ownerId !== ctx.userId) return [];
			const shares = await db
				.select()
				.from(schema.workspaceShares)
				.where(eq(schema.workspaceShares.workspaceId, input.workspaceId));
			return shares;
		}),

	deleteShare: publicProcedure
		.input(z.object({ shareId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			if (!ctx.userId) throw new Error("Must be signed in");
			const shareRows = await db
				.select()
				.from(schema.workspaceShares)
				.where(eq(schema.workspaceShares.id, input.shareId));
			const share = shareRows[0];
			if (!share) throw new Error("Share not found");
			const wsRows = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, share.workspaceId));
			const ws = wsRows[0];
			if (!ws || ws.ownerId !== ctx.userId) throw new Error("Only the owner can delete share links");
			await db
				.delete(schema.workspaceShares)
				.where(eq(schema.workspaceShares.id, input.shareId));
			return { success: true };
		}),

	listOwned: publicProcedure
		.query(async ({ ctx }) => {
			if (!ctx.userId) return [];
			const owned = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.ownerId, ctx.userId));
			const results = await Promise.all(
				owned.map(async (ws) => {
					const memberCount = await db
						.select({ count: sql<number>`count(*)` })
						.from(schema.workspaceMembers)
						.where(eq(schema.workspaceMembers.workspaceId, ws.id));
					const shareCount = await db
						.select({ count: sql<number>`count(*)` })
						.from(schema.workspaceShares)
						.where(eq(schema.workspaceShares.workspaceId, ws.id));
					return {
						...ws,
						memberCount: Number(memberCount[0]?.count ?? 0),
						shareCount: Number(shareCount[0]?.count ?? 0),
					};
				}),
			);
			return results;
		}),

	update: publicProcedure
		.input(z.object({ id: z.string(), name: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			await requireWorkspaceAccess(input.id, ctx.userId, "edit");
			const rows = await db
				.update(schema.workspaces)
				.set({ name: input.name })
				.where(eq(schema.workspaces.id, input.id))
				.returning();
			return rows[0] ?? null;
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ input, ctx }) => {
			await requireWorkspaceAccess(input.id, ctx.userId, "owner");
			return db
				.delete(schema.workspaces)
				.where(eq(schema.workspaces.id, input.id));
		}),

	createShare: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			if (!ctx.userId) throw new Error("Must be signed in to create a share link");

			const wsRows = await db
				.select()
				.from(schema.workspaces)
				.where(eq(schema.workspaces.id, input.workspaceId));
			const ws = wsRows[0];
			if (!ws) throw new Error("Workspace not found");
			if (ws.ownerId !== ctx.userId) throw new Error("Only the owner can share a workspace");

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
					createdBy: ctx.userId,
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
		.query(async ({ input, ctx }) => {
			await requireWorkspaceAccess(input.workspaceId, ctx.userId, "read");
			return buildWorkspaceSnapshot(db, input.workspaceId, ctx.userId);
		}),

	importSnapshot: publicProcedure
		.input(
			z.object({
				workspaceId: z.string(),
				snapshot: workspaceSnapshotSchema,
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await requireWorkspaceAccess(input.workspaceId, ctx.userId, "edit");

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

			/* Devices were just replaced (which dropped their old cross-links via
			   the FK cascade); recreate the snapshot's links where possible. */
			const linkReport = await importSnapshotLinks(
				input.workspaceId,
				input.snapshot.workspaceLinks ?? [],
				deviceIdMap,
				ctx.userId,
			);

			return {
				success: true,
				devicesImported: input.snapshot.devices.length,
				connectionsImported: input.snapshot.connections.length,
				linksImported: linkReport.imported,
				linksSkipped: linkReport.skipped,
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
		.mutation(async ({ input, ctx }) => {
			await requireWorkspaceAccess(input.workspaceId, ctx.userId, "edit");
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
		.mutation(async ({ input, ctx }) => {
			const device = await requireDeviceEdit(input.id, ctx.userId);
			const { id, ...fields } = input;
			if (!hasValues(fields)) return device;
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
		.mutation(async ({ input, ctx }) => {
			await requireDeviceEdit(input.id, ctx.userId);
			return db
				.update(schema.devices)
				.set({ positionX: input.positionX, positionY: input.positionY })
				.where(eq(schema.devices.id, input.id));
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ input, ctx }) => {
			await requireDeviceEdit(input.id, ctx.userId);
			return db.delete(schema.devices).where(eq(schema.devices.id, input.id));
		}),
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
		.mutation(async ({ input, ctx }) => {
			await requireWorkspaceAccess(input.workspaceId, ctx.userId, "edit");

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

			/* A port can only participate in one connection (except port 0 — virtual WiFi) */
			const existing = await db
				.select()
				.from(schema.connections)
				.where(eq(schema.connections.workspaceId, input.workspaceId));
			for (const conn of existing) {
				/* Port 0 is the virtual WiFi interface — multiple WiFi clients can share it */
				if (
					input.portA !== 0 &&
					((conn.deviceAId === input.deviceAId && conn.portA === input.portA) ||
					(conn.deviceBId === input.deviceAId && conn.portB === input.portA))
				) {
					throw new Error(`Port ${input.portA} on device A is already connected`);
				}
				if (
					input.portB !== 0 &&
					((conn.deviceAId === input.deviceBId && conn.portA === input.portB) ||
					(conn.deviceBId === input.deviceBId && conn.portB === input.portB))
				) {
					throw new Error(`Port ${input.portB} on device B is already connected`);
				}
			}

			/* A port used by a cross-workspace link counts as connected */
			const crossLinks = await linksTouchingDevices([
				input.deviceAId,
				input.deviceBId,
			]);
			if (portOccupant(input.deviceAId, input.portA, [], crossLinks)) {
				throw new Error(
					`Port ${input.portA} on device A is linked to another workspace`,
				);
			}
			if (portOccupant(input.deviceBId, input.portB, [], crossLinks)) {
				throw new Error(
					`Port ${input.portB} on device B is linked to another workspace`,
				);
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
		.mutation(async ({ input, ctx }) => {
			const rows = await db
				.select({ workspaceId: schema.connections.workspaceId })
				.from(schema.connections)
				.where(eq(schema.connections.id, input.id));
			const conn = rows[0];
			if (!conn) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Connection not found",
				});
			}
			await requireWorkspaceAccess(conn.workspaceId, ctx.userId, "edit");
			return db
				.delete(schema.connections)
				.where(eq(schema.connections.id, input.id));
		}),
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
		.mutation(async ({ input, ctx }) => {
			const device = await requireDeviceEdit(input.deviceId, ctx.userId);
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
				if (!input.ipAddress.includes("/")) {
					throw new Error(
						"IP address must include CIDR notation (e.g. 192.168.1.1/24)",
					);
				}
				if (!isValidCidr(input.ipAddress)) {
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
			if (input.gateway) {
				if (!isValidIp(input.gateway)) {
					throw new Error("Invalid gateway IP format");
				}
				// Validate gateway is in the same subnet as the port's IP
				const effectiveIp = input.ipAddress ?? match?.ipAddress ?? null;
				if (effectiveIp) {
					const portParsed = parseIp(effectiveIp);
					if (portParsed) {
						const gwPlain = stripCidr(input.gateway);
						const gwNum = parseIpv4(gwPlain);
						if (gwNum !== null && ((gwNum & portParsed.mask) >>> 0) !== portParsed.network) {
							throw new Error(
								`Gateway ${input.gateway} is not in subnet ${ipToString(portParsed.network)}/${portParsed.cidr}`,
							);
						}
					}
				}
			}

			/* ── DHCP range validation ── */
			const effectiveDhcpEnabled = input.dhcpEnabled ?? match?.dhcpEnabled ?? false;
			const effectiveDhcpStart =
				input.dhcpRangeStart ?? match?.dhcpRangeStart ?? null;
			const effectiveDhcpEnd = input.dhcpRangeEnd ?? match?.dhcpRangeEnd ?? null;
			const effectiveInterfaceIp = input.ipAddress ?? match?.ipAddress ?? null;

			// Only validate DHCP ranges when ranges are actually provided.
			// Enabling DHCP without ranges is allowed — user configures ranges next.
			if (effectiveDhcpStart || effectiveDhcpEnd) {
				if (effectiveDhcpEnabled) {
					if (!effectiveDhcpStart || !effectiveDhcpEnd) {
						throw new Error(
							"DHCP range requires both start and end addresses",
						);
					}
					if (!effectiveInterfaceIp) {
						throw new Error(
							"DHCP requires an interface IP in CIDR format",
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
		.mutation(async ({ input, ctx }) => {
			const device = await requireDeviceEdit(input.deviceId, ctx.userId);
			if (input.id) {
				/* Only a route of this (editable) device may be rewritten */
				const existing = await db
					.select({ deviceId: schema.routes.deviceId })
					.from(schema.routes)
					.where(eq(schema.routes.id, input.id));
				if (existing[0]?.deviceId !== device.id) {
					throw new TRPCError({ code: "NOT_FOUND", message: "Route not found" });
				}
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
		.mutation(async ({ input, ctx }) => {
			const rows = await db
				.select({ deviceId: schema.routes.deviceId })
				.from(schema.routes)
				.where(eq(schema.routes.id, input.id));
			const route = rows[0];
			if (!route) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Route not found" });
			}
			await requireDeviceEdit(route.deviceId, ctx.userId);
			return db.delete(schema.routes).where(eq(schema.routes.id, input.id));
		}),
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
		.mutation(async ({ input, ctx }) => {
			await requireWorkspaceAccess(input.workspaceId, ctx.userId, "edit");
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
		.mutation(async ({ input, ctx }) => {
			const annotation = await requireAnnotationEdit(input.id, ctx.userId);
			const { id, ...fields } = input;
			if (!hasValues(fields)) return annotation;
			const rows = await db
				.update(schema.annotations)
				.set(fields)
				.where(eq(schema.annotations.id, id))
				.returning();
			return rows[0] ?? null;
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ input, ctx }) => {
			await requireAnnotationEdit(input.id, ctx.userId);
			return db
				.delete(schema.annotations)
				.where(eq(schema.annotations.id, input.id));
		}),
} satisfies TRPCRouterRecord;

/* ── Cross-workspace links ── */

const linkEndInput = z.object({
	workspaceId: z.string(),
	deviceId: z.string(),
	port: z.number().int().min(1),
});

/** Most workspaces the linked-network walk will merge. */
const MAX_LINKED_WORKSPACES = 50;

const workspaceLinksRouter = {
	/**
	 * Links touching a workspace, seen from that workspace. The far side is a
	 * stub (workspace + device name + port) when the caller may read the far
	 * workspace, else a locked "linked workspace" stub without ids.
	 */
	list: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ input, ctx }) => {
			const links = await linksTouchingWorkspaces([input.workspaceId]);
			const { accessMap, deviceNames } = await farSideNames(
				links,
				input.workspaceId,
				ctx.userId,
			);
			return links
				.map((l) => viewLink(l, input.workspaceId, accessMap, deviceNames))
				.filter((v): v is WorkspaceLinkView => !!v);
		}),

	create: publicProcedure
		.input(
			z.object({
				a: linkEndInput,
				b: linkEndInput,
				linkType: z.enum(WORKSPACE_LINK_TYPES).default("wired"),
				label: z.string().max(120).nullable().optional(),
				speed: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const accessMap = await loadWorkspaceAccess(
				[input.a.workspaceId, input.b.workspaceId],
				ctx.userId,
			);
			const accessA = accessMap.get(input.a.workspaceId)?.access ?? null;
			const accessB = accessMap.get(input.b.workspaceId)?.access ?? null;
			const denied = checkLinkEditAccess(accessA, accessB);
			if (denied) throwLinkError(denied);

			const ctxA = await loadLinkEndContext(input.a, accessA);
			const ctxB = await loadLinkEndContext(input.b, accessB);
			const err = validateNewLink(input.a, input.b, ctxA, ctxB);
			if (err) throwLinkError(err);

			const rows = await db
				.insert(schema.workspaceLinks)
				.values({
					id: crypto.randomUUID(),
					workspaceAId: input.a.workspaceId,
					deviceAId: input.a.deviceId,
					portA: input.a.port,
					workspaceBId: input.b.workspaceId,
					deviceBId: input.b.deviceId,
					portB: input.b.port,
					linkType: input.linkType,
					label: input.label?.trim() || null,
					speed: input.speed ?? null,
					createdBy: ctx.userId,
				})
				.returning();
			const row = rows[0];
			if (!row) throw new Error("Failed to create link");
			return row;
		}),

	update: publicProcedure
		.input(
			z.object({
				id: z.string(),
				linkType: z.enum(WORKSPACE_LINK_TYPES).optional(),
				label: z.string().max(120).nullable().optional(),
				speed: z.string().nullable().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const existing = await db
				.select()
				.from(schema.workspaceLinks)
				.where(eq(schema.workspaceLinks.id, input.id));
			const link = existing[0];
			if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Link not found" });
			const accessMap = await loadWorkspaceAccess(
				[link.workspaceAId, link.workspaceBId],
				ctx.userId,
			);
			const denied = checkLinkEditAccess(
				accessMap.get(link.workspaceAId)?.access ?? null,
				accessMap.get(link.workspaceBId)?.access ?? null,
			);
			if (denied) throwLinkError(denied);

			const { id, ...fields } = input;
			const rows = await db
				.update(schema.workspaceLinks)
				.set({
					...fields,
					...(fields.label !== undefined
						? { label: fields.label?.trim() || null }
						: {}),
				})
				.where(eq(schema.workspaceLinks.id, id))
				.returning();
			return rows[0] ?? null;
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ input, ctx }) => {
			const existing = await db
				.select()
				.from(schema.workspaceLinks)
				.where(eq(schema.workspaceLinks.id, input.id));
			const link = existing[0];
			if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Link not found" });
			const accessMap = await loadWorkspaceAccess(
				[link.workspaceAId, link.workspaceBId],
				ctx.userId,
			);
			const denied = checkLinkEditAccess(
				accessMap.get(link.workspaceAId)?.access ?? null,
				accessMap.get(link.workspaceBId)?.access ?? null,
			);
			if (denied) throwLinkError(denied);
			await db
				.delete(schema.workspaceLinks)
				.where(eq(schema.workspaceLinks.id, input.id));
			return { success: true };
		}),

	/** Workspaces the caller can link into: owned, or joined in collaboration mode. */
	linkTargets: publicProcedure
		.input(z.object({ excludeWorkspaceId: z.string().optional() }))
		.query(async ({ input, ctx }) => {
			if (!ctx.userId) return [];
			const owned = await db
				.select({ id: schema.workspaces.id, name: schema.workspaces.name })
				.from(schema.workspaces)
				.where(eq(schema.workspaces.ownerId, ctx.userId));
			const joined = await db
				.select({ id: schema.workspaces.id, name: schema.workspaces.name })
				.from(schema.workspaceMembers)
				.innerJoin(
					schema.workspaces,
					eq(schema.workspaceMembers.workspaceId, schema.workspaces.id),
				)
				.where(
					and(
						eq(schema.workspaceMembers.userId, ctx.userId),
						eq(schema.workspaces.mode, "collaboration"),
					),
				);
			const seen = new Set<string>();
			return [...owned, ...joined]
				.filter((w) => {
					if (w.id === input.excludeWorkspaceId || seen.has(w.id)) return false;
					seen.add(w.id);
					return true;
				})
				.sort((a, b) => a.name.localeCompare(b.name));
		}),

	/** Devices of a workspace the caller can edit, with their occupied ports. */
	targetDevices: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ input, ctx }) => {
			const accessMap = await loadWorkspaceAccess([input.workspaceId], ctx.userId);
			if (!accessMap.get(input.workspaceId)?.access.canEdit) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You need edit access to that workspace",
				});
			}
			const devices = await db
				.select()
				.from(schema.devices)
				.where(eq(schema.devices.workspaceId, input.workspaceId));
			const connections = await db
				.select()
				.from(schema.connections)
				.where(eq(schema.connections.workspaceId, input.workspaceId));
			const links = await linksTouchingWorkspaces([input.workspaceId]);
			return devices
				.map((d) => {
					const usedPorts: number[] = [];
					for (let p = 1; p <= d.portCount; p++) {
						if (portOccupant(d.id, p, connections, links)) usedPorts.push(p);
					}
					return {
						id: d.id,
						name: d.name,
						deviceType: d.deviceType,
						color: d.color,
						portCount: d.portCount,
						usedPorts,
					};
				})
				.sort((a, b) => a.name.localeCompare(b.name));
		}),

	/**
	 * Site map: the caller's workspaces (owned + joined) as nodes and their
	 * cross-links aggregated into one edge per pair. A linked workspace the
	 * caller cannot read appears as a locked node with an opaque key.
	 */
	siteMap: publicProcedure.query(async ({ ctx }) => {
		if (!ctx.userId) return { nodes: [], edges: [] };
		const owned = await db
			.select()
			.from(schema.workspaces)
			.where(eq(schema.workspaces.ownerId, ctx.userId));
		const joined = await db
			.select({ workspace: schema.workspaces })
			.from(schema.workspaceMembers)
			.innerJoin(
				schema.workspaces,
				eq(schema.workspaceMembers.workspaceId, schema.workspaces.id),
			)
			.where(eq(schema.workspaceMembers.userId, ctx.userId));

		type SiteNode = {
			key: string;
			workspaceId: string | null;
			name: string;
			role: "owner" | "collaborator" | "viewer" | "linked" | "locked";
			deviceCount: number;
		};
		const nodes = new Map<string, SiteNode>();
		for (const w of owned) {
			nodes.set(w.id, {
				key: w.id,
				workspaceId: w.id,
				name: w.name,
				role: "owner",
				deviceCount: 0,
			});
		}
		for (const { workspace: w } of joined) {
			if (nodes.has(w.id)) continue;
			nodes.set(w.id, {
				key: w.id,
				workspaceId: w.id,
				name: w.name,
				role: w.mode === "collaboration" ? "collaborator" : "viewer",
				deviceCount: 0,
			});
		}

		const links = await linksTouchingWorkspaces([...nodes.keys()]);
		const outsideIds = new Set<string>();
		for (const l of links) {
			for (const wsId of [l.workspaceAId, l.workspaceBId]) {
				if (!nodes.has(wsId)) outsideIds.add(wsId);
			}
		}
		const outsideAccess = await loadWorkspaceAccess([...outsideIds], ctx.userId);
		const lockedKeys = new Map<string, string>();
		for (const wsId of outsideIds) {
			const entry = outsideAccess.get(wsId);
			if (entry?.access.canRead) {
				nodes.set(wsId, {
					key: wsId,
					workspaceId: wsId,
					name: entry.workspace.name,
					role: "linked",
					deviceCount: 0,
				});
			} else {
				const key = `locked-${lockedKeys.size + 1}`;
				lockedKeys.set(wsId, key);
				nodes.set(key, {
					key,
					workspaceId: null,
					name: "Linked workspace",
					role: "locked",
					deviceCount: 0,
				});
			}
		}

		const countedIds = [...nodes.values()]
			.map((n) => n.workspaceId)
			.filter((id): id is string => !!id);
		if (countedIds.length > 0) {
			const counts = await db
				.select({
					workspaceId: schema.devices.workspaceId,
					count: sql<number>`count(*)`,
				})
				.from(schema.devices)
				.where(inArray(schema.devices.workspaceId, countedIds))
				.groupBy(schema.devices.workspaceId);
			for (const c of counts) {
				const node = nodes.get(c.workspaceId);
				if (node) node.deviceCount = Number(c.count);
			}
		}

		const edges = aggregateSiteEdges(links, (wsId) =>
			nodes.has(wsId) ? wsId : (lockedKeys.get(wsId) ?? null),
		);
		return { nodes: [...nodes.values()], edges };
	}),

	/**
	 * Topology of every workspace reachable from `workspaceId` over
	 * cross-links that the caller may read, plus the links between them, for
	 * the union analyzer. Unreadable workspaces are left out and counted.
	 */
	linkedNetwork: publicProcedure
		.input(z.object({ workspaceId: z.string() }))
		.query(async ({ input, ctx }) => {
			const start = await loadWorkspaceAccess([input.workspaceId], ctx.userId);
			const startWs = start.get(input.workspaceId);
			if (!startWs) throw new TRPCError({ code: "NOT_FOUND", message: "Workspace not found" });

			/* Breadth-first over links, loading access for each new workspace */
			const access = new Map<string, WorkspaceWithAccess>(start);
			const allLinks = new Map<string, WorkspaceLinkRow>();
			let frontier = [input.workspaceId];
			const readable = new Set<string>([input.workspaceId]);
			while (frontier.length > 0 && readable.size < MAX_LINKED_WORKSPACES) {
				const links = await linksTouchingWorkspaces(frontier);
				for (const l of links) allLinks.set(l.id, l);
				const fresh = new Set<string>();
				for (const l of links) {
					for (const wsId of [l.workspaceAId, l.workspaceBId]) {
						if (!access.has(wsId)) fresh.add(wsId);
					}
				}
				const loaded = await loadWorkspaceAccess([...fresh], ctx.userId);
				for (const [id, entry] of loaded) access.set(id, entry);
				frontier = [];
				for (const id of fresh) {
					if (access.get(id)?.access.canRead && readable.size < MAX_LINKED_WORKSPACES) {
						readable.add(id);
						frontier.push(id);
					}
				}
			}

			const { workspaceIds, lockedCount } = collectLinkedWorkspaces(
				input.workspaceId,
				[...allLinks.values()],
				(id) => readable.has(id),
			);

			const devices = await db
				.select()
				.from(schema.devices)
				.where(inArray(schema.devices.workspaceId, workspaceIds));
			const deviceIds = devices.map((d) => d.id);
			const connections = await db
				.select()
				.from(schema.connections)
				.where(inArray(schema.connections.workspaceId, workspaceIds));
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

			const included = new Set(workspaceIds);
			const deviceWs = new Map(devices.map((d) => [d.id, d.workspaceId]));
			return {
				parts: workspaceIds.map((id) => ({
					workspace: {
						id,
						name: access.get(id)?.workspace.name ?? "Workspace",
					},
					devices: devices.filter((d) => d.workspaceId === id),
					connections: connections.filter((c) => c.workspaceId === id),
					interfaces: interfaces.filter((i) => deviceWs.get(i.deviceId) === id),
					routes: routes.filter((r) => deviceWs.get(r.deviceId) === id),
				})),
				links: [...allLinks.values()].filter(
					(l) => included.has(l.workspaceAId) && included.has(l.workspaceBId),
				),
				lockedCount,
			};
		}),
} satisfies TRPCRouterRecord;

/* ── Root router ── */

export const trpcRouter = createTRPCRouter({
	workspaces: workspacesRouter,
	devices: devicesRouter,
	connections: connectionsRouter,
	interfaces: interfacesRouter,
	routes: routesRouter,
	annotations: annotationsRouter,
	workspaceLinks: workspaceLinksRouter,
	apiTokens: apiTokensRouter,
});

export type TRPCRouter = typeof trpcRouter;
