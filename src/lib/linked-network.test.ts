import { describe, expect, it } from "vitest";
import {
	analyzeLinkedNetwork,
	buildUnionNetwork,
	collectLinkedWorkspaces,
	computeLinkedReachability,
	type WorkspaceTopology,
} from "@/lib/linked-network";
import type {
	ConnectionRow,
	DeviceRow,
	InterfaceRow,
	RouteRow,
} from "@/lib/topology-types";
import type { WorkspaceLinkRow } from "@/lib/workspace-links";

function device(
	id: string,
	workspaceId: string,
	deviceType: string,
	over: Partial<DeviceRow> = {},
): DeviceRow {
	return {
		id,
		workspaceId,
		name: id,
		deviceType,
		color: "#3b82f6",
		portCount: 4,
		positionX: 0,
		positionY: 0,
		maxSpeed: null,
		ipForwarding: false,
		createdAt: null,
		...over,
	};
}

function iface(
	deviceId: string,
	portNumber: number,
	ipAddress: string,
	over: Partial<InterfaceRow> = {},
): InterfaceRow {
	return {
		id: `if-${deviceId}-${portNumber}`,
		deviceId,
		portNumber,
		alias: null,
		reserved: false,
		reservedLabel: null,
		speed: null,
		vlan: null,
		ipAddress,
		macAddress: null,
		portMode: null,
		portRole: null,
		dhcpEnabled: false,
		dhcpRangeStart: null,
		dhcpRangeEnd: null,
		ssid: null,
		wifiPassword: null,
		natEnabled: false,
		gateway: null,
		createdAt: null,
		...over,
	};
}

function conn(
	id: string,
	workspaceId: string,
	deviceAId: string,
	portA: number,
	deviceBId: string,
	portB: number,
): ConnectionRow {
	return {
		id,
		workspaceId,
		deviceAId,
		portA,
		deviceBId,
		portB,
		speed: null,
		connectionType: "wired",
		createdAt: null,
	};
}

/*
 * Home:  [HA server p1 192.168.1.10] ── [home router p1 192.168.1.1 | p2 10.8.0.2]
 * VPS:   [VPS p1 10.8.0.1]  (route 192.168.1.0/24 via 10.8.0.2)
 * Cross-link (VPN): home router p2 ↔ VPS p1
 */
const home: WorkspaceTopology = {
	workspace: { id: "ws-home", name: "Home" },
	devices: [
		device("ha", "ws-home", "server", { name: "Home Assistant" }),
		device("home-router", "ws-home", "managed-router", {
			name: "Home router",
			ipForwarding: true,
		}),
	],
	connections: [conn("c-home", "ws-home", "ha", 1, "home-router", 1)],
	interfaces: [
		iface("ha", 1, "192.168.1.10/24", { gateway: "192.168.1.1" }),
		iface("home-router", 1, "192.168.1.1/24"),
		iface("home-router", 2, "10.8.0.2/24"),
	],
	routes: [],
};

const vpsRoute: RouteRow = {
	id: "r-vps",
	deviceId: "vps",
	destination: "192.168.1.0/24",
	nextHop: "10.8.0.2",
	interfacePort: null,
	metric: 100,
	createdAt: null,
};

const vps: WorkspaceTopology = {
	workspace: { id: "ws-vps", name: "VPS" },
	devices: [device("vps", "ws-vps", "server", { name: "VPS" })],
	connections: [],
	interfaces: [iface("vps", 1, "10.8.0.1/24")],
	routes: [vpsRoute],
};

const vpnLink: WorkspaceLinkRow = {
	id: "link-vpn",
	workspaceAId: "ws-home",
	deviceAId: "home-router",
	portA: 2,
	workspaceBId: "ws-vps",
	deviceBId: "vps",
	portB: 1,
	linkType: "vpn",
	label: "wg0",
	speed: null,
	createdBy: null,
	createdAt: null,
};

describe("buildUnionNetwork", () => {
	it("merges workspaces and adds cross-links as connections", () => {
		const u = buildUnionNetwork([home, vps], [vpnLink]);
		expect(u.devices.map((d) => d.id).sort()).toEqual([
			"ha",
			"home-router",
			"vps",
		]);
		expect(u.crossLinks).toBe(1);
		expect(u.connections.map((c) => c.id)).toContain("xlink:link-vpn");
		expect(u.workspaceOf.get("vps")?.name).toBe("VPS");
		expect(u.routes).toHaveLength(1);
	});

	it("drops a cross-link whose far workspace is not in the union", () => {
		const u = buildUnionNetwork([home], [vpnLink]);
		expect(u.crossLinks).toBe(0);
		expect(u.connections.some((c) => c.id.startsWith("xlink:"))).toBe(false);
	});
});

describe("union reachability", () => {
	it("the VPS reaches Home Assistant over the VPN cross-link", () => {
		const r = computeLinkedReachability("vps", [home, vps], [vpnLink]);
		expect(r.deviceStatus.get("vps")).toBe("focus");
		expect(r.deviceStatus.get("home-router")).toBe("l2");
		expect(r.deviceStatus.get("ha")).toBe("l3");
	});

	it("without the cross-link Home Assistant is unreachable", () => {
		const r = computeLinkedReachability("vps", [home, vps], []);
		expect(r.deviceStatus.get("ha")).toBe("unreachable");
	});
});

describe("analyzeLinkedNetwork", () => {
	it("tags every issue with the workspace it belongs to", () => {
		/* Office device with no IP produces at least one issue */
		const office: WorkspaceTopology = {
			workspace: { id: "ws-office", name: "Office" },
			devices: [device("office-pc", "ws-office", "pc", { name: "Office PC" })],
			connections: [],
			interfaces: [],
			routes: [],
		};
		const officeLink: WorkspaceLinkRow = {
			...vpnLink,
			id: "link-office",
			workspaceAId: "ws-office",
			deviceAId: "office-pc",
			portA: 1,
			workspaceBId: "ws-home",
			deviceBId: "home-router",
			portB: 3,
			linkType: "wan",
		};
		const a = analyzeLinkedNetwork([home, vps, office], [vpnLink, officeLink]);
		expect(a.union.crossLinks).toBe(2);
		expect(a.issues.length).toBeGreaterThan(0);
		for (const issue of a.issues) {
			expect(issue.workspaceName).toBe(
				a.union.workspaceOf.get(issue.deviceId)?.name ?? null,
			);
		}
		expect(a.issues.some((i) => i.workspaceName === "Office")).toBe(true);
		/* the VPN segment spans two workspaces */
		const tunnel = a.segments.find((s) =>
			s.ports.some((p) => p.deviceId === "vps"),
		);
		expect(tunnel?.ports.map((p) => p.deviceId).sort()).toEqual([
			"home-router",
			"vps",
		]);
	});
});

describe("collectLinkedWorkspaces", () => {
	const links = [
		{ workspaceAId: "home", workspaceBId: "vps" },
		{ workspaceAId: "vps", workspaceBId: "office" },
		{ workspaceAId: "home", workspaceBId: "hospital" },
	];

	it("walks links transitively", () => {
		const r = collectLinkedWorkspaces("home", links, () => true);
		expect(r.workspaceIds).toEqual(["home", "vps", "hospital", "office"]);
		expect(r.lockedCount).toBe(0);
	});

	it("skips and counts workspaces the viewer cannot read", () => {
		const r = collectLinkedWorkspaces("home", links, (id) => id !== "vps");
		expect(r.workspaceIds).toEqual(["home", "hospital"]);
		expect(r.lockedCount).toBe(1);
		expect(r.truncated).toBe(false);
	});

	it("reports readable workspaces left out by a cap as truncated, not locked", () => {
		const r = collectLinkedWorkspaces(
			"home",
			links,
			(id) => id !== "hospital",
			(id) => id === "home" || id === "vps",
		);
		expect(r.workspaceIds).toEqual(["home", "vps"]);
		expect(r.lockedCount).toBe(1);
		expect(r.truncated).toBe(true);
	});
});
