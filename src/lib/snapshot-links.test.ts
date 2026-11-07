import { describe, expect, it } from "vitest";
import {
	planSnapshotLinkImport,
	snapshotLinkFromView,
} from "@/lib/snapshot-links";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import { toLinkView, type WorkspaceLinkRow } from "@/lib/workspace-links";
import {
	safeParseWorkspaceSnapshot,
	type WorkspaceSnapshot,
} from "@/lib/workspace-snapshot-schema";

const OWNER = "user-owner";

const links: WorkspaceLinkRow[] = [
	{
		id: "l-vpn",
		workspaceAId: "ws-home",
		deviceAId: "old-router",
		portA: 2,
		workspaceBId: "ws-vps",
		deviceBId: "vps",
		portB: 1,
		linkType: "vpn",
		label: "wg0",
		speed: "1G",
		createdBy: OWNER,
		createdAt: null,
	},
	{
		id: "l-office",
		workspaceAId: "ws-office",
		deviceAId: "office-fw",
		portA: 4,
		workspaceBId: "ws-home",
		deviceBId: "old-router",
		portB: 3,
		linkType: "wan",
		label: null,
		speed: null,
		createdBy: OWNER,
		createdAt: null,
	},
];

function exportSnapshot(): WorkspaceSnapshot {
	const names: Record<string, { workspaceName: string; deviceName: string }> = {
		"l-vpn": { workspaceName: "VPS", deviceName: "VPS" },
		"l-office": { workspaceName: "Office", deviceName: "Office firewall" },
	};
	return {
		version: 1,
		exportedAt: "2026-11-07T00:00:00.000Z",
		workspace: { id: "ws-home", name: "Home" },
		devices: [
			{
				id: "old-router",
				name: "Home router",
				deviceType: "managed-router",
				color: "#3b82f6",
				portCount: 4,
				positionX: 0,
				positionY: 0,
			},
		],
		interfaces: [],
		connections: [],
		routes: [],
		annotations: [],
		workspaceLinks: links
			.map((l) => toLinkView(l, "ws-home", names[l.id] ?? null))
			.map((v) => (v ? snapshotLinkFromView(v) : null))
			.filter((e) => e !== null),
	};
}

const vpsDevice = {
	id: "vps",
	workspaceId: "ws-vps",
	portCount: 2,
	name: "VPS",
};
const officeFw = {
	id: "office-fw",
	workspaceId: "ws-office",
	portCount: 8,
	name: "Office firewall",
};
const newRouter = {
	id: "new-router",
	workspaceId: "ws-home-copy",
	portCount: 4,
	name: "Home router",
};

function owned() {
	return resolveWorkspaceAccess(
		{ ownerId: OWNER, mode: "presentation" },
		OWNER,
		false,
	);
}

describe("snapshot workspaceLinks", () => {
	it("exports links seen from the snapshot workspace", () => {
		const snap = exportSnapshot();
		expect(snap.workspaceLinks).toHaveLength(2);
		expect(snap.workspaceLinks?.[1]).toEqual({
			id: "l-office",
			linkType: "wan",
			label: null,
			speed: null,
			local: { deviceId: "old-router", port: 3 },
			remote: {
				workspaceId: "ws-office",
				workspaceName: "Office",
				deviceId: "office-fw",
				deviceName: "Office firewall",
				port: 4,
			},
		});
	});

	it("never exports a locked link", () => {
		const v = toLinkView(links[0] as WorkspaceLinkRow, "ws-home", null);
		expect(v && snapshotLinkFromView(v)).toBeNull();
	});

	it("round-trips through JSON and recreates links on import", () => {
		const json = JSON.parse(JSON.stringify(exportSnapshot())) as unknown;
		const parsed = safeParseWorkspaceSnapshot(json);
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;

		const plan = planSnapshotLinkImport({
			workspaceId: "ws-home-copy",
			links: parsed.data.workspaceLinks ?? [],
			deviceIdMap: new Map([["old-router", "new-router"]]),
			access: new Map([
				["ws-home-copy", owned()],
				["ws-vps", owned()],
				["ws-office", owned()],
			]),
			localDevices: [newRouter],
			localConnections: [],
			remoteDevices: [vpsDevice, officeFw],
			remoteConnections: [],
			remoteLinks: [],
		});
		expect(plan.skipped).toEqual([]);
		expect(plan.create).toEqual([
			{
				workspaceAId: "ws-home-copy",
				deviceAId: "new-router",
				portA: 2,
				workspaceBId: "ws-vps",
				deviceBId: "vps",
				portB: 1,
				linkType: "vpn",
				label: "wg0",
				speed: "1G",
			},
			{
				workspaceAId: "ws-home-copy",
				deviceAId: "new-router",
				portA: 3,
				workspaceBId: "ws-office",
				deviceBId: "office-fw",
				portB: 4,
				linkType: "wan",
				label: null,
				speed: null,
			},
		]);
	});

	it("reports skipped links: missing far side, no edit access, busy port", () => {
		const snap = exportSnapshot();
		const plan = planSnapshotLinkImport({
			workspaceId: "ws-home-copy",
			links: [
				...(snap.workspaceLinks ?? []),
				{
					id: "l-gone",
					local: { deviceId: "old-router", port: 4 },
					remote: { workspaceId: "ws-deleted", deviceId: "x", port: 1 },
				},
			],
			deviceIdMap: new Map([["old-router", "new-router"]]),
			access: new Map([
				["ws-home-copy", owned()],
				/* VPS: caller is an outsider now */
				[
					"ws-vps",
					resolveWorkspaceAccess(
						{ ownerId: "someone-else", mode: "presentation" },
						OWNER,
						false,
					),
				],
				["ws-office", owned()],
			]),
			localDevices: [newRouter],
			localConnections: [],
			remoteDevices: [vpsDevice, officeFw],
			/* office firewall port 4 is now cabled locally */
			remoteConnections: [
				{ deviceAId: "office-fw", portA: 4, deviceBId: "office-sw", portB: 1 },
			],
			remoteLinks: [],
		});
		expect(plan.create).toEqual([]);
		expect(plan.skipped.map((s) => [s.id, s.reason])).toEqual([
			["l-vpn", "You need edit access to both workspaces to change this link"],
			["l-office", "Port 4 on Office firewall is already connected"],
			["l-gone", "Linked workspace no longer exists"],
		]);
	});

	it("refuses two snapshot links on the same port", () => {
		const snap = exportSnapshot();
		const first = snap.workspaceLinks?.[0];
		if (!first) throw new Error("fixture");
		const plan = planSnapshotLinkImport({
			workspaceId: "ws-home-copy",
			links: [
				first,
				{ ...first, id: "dup", remote: { ...first.remote, port: 2 } },
			],
			deviceIdMap: new Map([["old-router", "new-router"]]),
			access: new Map([
				["ws-home-copy", owned()],
				["ws-vps", owned()],
			]),
			localDevices: [newRouter],
			localConnections: [],
			remoteDevices: [vpsDevice],
			remoteConnections: [],
			remoteLinks: [],
		});
		expect(plan.create).toHaveLength(1);
		expect(plan.skipped[0]?.reason).toMatch(
			/already linked to another workspace/,
		);
	});

	it("still accepts old snapshots without workspaceLinks and unknown fields", () => {
		const legacy = {
			version: 1,
			exportedAt: "2026-02-21T00:00:00.000Z",
			workspace: { name: "Office" },
			devices: [],
			interfaces: [],
			connections: [],
			routes: [],
			annotations: [],
			someFutureField: { x: 1 },
		};
		const parsed = safeParseWorkspaceSnapshot(legacy);
		expect(parsed.success).toBe(true);
		expect(parsed.success && parsed.data.workspaceLinks).toBeUndefined();
	});

	it("normalizes link types and defaults to wired", () => {
		const snap = {
			...exportSnapshot(),
			workspaceLinks: [
				{
					id: "a",
					linkType: " VPN ",
					local: { deviceId: "old-router", port: 1 },
					remote: { workspaceId: "ws-vps", deviceId: "vps", port: 2 },
				},
				{
					id: "b",
					local: { deviceId: "old-router", port: 2 },
					remote: { workspaceId: "ws-vps", deviceId: "vps", port: 1 },
				},
			],
		};
		const parsed = safeParseWorkspaceSnapshot(snap);
		expect(parsed.success).toBe(true);
		if (!parsed.success) return;
		expect(parsed.data.workspaceLinks?.map((l) => l.linkType)).toEqual([
			"vpn",
			undefined,
		]);
	});
});
