import {
    boolean,
    integer,
    pgTable,
    text,
    timestamp,
} from "drizzle-orm/pg-core"

/* ═══════════════════════════════════════════════════
   Better-Auth tables (user, session, account, verification)
   ═══════════════════════════════════════════════════ */

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
})

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
})

/* ═══════════════════════════════════════════════════
   CableOps tables
   ═══════════════════════════════════════════════════ */

export const workspaces = pgTable("workspaces", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	ownerId: text("owner_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	createdAt: timestamp("created_at").defaultNow(),
})

export const devices = pgTable("devices", {
	id: text("id").primaryKey(),
	workspaceId: text("workspace_id")
		.notNull()
		.references(() => workspaces.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	deviceType: text("device_type").notNull().default("switch"),
	color: text("color").notNull().default("#3b82f6"),
	portCount: integer("port_count").notNull().default(24),
	positionX: integer("position_x").notNull().default(100),
	positionY: integer("position_y").notNull().default(100),
	maxSpeed: text("max_speed"),
	/** Can this device forward packets between interfaces? (routers: always, PCs: optional) */
	ipForwarding: boolean("ip_forwarding").default(false),
	createdAt: timestamp("created_at").defaultNow(),
})

export const connections = pgTable("connections", {
	id: text("id").primaryKey(),
	workspaceId: text("workspace_id")
		.notNull()
		.references(() => workspaces.id, { onDelete: "cascade" }),
	deviceAId: text("device_a_id")
		.notNull()
		.references(() => devices.id, { onDelete: "cascade" }),
	portA: integer("port_a").notNull(),
	deviceBId: text("device_b_id")
		.notNull()
		.references(() => devices.id, { onDelete: "cascade" }),
	portB: integer("port_b").notNull(),
	speed: text("speed"),
	/** "wired" | "wifi" — determines visual representation */
	connectionType: text("connection_type").default("wired"),
	createdAt: timestamp("created_at").defaultNow(),
})

/**
 * Network interfaces — per-port configuration including IP, DHCP, WiFi, NAT.
 * Replaces the old port_configs + device-level networking fields.
 * Port 0 = management/loopback interface (for L2 switches, APs).
 */
export const interfaces = pgTable("interfaces", {
	id: text("id").primaryKey(),
	deviceId: text("device_id")
		.notNull()
		.references(() => devices.id, { onDelete: "cascade" }),
	portNumber: integer("port_number").notNull(),
	alias: text("alias"),
	reserved: boolean("reserved").notNull().default(false),
	reservedLabel: text("reserved_label"),
	speed: text("speed"),
	vlan: integer("vlan"),
	ipAddress: text("ip_address"),
	macAddress: text("mac_address"),
	/** Port mode: access | trunk | hybrid — only for L2 switch ports */
	portMode: text("port_mode"),
	/** Port role: uplink (WAN) | downlink (LAN) — determines traffic direction */
	portRole: text("port_role"),
	/** DHCP server on this interface */
	dhcpEnabled: boolean("dhcp_enabled").default(false),
	dhcpRangeStart: text("dhcp_range_start"),
	dhcpRangeEnd: text("dhcp_range_end"),
	/** WiFi SSID broadcast from this interface */
	ssid: text("ssid"),
	/** WiFi password for this interface */
	wifiPassword: text("wifi_password"),
	/** NAT masquerade on this interface (typically the outside/WAN interface) */
	natEnabled: boolean("nat_enabled").default(false),
	/** Default gateway IP reachable via this interface */
	gateway: text("gateway"),
	createdAt: timestamp("created_at").defaultNow(),
})

/**
 * Static routes — per-device routing table entries.
 */
export const routes = pgTable("routes", {
	id: text("id").primaryKey(),
	deviceId: text("device_id")
		.notNull()
		.references(() => devices.id, { onDelete: "cascade" }),
	/** Destination network in CIDR, e.g. "0.0.0.0/0" for default route */
	destination: text("destination").notNull(),
	/** Next-hop IP address */
	nextHop: text("next_hop").notNull(),
	/** Egress interface port number (optional — auto-resolved if null) */
	interfacePort: integer("interface_port"),
	/** Route metric / priority (lower = preferred) */
	metric: integer("metric").notNull().default(100),
	createdAt: timestamp("created_at").defaultNow(),
})

/**
 * Canvas annotations — barriers, rooms, walls, labels drawn
 * on the topology canvas for visualization.
 */
export const annotations = pgTable("annotations", {
	id: text("id").primaryKey(),
	workspaceId: text("workspace_id")
		.notNull()
		.references(() => workspaces.id, { onDelete: "cascade" }),
	/** rect | label */
	kind: text("kind").notNull().default("rect"),
	label: text("label"),
	x: integer("x").notNull().default(0),
	y: integer("y").notNull().default(0),
	width: integer("width").notNull().default(200),
	height: integer("height").notNull().default(150),
	color: text("color").notNull().default("#334155"),
	createdAt: timestamp("created_at").defaultNow(),
})
