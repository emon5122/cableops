import { describe, expect, it } from "vitest";
import { resolveWorkspaceAccess } from "@/lib/workspace-access";
import {
	aggregateSiteEdges,
	buildLinkedPortMap,
	checkLinkEditAccess,
	type LinkEndContext,
	LOCKED_LINK_LABEL,
	linkToConnection,
	portOccupant,
	toLinkView,
	validateNewLink,
	type WorkspaceLinkRow,
} from "@/lib/workspace-links";

const OWNER = "user-owner";
const OTHER = "user-other";

const home = { id: "ws-home", ownerId: OWNER, mode: "presentation" };
const vps = { id: "ws-vps", ownerId: OWNER, mode: "presentation" };
const office = { id: "ws-office", ownerId: OTHER, mode: "presentation" };
const officeCollab = { id: "ws-office", ownerId: OTHER, mode: "collaboration" };

const homeRouter = {
	id: "dev-home-router",
	workspaceId: home.id,
	portCount: 4,
	name: "Home router",
};
const vpsHost = {
	id: "dev-vps",
	workspaceId: vps.id,
	portCount: 2,
	name: "VPS",
};
const officeFw = {
	id: "dev-office-fw",
	workspaceId: office.id,
	portCount: 8,
	name: "Office firewall",
};

function link(over: Partial<WorkspaceLinkRow> = {}): WorkspaceLinkRow {
	return {
		id: "link-1",
		workspaceAId: home.id,
		deviceAId: homeRouter.id,
		portA: 1,
		workspaceBId: vps.id,
		deviceBId: vpsHost.id,
		portB: 1,
		linkType: "vpn",
		label: "wg0",
		speed: null,
		createdBy: OWNER,
		createdAt: null,
		...over,
	};
}

function ctx(
	device: LinkEndContext["device"],
	access: LinkEndContext["access"],
	over: Partial<LinkEndContext> = {},
): LinkEndContext {
	return { access, device, connections: [], links: [], ...over };
}

describe("resolveWorkspaceAccess", () => {
	it("owner edits, outsider neither edits nor reads", () => {
		expect(resolveWorkspaceAccess(home, OWNER, false)).toMatchObject({
			permission: "owner",
			canEdit: true,
			canRead: true,
		});
		expect(resolveWorkspaceAccess(home, OTHER, false)).toMatchObject({
			permission: "viewer",
			canEdit: false,
			canRead: false,
		});
		expect(resolveWorkspaceAccess(home, null, false).canRead).toBe(false);
	});

	it("member reads in presentation mode and edits in collaboration mode", () => {
		expect(resolveWorkspaceAccess(office, OWNER, true)).toMatchObject({
			permission: "viewer",
			canEdit: false,
			canRead: true,
		});
		expect(resolveWorkspaceAccess(officeCollab, OWNER, true)).toMatchObject({
			permission: "collaborator",
			canEdit: true,
			canRead: true,
		});
	});

	it("ownerless drafts stay editable by anyone, as before", () => {
		const draft = { ownerId: null, mode: "presentation" };
		expect(resolveWorkspaceAccess(draft, null, false).permission).toBe("owner");
		expect(resolveWorkspaceAccess(draft, OTHER, false).canEdit).toBe(true);
	});
});

describe("validateNewLink permissions", () => {
	const ownerHome = resolveWorkspaceAccess(home, OWNER, false);
	const ownerVps = resolveWorkspaceAccess(vps, OWNER, false);

	it("allows linking two workspaces the caller owns", () => {
		const err = validateNewLink(
			{ workspaceId: home.id, deviceId: homeRouter.id, port: 1 },
			{ workspaceId: vps.id, deviceId: vpsHost.id, port: 1 },
			ctx(homeRouter, ownerHome),
			ctx(vpsHost, ownerVps),
		);
		expect(err).toBeNull();
	});

	it("refuses linking into a workspace the caller cannot edit", () => {
		/* outsider */
		const outsider = resolveWorkspaceAccess(office, OWNER, false);
		const err = validateNewLink(
			{ workspaceId: home.id, deviceId: homeRouter.id, port: 1 },
			{ workspaceId: office.id, deviceId: officeFw.id, port: 1 },
			ctx(homeRouter, ownerHome),
			ctx(officeFw, outsider),
		);
		expect(err?.code).toBe("FORBIDDEN");

		/* member, but presentation mode = read only */
		const reader = resolveWorkspaceAccess(office, OWNER, true);
		expect(
			validateNewLink(
				{ workspaceId: home.id, deviceId: homeRouter.id, port: 1 },
				{ workspaceId: office.id, deviceId: officeFw.id, port: 1 },
				ctx(homeRouter, ownerHome),
				ctx(officeFw, reader),
			)?.code,
		).toBe("FORBIDDEN");

		/* missing workspace */
		expect(checkLinkEditAccess(ownerHome, null)?.code).toBe("FORBIDDEN");
	});

	it("allows a collaborator to link into a collaboration workspace", () => {
		const collab = resolveWorkspaceAccess(officeCollab, OWNER, true);
		expect(
			validateNewLink(
				{ workspaceId: home.id, deviceId: homeRouter.id, port: 2 },
				{ workspaceId: office.id, deviceId: officeFw.id, port: 1 },
				ctx(homeRouter, ownerHome),
				ctx(officeFw, collab),
			),
		).toBeNull();
	});

	it("refuses same-workspace links, foreign devices and missing ports", () => {
		expect(
			validateNewLink(
				{ workspaceId: home.id, deviceId: homeRouter.id, port: 1 },
				{ workspaceId: home.id, deviceId: homeRouter.id, port: 2 },
				ctx(homeRouter, ownerHome),
				ctx(homeRouter, ownerHome),
			)?.code,
		).toBe("BAD_REQUEST");
		/* device claimed to be in vps but lives in home */
		expect(
			validateNewLink(
				{ workspaceId: home.id, deviceId: homeRouter.id, port: 1 },
				{ workspaceId: vps.id, deviceId: homeRouter.id, port: 2 },
				ctx(homeRouter, ownerHome),
				ctx(homeRouter, ownerVps),
			)?.code,
		).toBe("BAD_REQUEST");
		expect(
			validateNewLink(
				{ workspaceId: home.id, deviceId: homeRouter.id, port: 9 },
				{ workspaceId: vps.id, deviceId: vpsHost.id, port: 1 },
				ctx(homeRouter, ownerHome),
				ctx(vpsHost, ownerVps),
			)?.message,
		).toMatch(/Port 9 does not exist/);
	});
});

describe("port double use", () => {
	const ownerHome = resolveWorkspaceAccess(home, OWNER, false);
	const ownerVps = resolveWorkspaceAccess(vps, OWNER, false);

	it("refuses a port that already carries a local connection", () => {
		const err = validateNewLink(
			{ workspaceId: home.id, deviceId: homeRouter.id, port: 1 },
			{ workspaceId: vps.id, deviceId: vpsHost.id, port: 1 },
			ctx(homeRouter, ownerHome, {
				connections: [
					{
						deviceAId: "dev-switch",
						portA: 3,
						deviceBId: homeRouter.id,
						portB: 1,
					},
				],
			}),
			ctx(vpsHost, ownerVps),
		);
		expect(err?.code).toBe("CONFLICT");
		expect(err?.message).toMatch(/already connected/);
	});

	it("refuses a port that already carries another cross-link", () => {
		const existing = link({ id: "link-0", deviceBId: vpsHost.id, portB: 1 });
		const err = validateNewLink(
			{ workspaceId: office.id, deviceId: officeFw.id, port: 1 },
			{ workspaceId: vps.id, deviceId: vpsHost.id, port: 1 },
			ctx(officeFw, resolveWorkspaceAccess(officeCollab, OWNER, true)),
			ctx(vpsHost, ownerVps, { links: [existing] }),
		);
		expect(err?.code).toBe("CONFLICT");
		expect(err?.message).toMatch(/linked to another workspace/);
	});

	it("treats a cross-linked port as connected for local connections", () => {
		const l = link();
		expect(portOccupant(homeRouter.id, 1, [], [l])).toBe("link");
		expect(portOccupant(vpsHost.id, 1, [], [l])).toBe("link");
		expect(portOccupant(homeRouter.id, 2, [], [l])).toBeNull();
		/* the link being edited does not block itself */
		expect(portOccupant(homeRouter.id, 1, [], [l], l.id)).toBeNull();
	});

	it("keeps port 0 (virtual WiFi) shareable, as for connections", () => {
		const l = link({ portA: 0 });
		expect(portOccupant(homeRouter.id, 0, [], [l])).toBeNull();
	});
});

describe("link views", () => {
	it("shows the far side stub when the viewer can read it", () => {
		const v = toLinkView(link(), home.id, {
			workspaceName: "VPS",
			deviceName: "VPS",
		});
		expect(v?.local).toEqual({ deviceId: homeRouter.id, port: 1 });
		expect(v?.far).toEqual({
			locked: false,
			workspaceId: vps.id,
			workspaceName: "VPS",
			deviceId: vpsHost.id,
			deviceName: "VPS",
			port: 1,
		});
	});

	it("orients from either side", () => {
		const v = toLinkView(link(), vps.id, {
			workspaceName: "Home",
			deviceName: "Home router",
		});
		expect(v?.local.deviceId).toBe(vpsHost.id);
		expect(v?.far).toMatchObject({ locked: false, workspaceId: home.id });
	});

	it("gives a viewer without read access a locked stub without ids", () => {
		const v = toLinkView(link(), home.id, null);
		expect(v?.far).toEqual({ locked: true, label: LOCKED_LINK_LABEL });
		expect(JSON.stringify(v)).not.toContain(vps.id);
		expect(JSON.stringify(v)).not.toContain(vpsHost.id);
	});

	it("returns null for a link that does not touch the workspace", () => {
		expect(toLinkView(link(), office.id, null)).toBeNull();
	});

	it("indexes linked ports for the canvas", () => {
		const v = toLinkView(link(), home.id, null);
		const map = buildLinkedPortMap(v ? [v] : []);
		expect(map.get(`${homeRouter.id}:1`)?.id).toBe("link-1");
	});
});

describe("linkToConnection and site edges", () => {
	it("maps link types onto analyzer connection types", () => {
		expect(linkToConnection(link({ linkType: "vpn" })).connectionType).toBe(
			"wired",
		);
		expect(linkToConnection(link({ linkType: "wifi" })).connectionType).toBe(
			"wifi",
		);
		expect(linkToConnection(link()).id).toBe("xlink:link-1");
	});

	it("aggregates links per workspace pair with count and types", () => {
		const edges = aggregateSiteEdges(
			[
				link({ id: "a", linkType: "vpn" }),
				link({
					id: "b",
					workspaceAId: vps.id,
					workspaceBId: home.id,
					linkType: "wan",
				}),
				link({ id: "c", linkType: "vpn" }),
				link({ id: "d", workspaceBId: office.id }),
			],
			(id) => (id === office.id ? null : id),
		);
		expect(edges).toHaveLength(1);
		expect(edges[0]).toMatchObject({ count: 3 });
		expect(edges[0]?.types.sort()).toEqual(["vpn", "wan"]);
	});
});
