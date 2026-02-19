import type { ConnectionRow, DeviceRow, PortConfigRow } from "@/lib/topology-types"
import { DEVICE_TYPE_LABELS, negotiatedSpeed } from "@/lib/topology-types"
import {
    ArrowRight,
    CircleDot,
    GitBranch,
    Layers,
    Network,
    Search,
    Server,
    Wifi
} from "lucide-react"
import { useMemo, useState } from "react"

interface NetworkInsightsProps {
	devices: DeviceRow[]
	connections: ConnectionRow[]
	portConfigs: PortConfigRow[]
	onHighlightDevices?: (ids: string[]) => void
}

type InsightTab = "vlan" | "trace" | "stats" | "ping" | "subnets"

/* ── Helpers ── */

function getConnectedDevices(
	deviceId: string,
	connections: ConnectionRow[],
): { peerId: string; peerPort: number; localPort: number; connId: string }[] {
	return connections
		.filter((c) => c.deviceAId === deviceId || c.deviceBId === deviceId)
		.map((c) => {
			const isA = c.deviceAId === deviceId
			return {
				peerId: isA ? c.deviceBId : c.deviceAId,
				peerPort: isA ? c.portB : c.portA,
				localPort: isA ? c.portA : c.portB,
				connId: c.id,
			}
		})
}

/** BFS to find all devices reachable from a starting device */
function traceReachable(
	startId: string,
	connections: ConnectionRow[],
): string[] {
	const visited = new Set<string>()
	const queue = [startId]
	while (queue.length > 0) {
		const current = queue.shift()!
		if (visited.has(current)) continue
		visited.add(current)
		const neighbors = getConnectedDevices(current, connections)
		for (const n of neighbors) {
			if (!visited.has(n.peerId)) queue.push(n.peerId)
		}
	}
	return Array.from(visited)
}

/** Find the shortest path (BFS) between two devices */
function findPath(
	fromId: string,
	toId: string,
	connections: ConnectionRow[],
): string[] | null {
	if (fromId === toId) return [fromId]
	const visited = new Set<string>()
	const parentMap = new Map<string, string>()
	const queue = [fromId]
	visited.add(fromId)

	while (queue.length > 0) {
		const current = queue.shift()!
		const neighbors = getConnectedDevices(current, connections)
		for (const n of neighbors) {
			if (visited.has(n.peerId)) continue
			visited.add(n.peerId)
			parentMap.set(n.peerId, current)
			if (n.peerId === toId) {
				// reconstruct path
				const path: string[] = [toId]
				let node = toId
				while (parentMap.has(node)) {
					node = parentMap.get(node)!
					path.unshift(node)
				}
				return path
			}
			queue.push(n.peerId)
		}
	}
	return null
}

/* ── IP/Subnet helpers ── */

function parseIp(ipCidr: string): { ip: number; cidr: number; network: number; mask: number } | null {
	const m = ipCidr.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/)
	if (!m) return null
	const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
	if (octets.some((o) => o > 255)) return null
	const cidr = Number(m[5])
	if (cidr > 32) return null
	const ip = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0
	const mask = cidr > 0 ? (~0 << (32 - cidr)) >>> 0 : 0
	const network = (ip & mask) >>> 0
	return { ip, cidr, network, mask }
}

function ipToString(n: number): string {
	return `${(n >>> 24) & 255}.${(n >>> 16) & 255}.${(n >>> 8) & 255}.${n & 255}`
}

function sameSubnet(a: string, b: string): boolean {
	const pa = parseIp(a)
	const pb = parseIp(b)
	if (!pa || !pb) return false
	// Use the smaller (more inclusive) CIDR to check subnet match
	const cidr = Math.min(pa.cidr, pb.cidr)
	const mask = cidr > 0 ? (~0 << (32 - cidr)) >>> 0 : 0
	return ((pa.ip & mask) >>> 0) === ((pb.ip & mask) >>> 0)
}

interface PingHop {
	deviceId: string
	deviceName: string
	portNumber: number
	ipAddress: string | null
	color: string
	latency: number
}

interface PingResult {
	success: boolean
	hops: PingHop[]
	message: string
	totalLatency: number
}

export default function NetworkInsights({
	devices,
	connections,
	portConfigs,
}: NetworkInsightsProps) {
	const [tab, setTab] = useState<InsightTab>("vlan")
	const [selectedVlan, setSelectedVlan] = useState<number | null>(null)
	const [traceFrom, setTraceFrom] = useState("")
	const [traceTo, setTraceTo] = useState("")
	const [traceMode, setTraceMode] = useState<"reachable" | "path">("reachable")
	const [pingFrom, setPingFrom] = useState("")
	const [pingTo, setPingTo] = useState("")
	const [pingResult, setPingResult] = useState<PingResult | null>(null)
	const [isPinging, setIsPinging] = useState(false)

	/* ── VLAN data ── */
	const vlanMap = useMemo(() => {
		const m = new Map<number, { deviceId: string; portNumber: number; alias: string | null }[]>()
		for (const pc of portConfigs) {
			if (pc.vlan != null) {
				const list = m.get(pc.vlan) ?? []
				list.push({ deviceId: pc.deviceId, portNumber: pc.portNumber, alias: pc.alias })
				m.set(pc.vlan, list)
			}
		}
		return m
	}, [portConfigs])

	const vlanIds = useMemo(() => Array.from(vlanMap.keys()).sort((a, b) => a - b), [vlanMap])

	const selectedVlanPorts = selectedVlan != null ? vlanMap.get(selectedVlan) ?? [] : []
	const vlanDeviceIds = useMemo(
		() => [...new Set(selectedVlanPorts.map((p) => p.deviceId))],
		[selectedVlanPorts],
	)

	/* ── Trace results ── */
	const traceResult = useMemo(() => {
		if (!traceFrom) return null
		if (traceMode === "reachable") {
			const ids = traceReachable(traceFrom, connections)
			return { type: "reachable" as const, ids }
		}
		if (traceTo) {
			const path = findPath(traceFrom, traceTo, connections)
			return { type: "path" as const, path }
		}
		return null
	}, [traceFrom, traceTo, traceMode, connections])

	/* ── Stats data ── */
	const stats = useMemo(() => {
		const deviceStats = devices.map((d) => {
			const conns = getConnectedDevices(d.id, connections)
			const usedPorts = conns.length
			const configs = portConfigs.filter((pc) => pc.deviceId === d.id)
			const vlans = new Set(configs.filter((c) => c.vlan != null).map((c) => c.vlan!))
			const reservedCount = configs.filter((c) => c.reserved).length

			// Calculate min speed across connections
			const speeds = conns.map((c) => {
				const pcLocal = portConfigs.find((pc) => pc.deviceId === d.id && pc.portNumber === c.localPort)
				const pcPeer = portConfigs.find((pc) => pc.deviceId === c.peerId && pc.portNumber === c.peerPort)
				return negotiatedSpeed(pcLocal?.speed, pcPeer?.speed)
			}).filter(Boolean) as string[]

			return {
				device: d,
				usedPorts,
				totalPorts: d.portCount,
				utilization: d.portCount > 0 ? Math.round((usedPorts / d.portCount) * 100) : 0,
				vlans: Array.from(vlans).sort((a, b) => a - b),
				reservedCount,
				neighborCount: new Set(conns.map((c) => c.peerId)).size,
				speeds,
			}
		})
		return deviceStats.sort((a, b) => b.utilization - a.utilization)
	}, [devices, connections, portConfigs])

	const totalPorts = stats.reduce((sum, s) => sum + s.totalPorts, 0)
	const usedPorts = stats.reduce((sum, s) => sum + s.usedPorts, 0)
	const overallUtil = totalPorts > 0 ? Math.round((usedPorts / totalPorts) * 100) : 0

	/* ── Subnet data ── */
	const subnetMap = useMemo(() => {
		const m = new Map<string, { network: string; cidr: number; mask: string; ports: { deviceId: string; portNumber: number; ip: string; alias: string | null }[] }>()
		for (const pc of portConfigs) {
			if (!pc.ipAddress) continue
			const parsed = parseIp(pc.ipAddress)
			if (!parsed) continue
			const key = `${ipToString(parsed.network)}/${parsed.cidr}`
			const existing = m.get(key) ?? {
				network: ipToString(parsed.network),
				cidr: parsed.cidr,
				mask: ipToString(parsed.mask),
				ports: [],
			}
			existing.ports.push({ deviceId: pc.deviceId, portNumber: pc.portNumber, ip: pc.ipAddress, alias: pc.alias })
			m.set(key, existing)
		}
		return m
	}, [portConfigs])

	const subnetKeys = useMemo(() => Array.from(subnetMap.keys()).sort(), [subnetMap])

	/* ── Ports that have IP addresses (for ping source/dest) ── */
	const portsWithIp = useMemo(() => {
		return portConfigs
			.filter((pc) => pc.ipAddress)
			.map((pc) => {
				const dev = devices.find((d) => d.id === pc.deviceId)
				return { ...pc, deviceName: dev?.name ?? "Unknown", deviceColor: dev?.color ?? "#888" }
			})
	}, [portConfigs, devices])

	/* ── Ping simulation ── */
	const runPing = useCallback(() => {
		if (!pingFrom || !pingTo) return
		setIsPinging(true)
		setPingResult(null)

		// Find source and destination port configs
		const srcPc = portConfigs.find((pc) => `${pc.deviceId}:${pc.portNumber}` === pingFrom)
		const dstPc = portConfigs.find((pc) => `${pc.deviceId}:${pc.portNumber}` === pingTo)

		if (!srcPc?.ipAddress || !dstPc?.ipAddress) {
			setTimeout(() => {
				setPingResult({ success: false, hops: [], message: "Source and destination must have IP addresses", totalLatency: 0 })
				setIsPinging(false)
			}, 500)
			return
		}

		// Find path via BFS
		const path = findPath(srcPc.deviceId, dstPc.deviceId, connections)

		if (!path) {
			setTimeout(() => {
				setPingResult({ success: false, hops: [], message: `No route to host — ${ipToString(parseIp(dstPc.ipAddress!)?.ip ?? 0)} is unreachable`, totalLatency: 0 })
				setIsPinging(false)
			}, 800)
			return
		}

		// Build hop-by-hop trace
		const hops: PingHop[] = []
		let subnetOk = true

		for (let i = 0; i < path.length; i++) {
			const devId = path[i]
			const dev = devices.find((d) => d.id === devId)

			// Find which port connects to the next hop
			let portNum = 0
			let portIp: string | null = null

			if (i === 0) {
				portNum = srcPc.portNumber
				portIp = srcPc.ipAddress
			} else if (i === path.length - 1) {
				portNum = dstPc.portNumber
				portIp = dstPc.ipAddress
			} else {
				// Intermediate: find port connecting toward destination
				const nextDev = path[i + 1]
				const conn = connections.find(
					(c) =>
						(c.deviceAId === devId && c.deviceBId === nextDev) ||
						(c.deviceBId === devId && c.deviceAId === nextDev),
				)
				if (conn) {
					portNum = conn.deviceAId === devId ? conn.portA : conn.portB
				}
				const pc = portConfigs.find((p) => p.deviceId === devId && p.portNumber === portNum)
				portIp = pc?.ipAddress ?? null
			}

			// Simulate latency: base + random jitter
			const latency = Math.round(0.5 + Math.random() * 2 + i * 0.3)

			hops.push({
				deviceId: devId,
				deviceName: dev?.name ?? "Unknown",
				portNumber: portNum,
				ipAddress: portIp,
				color: dev?.color ?? "#888",
				latency,
			})
		}

		// Check subnet compatibility at edge hops
		if (hops.length >= 2) {
			const srcIp = hops[0].ipAddress
			const dstIp = hops[hops.length - 1].ipAddress
			if (srcIp && dstIp && !sameSubnet(srcIp, dstIp)) {
				// Check if there's an intermediate router (any device with IPs in both subnets)
				const hasRouter = hops.slice(1, -1).some((h) => {
					const devPorts = portConfigs.filter((pc) => pc.deviceId === h.deviceId && pc.ipAddress)
					return devPorts.some((dp) => dp.ipAddress && sameSubnet(dp.ipAddress, srcIp!)) &&
						devPorts.some((dp) => dp.ipAddress && sameSubnet(dp.ipAddress, dstIp!))
				})
				if (!hasRouter) subnetOk = false
			}
		}

		const totalLatency = hops.reduce((sum, h) => sum + h.latency, 0)

		// Simulate async ping with delays
		setTimeout(() => {
			if (!subnetOk) {
				setPingResult({
					success: false,
					hops,
					message: `Destination host unreachable — different subnets with no router in path`,
					totalLatency,
				})
			} else {
				setPingResult({
					success: true,
					hops,
					message: `Reply from ${dstPc.ipAddress!.split("/")[0]}: ${hops.length - 1} hop${hops.length - 1 !== 1 ? "s" : ""}, time=${totalLatency}ms`,
					totalLatency,
				})
			}
			setIsPinging(false)
		}, 600 + path.length * 200)
	}, [pingFrom, pingTo, portConfigs, connections, devices])

	const getDevice = (id: string) => devices.find((d) => d.id === id)

	const tabs: { key: InsightTab; label: string; icon: typeof Layers }[] = [
		{ key: "vlan", label: "VLAN Explorer", icon: Layers },
		{ key: "trace", label: "Connection Tracer", icon: GitBranch },
		{ key: "ping", label: "Ping Simulator", icon: Radio },
		{ key: "subnets", label: "Subnet Map", icon: Globe },
		{ key: "stats", label: "Port Stats", icon: Server },
	]

	return (
		<div className="flex-1 overflow-auto bg-(--app-bg) p-4">
			{/* Tab switcher */}
			<div className="flex items-center gap-2 mb-4">
				{tabs.map((t) => (
					<button
						key={t.key}
						type="button"
						className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
							tab === t.key
								? "bg-(--app-surface-hover) text-white"
								: "text-(--app-text-muted) hover:text-white hover:bg-(--app-surface)"
						}`}
						onClick={() => setTab(t.key)}
					>
						<t.icon size={13} />
						{t.label}
					</button>
				))}
			</div>

			{/* ── VLAN Explorer ── */}
			{tab === "vlan" && (
				<div className="space-y-4">
					{vlanIds.length === 0 ? (
						<div className="text-center py-12 text-(--app-text-muted)">
							<Layers size={32} className="mx-auto mb-3 opacity-30" />
							<p className="text-sm font-medium">No VLANs configured</p>
							<p className="text-xs mt-1">Right-click a port to assign a VLAN</p>
						</div>
					) : (
						<>
							<div className="flex flex-wrap gap-2">
								{vlanIds.map((vlan) => {
									const ports = vlanMap.get(vlan) ?? []
									const devCount = new Set(ports.map((p) => p.deviceId)).size
									return (
										<button
											key={vlan}
											type="button"
											className={`px-3 py-2 rounded-lg border text-sm font-mono transition-all ${
												selectedVlan === vlan
													? "bg-cyan-500/20 border-cyan-500 text-cyan-300"
													: "bg-(--app-surface) border-(--app-border) text-(--app-text) hover:border-(--app-border-light)"
											}`}
											onClick={() => setSelectedVlan(selectedVlan === vlan ? null : vlan)}
										>
											<div className="font-bold">VLAN {vlan}</div>
											<div className="text-[10px] text-(--app-text-muted)">
												{ports.length} port{ports.length !== 1 ? "s" : ""} · {devCount} device{devCount !== 1 ? "s" : ""}
											</div>
										</button>
									)
								})}
							</div>

							{selectedVlan != null && (
								<div className="bg-(--app-surface) rounded-lg border border-(--app-border) overflow-hidden">
									<div className="px-4 py-2.5 border-b border-(--app-border) flex items-center gap-2">
										<Layers size={14} className="text-cyan-400" />
										<span className="text-sm font-bold text-(--app-text)">
											VLAN {selectedVlan} — {selectedVlanPorts.length} port{selectedVlanPorts.length !== 1 ? "s" : ""} across {vlanDeviceIds.length} device{vlanDeviceIds.length !== 1 ? "s" : ""}
										</span>
									</div>
									<div className="divide-y divide-(--app-border)">
										{vlanDeviceIds.map((devId) => {
											const dev = getDevice(devId)
											if (!dev) return null
											const devPorts = selectedVlanPorts.filter((p) => p.deviceId === devId)
											return (
												<div key={devId} className="px-4 py-2.5 flex items-center gap-3">
													<div
														className="w-3 h-3 rounded-sm shrink-0"
														style={{ backgroundColor: dev.color }}
													/>
													<div className="flex-1 min-w-0">
														<div className="text-sm font-medium text-(--app-text) truncate">
															{dev.name}
															<span className="text-(--app-text-dim) text-xs ml-1.5">
																{DEVICE_TYPE_LABELS[dev.deviceType as keyof typeof DEVICE_TYPE_LABELS] ?? dev.deviceType}
															</span>
														</div>
														<div className="flex flex-wrap gap-1.5 mt-1">
															{devPorts.map((p) => (
																<span
																	key={p.portNumber}
																	className="px-1.5 py-0.5 bg-cyan-500/15 text-cyan-300 text-[10px] font-mono rounded"
																>
																	P{p.portNumber}{p.alias ? ` (${p.alias})` : ""}
																</span>
															))}
														</div>
													</div>
												</div>
											)
										})}
									</div>
								</div>
							)}
						</>
					)}
				</div>
			)}

			{/* ── Connection Tracer ── */}
			{tab === "trace" && (
				<div className="space-y-4">
					<div className="bg-(--app-surface) rounded-lg border border-(--app-border) p-4 space-y-3">
						<div className="flex items-center gap-2 mb-1">
							<Search size={14} className="text-(--app-text-muted)" />
							<span className="text-sm font-semibold text-(--app-text)">Trace Configuration</span>
						</div>

						{/* Mode toggle */}
						<div className="flex gap-2">
							<button
								type="button"
								className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
									traceMode === "reachable"
										? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
										: "bg-(--app-input-bg) border-(--app-border) text-(--app-text-muted)"
								}`}
								onClick={() => setTraceMode("reachable")}
							>
								<Network size={12} className="inline mr-1" />
								All Reachable
							</button>
							<button
								type="button"
								className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
									traceMode === "path"
										? "bg-violet-500/20 border-violet-500 text-violet-300"
										: "bg-(--app-input-bg) border-(--app-border) text-(--app-text-muted)"
								}`}
								onClick={() => setTraceMode("path")}
							>
								<GitBranch size={12} className="inline mr-1" />
								Shortest Path
							</button>
						</div>

						{/* Device selectors */}
						<div className="flex items-center gap-2">
							<div className="flex-1">
								<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-1">
									{traceMode === "reachable" ? "From Device" : "Source"}
								</label>
								<select
									value={traceFrom}
									onChange={(e) => setTraceFrom(e.target.value)}
									className="w-full h-8 text-sm rounded-md bg-(--app-input-bg) border border-(--app-border) text-(--app-text) px-2"
								>
									<option value="">Select device…</option>
									{devices.map((d) => (
										<option key={d.id} value={d.id}>
											{d.name} ({DEVICE_TYPE_LABELS[d.deviceType as keyof typeof DEVICE_TYPE_LABELS] ?? d.deviceType})
										</option>
									))}
								</select>
							</div>
							{traceMode === "path" && (
								<>
									<ArrowRight size={16} className="text-(--app-text-dim) mt-4 shrink-0" />
									<div className="flex-1">
										<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-1">
											Destination
										</label>
										<select
											value={traceTo}
											onChange={(e) => setTraceTo(e.target.value)}
											className="w-full h-8 text-sm rounded-md bg-(--app-input-bg) border border-(--app-border) text-(--app-text) px-2"
										>
											<option value="">Select device…</option>
											{devices
												.filter((d) => d.id !== traceFrom)
												.map((d) => (
													<option key={d.id} value={d.id}>
														{d.name} ({DEVICE_TYPE_LABELS[d.deviceType as keyof typeof DEVICE_TYPE_LABELS] ?? d.deviceType})
													</option>
												))}
										</select>
									</div>
								</>
							)}
						</div>
					</div>

					{/* Trace results */}
					{traceResult?.type === "reachable" && (
						<div className="bg-(--app-surface) rounded-lg border border-(--app-border) overflow-hidden">
							<div className="px-4 py-2.5 border-b border-(--app-border) flex items-center gap-2">
								<Wifi size={14} className="text-emerald-400" />
								<span className="text-sm font-bold text-(--app-text)">
									{traceResult.ids.length} reachable device{traceResult.ids.length !== 1 ? "s" : ""}
								</span>
								{traceResult.ids.length < devices.length && (
									<span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full ml-auto">
										{devices.length - traceResult.ids.length} unreachable
									</span>
								)}
							</div>
							<div className="divide-y divide-(--app-border)">
								{traceResult.ids.map((id) => {
									const dev = getDevice(id)
									if (!dev) return null
									const neigh = getConnectedDevices(id, connections)
									return (
										<div key={id} className="px-4 py-2 flex items-center gap-3">
											<div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: dev.color }} />
											<div className="flex-1 min-w-0">
												<span className="text-sm font-medium text-(--app-text)">{dev.name}</span>
												<span className="text-(--app-text-dim) text-xs ml-1.5">
													{DEVICE_TYPE_LABELS[dev.deviceType as keyof typeof DEVICE_TYPE_LABELS] ?? dev.deviceType}
												</span>
											</div>
											<span className="text-[10px] text-(--app-text-muted) font-mono">
												{neigh.length} link{neigh.length !== 1 ? "s" : ""}
											</span>
											{id === traceFrom && (
												<span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full">
													source
												</span>
											)}
										</div>
									)
								})}
							</div>
						</div>
					)}

					{traceResult?.type === "path" && (
						<div className="bg-(--app-surface) rounded-lg border border-(--app-border) overflow-hidden">
							<div className="px-4 py-2.5 border-b border-(--app-border) flex items-center gap-2">
								<GitBranch size={14} className="text-violet-400" />
								<span className="text-sm font-bold text-(--app-text)">
									{traceResult.path
										? `Path found — ${traceResult.path.length - 1} hop${traceResult.path.length - 1 !== 1 ? "s" : ""}`
										: "No path found"}
								</span>
							</div>
							{traceResult.path ? (
								<div className="p-4">
									<div className="flex items-center flex-wrap gap-2">
										{traceResult.path.map((id, idx) => {
											const dev = getDevice(id)
											if (!dev) return null
											return (
												<div key={id} className="flex items-center gap-2">
													{idx > 0 && (
														<ArrowRight size={14} className="text-violet-400 shrink-0" />
													)}
													<div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-(--app-surface-alt) rounded-lg border border-(--app-border)">
														<div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: dev.color }} />
														<span className="text-xs font-medium text-(--app-text)">{dev.name}</span>
													</div>
												</div>
											)
										})}
									</div>
								</div>
							) : (
								<div className="p-6 text-center text-(--app-text-muted) text-sm">
									{!traceFrom || !traceTo ? "Select both source and destination" : "These devices are not connected through any path"}
								</div>
							)}
						</div>
					)}

					{!traceFrom && (
						<div className="text-center py-12 text-(--app-text-muted)">
							<GitBranch size={32} className="mx-auto mb-3 opacity-30" />
							<p className="text-sm font-medium">Select a device to trace</p>
							<p className="text-xs mt-1">Find all reachable devices or trace a path between two</p>
						</div>
					)}
				</div>
			)}

			{/* ── Ping Simulator ── */}
			{tab === "ping" && (
				<div className="space-y-4">
					<div className="bg-(--app-surface) rounded-lg border border-(--app-border) p-4 space-y-3">
						<div className="flex items-center gap-2 mb-1">
							<Radio size={14} className="text-orange-400" />
							<span className="text-sm font-semibold text-(--app-text)">Ping Configuration</span>
						</div>

						{portsWithIp.length === 0 ? (
							<div className="text-center py-6 text-(--app-text-muted) text-sm">
								No ports with IP addresses configured. Right-click a port to assign an IP.
							</div>
						) : (
							<>
								<div className="flex items-center gap-2">
									<div className="flex-1">
										<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-1">
											Source
										</label>
										<select
											value={pingFrom}
											onChange={(e) => { setPingFrom(e.target.value); setPingResult(null) }}
											className="w-full h-8 text-sm rounded-md bg-(--app-input-bg) border border-(--app-border) text-(--app-text) px-2"
										>
											<option value="">Select port…</option>
											{portsWithIp.map((pc) => (
												<option key={`${pc.deviceId}:${pc.portNumber}`} value={`${pc.deviceId}:${pc.portNumber}`}>
													{pc.deviceName} P{pc.portNumber} — {pc.ipAddress}
												</option>
											))}
										</select>
									</div>
									<ArrowRight size={16} className="text-(--app-text-dim) mt-4 shrink-0" />
									<div className="flex-1">
										<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-1">
											Destination
										</label>
										<select
											value={pingTo}
											onChange={(e) => { setPingTo(e.target.value); setPingResult(null) }}
											className="w-full h-8 text-sm rounded-md bg-(--app-input-bg) border border-(--app-border) text-(--app-text) px-2"
										>
											<option value="">Select port…</option>
											{portsWithIp
												.filter((pc) => `${pc.deviceId}:${pc.portNumber}` !== pingFrom)
												.map((pc) => (
													<option key={`${pc.deviceId}:${pc.portNumber}`} value={`${pc.deviceId}:${pc.portNumber}`}>
														{pc.deviceName} P{pc.portNumber} — {pc.ipAddress}
													</option>
												))}
										</select>
									</div>
								</div>

								<button
									type="button"
									disabled={!pingFrom || !pingTo || isPinging}
									className="w-full py-2 rounded-md text-sm font-semibold transition-colors disabled:opacity-40 bg-orange-500/20 border border-orange-500 text-orange-300 hover:bg-orange-500/30"
									onClick={runPing}
								>
									{isPinging ? (
										<span className="flex items-center justify-center gap-2">
											<span className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
											Pinging…
										</span>
									) : (
										<span className="flex items-center justify-center gap-2">
											<Radio size={14} />
											Run Ping
										</span>
									)}
								</button>
							</>
						)}
					</div>

					{/* Ping results */}
					{pingResult && (
						<div className={`bg-(--app-surface) rounded-lg border overflow-hidden ${
							pingResult.success ? "border-emerald-500/30" : "border-red-500/30"
						}`}>
							<div className={`px-4 py-2.5 border-b flex items-center gap-2 ${
								pingResult.success
									? "border-emerald-500/20 bg-emerald-500/5"
									: "border-red-500/20 bg-red-500/5"
							}`}>
								{pingResult.success ? (
									<Wifi size={14} className="text-emerald-400" />
								) : (
									<CircleDot size={14} className="text-red-400" />
								)}
								<span className={`text-sm font-bold ${pingResult.success ? "text-emerald-400" : "text-red-400"}`}>
									{pingResult.success ? "Ping Successful" : "Ping Failed"}
								</span>
							</div>

							{/* Hop trace visualization */}
							{pingResult.hops.length > 0 && (
								<div className="p-4 space-y-2">
									<div className="text-[10px] text-(--app-text-dim) uppercase tracking-wider mb-2">
										Traceroute — {pingResult.hops.length} hop{pingResult.hops.length !== 1 ? "s" : ""}
									</div>
									{pingResult.hops.map((hop, idx) => (
										<div key={hop.deviceId} className="flex items-center gap-3">
											<span className="text-[10px] text-(--app-text-dim) w-5 text-right font-mono">{idx + 1}</span>
											<div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: hop.color }} />
											<div className="flex-1 min-w-0">
												<span className="text-sm font-medium text-(--app-text)">{hop.deviceName}</span>
												<span className="text-(--app-text-dim) text-xs ml-1.5">P{hop.portNumber}</span>
											</div>
											<span className="text-xs font-mono text-(--app-text-muted)">
												{hop.ipAddress ? hop.ipAddress.split("/")[0] : "no ip"}
											</span>
											<span className="text-[10px] font-mono text-emerald-400 w-10 text-right">{hop.latency}ms</span>
											{idx < pingResult.hops.length - 1 && (
												<div className="absolute left-8 w-px h-3 bg-(--app-border)" />
											)}
										</div>
									))}
								</div>
							)}

							{/* Result message */}
							<div className={`px-4 py-3 font-mono text-xs ${
								pingResult.success ? "text-emerald-400 bg-emerald-500/5" : "text-red-400 bg-red-500/5"
							}`}>
								{pingResult.message}
								{pingResult.success && (
									<span className="block mt-1 text-(--app-text-dim)">
										Round-trip time: ~{pingResult.totalLatency * 2}ms
									</span>
								)}
							</div>
						</div>
					)}

					{!pingFrom && portsWithIp.length > 0 && (
						<div className="text-center py-12 text-(--app-text-muted)">
							<Radio size={32} className="mx-auto mb-3 opacity-30" />
							<p className="text-sm font-medium">Select source and destination to ping</p>
							<p className="text-xs mt-1">Simulates ICMP ping with hop-by-hop traceroute and subnet validation</p>
						</div>
					)}
				</div>
			)}

			{/* ── Subnet Map ── */}
			{tab === "subnets" && (
				<div className="space-y-4">
					{subnetKeys.length === 0 ? (
						<div className="text-center py-12 text-(--app-text-muted)">
							<Globe size={32} className="mx-auto mb-3 opacity-30" />
							<p className="text-sm font-medium">No subnets configured</p>
							<p className="text-xs mt-1">Assign IP addresses (CIDR notation) to ports to see subnet grouping</p>
						</div>
					) : (
						<>
							{/* Summary cards */}
							<div className="grid grid-cols-3 gap-3">
								<div className="bg-(--app-surface) rounded-lg border border-(--app-border) p-3 text-center">
									<Globe size={16} className="text-(--app-text-muted) mx-auto mb-1.5" />
									<div className="text-lg font-bold text-(--app-text)">{subnetKeys.length}</div>
									<div className="text-[10px] text-(--app-text-dim) uppercase tracking-wider">Subnets</div>
								</div>
								<div className="bg-(--app-surface) rounded-lg border border-(--app-border) p-3 text-center">
									<Network size={16} className="text-(--app-text-muted) mx-auto mb-1.5" />
									<div className="text-lg font-bold text-(--app-text)">
										{Array.from(subnetMap.values()).reduce((sum, s) => sum + s.ports.length, 0)}
									</div>
									<div className="text-[10px] text-(--app-text-dim) uppercase tracking-wider">IPs Assigned</div>
								</div>
								<div className="bg-(--app-surface) rounded-lg border border-(--app-border) p-3 text-center">
									<Server size={16} className="text-(--app-text-muted) mx-auto mb-1.5" />
									<div className="text-lg font-bold text-(--app-text)">
										{new Set(Array.from(subnetMap.values()).flatMap((s) => s.ports.map((p) => p.deviceId))).size}
									</div>
									<div className="text-[10px] text-(--app-text-dim) uppercase tracking-wider">Devices w/ IP</div>
								</div>
							</div>

							{/* Subnet cards */}
							{subnetKeys.map((key) => {
								const info = subnetMap.get(key)!
								const parsed = parseIp(`${info.network}/` + info.cidr)
								const broadcast = parsed ? ipToString((parsed.network | ~parsed.mask) >>> 0) : "—"
								const maxHosts = info.cidr <= 30 ? Math.pow(2, 32 - info.cidr) - 2 : info.cidr === 31 ? 2 : 1
								const usedCount = info.ports.length
								const deviceIds = [...new Set(info.ports.map((p) => p.deviceId))]

								return (
									<div key={key} className="bg-(--app-surface) rounded-lg border border-(--app-border) overflow-hidden">
										<div className="px-4 py-2.5 border-b border-(--app-border) flex items-center justify-between">
											<div className="flex items-center gap-2">
												<Globe size={14} className="text-emerald-400" />
												<span className="text-sm font-bold font-mono text-(--app-text)">{key}</span>
											</div>
											<div className="flex items-center gap-3 text-[10px] text-(--app-text-muted)">
												<span>Mask: <span className="font-mono">{info.mask}</span></span>
												<span>Broadcast: <span className="font-mono">{broadcast}</span></span>
											</div>
										</div>

										{/* Utilization bar */}
										<div className="px-4 py-2 border-b border-(--app-border) bg-(--app-surface-alt)">
											<div className="flex items-center justify-between text-[10px] text-(--app-text-dim) mb-1">
												<span>IP Usage: {usedCount} / {maxHosts} usable</span>
												<span className="font-mono">{maxHosts > 0 ? Math.round((usedCount / maxHosts) * 100) : 0}%</span>
											</div>
											<div className="w-full h-1.5 bg-(--app-surface-hover) rounded-full overflow-hidden">
												<div
													className="h-full rounded-full bg-emerald-500 transition-all"
													style={{ width: `${maxHosts > 0 ? Math.min(100, (usedCount / maxHosts) * 100) : 0}%` }}
												/>
											</div>
										</div>

										{/* Ports in this subnet */}
										<div className="divide-y divide-(--app-border)">
											{deviceIds.map((devId) => {
												const dev = getDevice(devId)
												if (!dev) return null
												const devPorts = info.ports.filter((p) => p.deviceId === devId)
												return (
													<div key={devId} className="px-4 py-2.5 flex items-center gap-3">
														<div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: dev.color }} />
														<div className="flex-1 min-w-0">
															<div className="text-sm font-medium text-(--app-text)">{dev.name}</div>
															<div className="flex flex-wrap gap-1.5 mt-1">
																{devPorts.map((p) => (
																	<span
																		key={p.portNumber}
																		className="px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300 text-[10px] font-mono rounded"
																	>
																		P{p.portNumber}: {p.ip}
																	</span>
																))}
															</div>
														</div>
													</div>
												)
											})}
										</div>
									</div>
								)
							})}
						</>
					)}
				</div>
			)}

			{/* ── Port Stats ── */}
			{tab === "stats" && (
				<div className="space-y-4">
					{/* Overall summary */}
					<div className="grid grid-cols-4 gap-3">
						{[
							{ label: "Total Devices", value: devices.length, icon: CircleDot },
							{ label: "Total Connections", value: connections.length, icon: GitBranch },
							{ label: "Port Utilization", value: `${overallUtil}%`, icon: Server },
							{ label: "VLANs Active", value: vlanIds.length, icon: Layers },
						].map((item) => (
							<div
								key={item.label}
								className="bg-(--app-surface) rounded-lg border border-(--app-border) p-3 text-center"
							>
								<item.icon size={16} className="text-(--app-text-muted) mx-auto mb-1.5" />
								<div className="text-lg font-bold text-(--app-text)">{item.value}</div>
								<div className="text-[10px] text-(--app-text-dim) uppercase tracking-wider">{item.label}</div>
							</div>
						))}
					</div>

					{/* Per-device table */}
					<div className="bg-(--app-surface) rounded-lg border border-(--app-border) overflow-hidden">
						<table className="w-full text-sm border-collapse">
							<thead>
								<tr className="bg-(--app-surface-alt) text-(--app-text-muted) text-xs">
									<th className="text-left px-3 py-2 font-semibold">Device</th>
									<th className="text-left px-3 py-2 font-semibold">Type</th>
									<th className="text-center px-3 py-2 font-semibold">Ports Used</th>
									<th className="text-center px-3 py-2 font-semibold">Util %</th>
									<th className="text-center px-3 py-2 font-semibold">Neighbors</th>
									<th className="text-left px-3 py-2 font-semibold">VLANs</th>
									<th className="text-center px-3 py-2 font-semibold">Reserved</th>
								</tr>
							</thead>
							<tbody>
								{stats.map((s) => (
									<tr key={s.device.id} className="border-b border-(--app-border) hover:bg-(--app-surface-alt)">
										<td className="px-3 py-2">
											<div className="flex items-center gap-1.5">
												<div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: s.device.color }} />
												<span className="text-(--app-text) font-medium truncate">{s.device.name}</span>
											</div>
										</td>
										<td className="px-3 py-2 text-(--app-text-muted) text-xs">
											{DEVICE_TYPE_LABELS[s.device.deviceType as keyof typeof DEVICE_TYPE_LABELS] ?? s.device.deviceType}
										</td>
										<td className="px-3 py-2 text-center text-(--app-text) font-mono text-xs">
											{s.usedPorts}/{s.totalPorts}
										</td>
										<td className="px-3 py-2 text-center">
											<div className="flex items-center justify-center gap-1.5">
												<div className="w-12 h-1.5 bg-(--app-surface-hover) rounded-full overflow-hidden">
													<div
														className="h-full rounded-full transition-all"
														style={{
															width: `${s.utilization}%`,
															backgroundColor:
																s.utilization > 80 ? "#ef4444" : s.utilization > 50 ? "#f59e0b" : "#22c55e",
														}}
													/>
												</div>
												<span className="text-[10px] text-(--app-text-muted) w-7 text-right font-mono">
													{s.utilization}%
												</span>
											</div>
										</td>
										<td className="px-3 py-2 text-center text-(--app-text) font-mono text-xs">
											{s.neighborCount}
										</td>
										<td className="px-3 py-2">
											{s.vlans.length > 0 ? (
												<div className="flex flex-wrap gap-1">
													{s.vlans.map((v) => (
														<span key={v} className="px-1.5 py-0.5 bg-cyan-500/15 text-cyan-300 text-[10px] font-mono rounded">
															{v}
														</span>
													))}
												</div>
											) : (
												<span className="text-(--app-text-dim) text-[10px]">—</span>
											)}
										</td>
										<td className="px-3 py-2 text-center text-(--app-text-muted) font-mono text-xs">
											{s.reservedCount > 0 ? s.reservedCount : "—"}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</div>
	)
}
