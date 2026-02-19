import type { ConnectionRow, DeviceRow, DeviceType, PortConfigRow } from "@/lib/topology-types"
import { DEVICE_CAPABILITIES, DEVICE_TYPE_LABELS, ipToString, parseIp, sameSubnet } from "@/lib/topology-types"
import {
	ArrowRight,
	CircleDot,
	GitBranch,
	Globe,
	Layers,
	Network,
	Radio,
	Search,
	Wifi,
} from "lucide-react"
import { useCallback, useMemo, useState } from "react"

interface NetworkInsightsProps {
	devices: DeviceRow[]
	connections: ConnectionRow[]
	portConfigs: PortConfigRow[]
}

type InsightTab = "network" | "diagnostics"

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

/* ── IP/Subnet helpers (imported from topology-types) ── */

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
	const [tab, setTab] = useState<InsightTab>("network")

	/* ── Network tab state ── */
	const [selectedVlan, setSelectedVlan] = useState<number | null>(null)

	/* ── Diagnostics tab state ── */
	const [diagMode, setDiagMode] = useState<"trace" | "ping">("trace")
	const [traceFrom, setTraceFrom] = useState("")
	const [traceTo, setTraceTo] = useState("")
	const [traceMode, setTraceMode] = useState<"reachable" | "path">("reachable")
	const [pingFrom, setPingFrom] = useState("")
	const [pingTo, setPingTo] = useState("")
	const [pingResult, setPingResult] = useState<PingResult | null>(null)
	const [isPinging, setIsPinging] = useState(false)

	const getDevice = (id: string) => devices.find((d) => d.id === id)

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

	/* ── Subnet data (L3 interfaces define subnets) ── */
	const subnetMap = useMemo(() => {
		const m = new Map<string, {
			network: string
			cidr: number
			mask: string
			gatewayIp: string | null
			gatewayDeviceId: string | null
			ports: { deviceId: string; portNumber: number; ip: string; alias: string | null; isGateway: boolean }[]
		}>()
		for (const pc of portConfigs) {
			if (!pc.ipAddress) continue
			const parsed = parseIp(pc.ipAddress)
			if (!parsed) continue
			const key = `${ipToString(parsed.network)}/${parsed.cidr}`
			const dev = devices.find((d) => d.id === pc.deviceId)
			const caps = dev ? (DEVICE_CAPABILITIES[dev.deviceType as DeviceType] ?? DEVICE_CAPABILITIES.pc) : DEVICE_CAPABILITIES.pc
			const isGateway = caps.canBeGateway

			const existing = m.get(key) ?? {
				network: ipToString(parsed.network),
				cidr: parsed.cidr,
				mask: ipToString(parsed.mask),
				gatewayIp: null,
				gatewayDeviceId: null,
				ports: [],
			}
			if (isGateway && !existing.gatewayIp) {
				existing.gatewayIp = pc.ipAddress
				existing.gatewayDeviceId = pc.deviceId
			}
			existing.ports.push({ deviceId: pc.deviceId, portNumber: pc.portNumber, ip: pc.ipAddress, alias: pc.alias, isGateway })
			m.set(key, existing)
		}

		/* Also place L2 management IPs */
		for (const dev of devices) {
			if (!dev.managementIp) continue
			const parsed = parseIp(dev.managementIp.includes("/") ? dev.managementIp : `${dev.managementIp}/24`)
			if (!parsed) continue
			const key = `${ipToString(parsed.network)}/${parsed.cidr}`
			const existing = m.get(key)
			if (existing) {
				const alreadyListed = existing.ports.some((p) => p.deviceId === dev.id && p.ip === dev.managementIp)
				if (!alreadyListed) {
					existing.ports.push({
						deviceId: dev.id,
						portNumber: 0,
						ip: dev.managementIp.includes("/") ? dev.managementIp : `${dev.managementIp}/24`,
						alias: "mgmt",
						isGateway: false,
					})
				}
			}
		}
		return m
	}, [portConfigs, devices])

	const subnetKeys = useMemo(() => Array.from(subnetMap.keys()).sort(), [subnetMap])

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

	/* ── Ports with IP (for ping) ── */
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

		const srcPc = portConfigs.find((pc) => `${pc.deviceId}:${pc.portNumber}` === pingFrom)
		const dstPc = portConfigs.find((pc) => `${pc.deviceId}:${pc.portNumber}` === pingTo)

		if (!srcPc?.ipAddress || !dstPc?.ipAddress) {
			setTimeout(() => {
				setPingResult({ success: false, hops: [], message: "Source and destination must have IP addresses", totalLatency: 0 })
				setIsPinging(false)
			}, 500)
			return
		}

		const path = findPath(srcPc.deviceId, dstPc.deviceId, connections)

		if (!path) {
			setTimeout(() => {
				setPingResult({ success: false, hops: [], message: `No route to host — ${ipToString(parseIp(dstPc.ipAddress!)?.ip ?? 0)} is unreachable`, totalLatency: 0 })
				setIsPinging(false)
			}, 800)
			return
		}

		const hops: PingHop[] = []
		let subnetOk = true

		for (let i = 0; i < path.length; i++) {
			const devId = path[i]
			const dev = devices.find((d) => d.id === devId)
			let portNum = 0
			let portIp: string | null = null

			if (i === 0) {
				portNum = srcPc.portNumber
				portIp = srcPc.ipAddress
			} else if (i === path.length - 1) {
				portNum = dstPc.portNumber
				portIp = dstPc.ipAddress
			} else {
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

		if (hops.length >= 2) {
			const srcIp = hops[0].ipAddress
			const dstIp = hops[hops.length - 1].ipAddress
			if (srcIp && dstIp && !sameSubnet(srcIp, dstIp)) {
				const hasRouter = hops.slice(1, -1).some((h) => {
					const devPorts = portConfigs.filter((pc) => pc.deviceId === h.deviceId && pc.ipAddress)
					return devPorts.some((dp) => dp.ipAddress && sameSubnet(dp.ipAddress, srcIp!)) &&
						devPorts.some((dp) => dp.ipAddress && sameSubnet(dp.ipAddress, dstIp!))
				})
				if (!hasRouter) subnetOk = false
			}
		}

		const totalLatency = hops.reduce((sum, h) => sum + h.latency, 0)

		setTimeout(() => {
			if (!subnetOk) {
				setPingResult({ success: false, hops, message: "Destination host unreachable — different subnets with no router in path", totalLatency })
			} else {
				setPingResult({ success: true, hops, message: `Reply from ${dstPc.ipAddress!.split("/")[0]}: ${hops.length - 1} hop${hops.length - 1 !== 1 ? "s" : ""}, time=${totalLatency}ms`, totalLatency })
			}
			setIsPinging(false)
		}, 600 + path.length * 200)
	}, [pingFrom, pingTo, portConfigs, connections, devices])

	const tabs: { key: InsightTab; label: string; icon: typeof Layers }[] = [
		{ key: "network", label: "Network Map", icon: Globe },
		{ key: "diagnostics", label: "Diagnostics", icon: Radio },
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

			{/* ═══════════ NETWORK MAP TAB ═══════════ */}
			{tab === "network" && (
				<div className="space-y-6">
					{/* ── Subnet Section ── */}
					<section>
						<h3 className="text-xs font-bold text-(--app-text-muted) uppercase tracking-wider flex items-center gap-1.5 mb-3">
							<Globe size={12} /> Subnets
						</h3>

						{subnetKeys.length === 0 ? (
							<div className="text-center py-8 text-(--app-text-muted) bg-(--app-surface) rounded-lg border border-(--app-border)">
								<Globe size={28} className="mx-auto mb-2 opacity-30" />
								<p className="text-sm">No subnets configured</p>
								<p className="text-[10px] mt-0.5 text-(--app-text-dim)">
									Assign IP addresses (CIDR) to router interfaces to define subnets
								</p>
							</div>
						) : (
							<div className="space-y-3">
								{/* Summary strip */}
								<div className="flex items-center gap-4 text-xs text-(--app-text-muted)">
									<span><strong className="text-(--app-text)">{subnetKeys.length}</strong> subnet{subnetKeys.length !== 1 ? "s" : ""}</span>
									<span><strong className="text-(--app-text)">{Array.from(subnetMap.values()).reduce((sum, s) => sum + s.ports.length, 0)}</strong> IPs assigned</span>
									<span><strong className="text-(--app-text)">{new Set(Array.from(subnetMap.values()).flatMap((s) => s.ports.map((p) => p.deviceId))).size}</strong> devices</span>
								</div>

								{subnetKeys.map((key) => {
									const info = subnetMap.get(key)!
									const parsed = parseIp(`${info.network}/${info.cidr}`)
									const broadcast = parsed ? ipToString((parsed.network | ~parsed.mask) >>> 0) : "—"
									const maxHosts = info.cidr <= 30 ? 2 ** (32 - info.cidr) - 2 : info.cidr === 31 ? 2 : 1
									const usedCount = info.ports.length
									const deviceIds = [...new Set(info.ports.map((p) => p.deviceId))]
									const gwDev = info.gatewayDeviceId ? devices.find((d) => d.id === info.gatewayDeviceId) : null

									return (
										<div key={key} className="bg-(--app-surface) rounded-lg border border-(--app-border) overflow-hidden">
											{/* Header */}
											<div className="px-3 py-2 border-b border-(--app-border) flex items-center justify-between">
												<div className="flex items-center gap-2">
													<Globe size={13} className="text-emerald-400" />
													<span className="text-sm font-bold font-mono text-(--app-text)">{key}</span>
												</div>
												<div className="flex items-center gap-3 text-[10px] text-(--app-text-muted)">
													<span>Mask: <span className="font-mono">{info.mask}</span></span>
													<span>Bcast: <span className="font-mono">{broadcast}</span></span>
												</div>
											</div>

											{/* Gateway badge */}
											{info.gatewayIp ? (
												<div className="px-3 py-1.5 border-b border-(--app-border) bg-amber-500/5 flex items-center gap-2 text-[10px]">
													<span className="text-amber-400 font-semibold">GW:</span>
													<span className="font-mono text-amber-300">{info.gatewayIp}</span>
													{gwDev && (
														<span className="text-(--app-text-dim)">
															via <span className="font-medium text-(--app-text-muted)">{gwDev.name}</span>
														</span>
													)}
												</div>
											) : (
												<div className="px-3 py-1 border-b border-(--app-border) bg-red-500/5 text-[10px] text-red-400">
													No gateway (no L3 device)
												</div>
											)}

											{/* Utilization bar */}
											<div className="px-3 py-1.5 border-b border-(--app-border)">
												<div className="flex items-center justify-between text-[10px] text-(--app-text-dim) mb-0.5">
													<span>{usedCount} / {maxHosts} hosts</span>
													<span className="font-mono">{maxHosts > 0 ? Math.round((usedCount / maxHosts) * 100) : 0}%</span>
												</div>
												<div className="w-full h-1 bg-(--app-surface-hover) rounded-full overflow-hidden">
													<div
														className="h-full rounded-full bg-emerald-500 transition-all"
														style={{ width: `${maxHosts > 0 ? Math.min(100, (usedCount / maxHosts) * 100) : 0}%` }}
													/>
												</div>
											</div>

											{/* Devices */}
											<div className="divide-y divide-(--app-border)">
												{deviceIds.map((devId) => {
													const dev = getDevice(devId)
													if (!dev) return null
													const devPorts = info.ports.filter((p) => p.deviceId === devId)
													return (
														<div key={devId} className="px-3 py-2 flex items-center gap-2">
															<div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: dev.color }} />
															<div className="flex-1 min-w-0">
																<div className="text-xs font-medium text-(--app-text)">{dev.name}</div>
																<div className="flex flex-wrap gap-1 mt-0.5">
																	{devPorts.map((p) => (
																		<span
																			key={`${p.portNumber}-${p.ip}`}
																			className={`px-1 py-0.5 text-[9px] font-mono rounded ${
																				p.isGateway
																					? "bg-amber-500/15 text-amber-300"
																					: p.portNumber === 0
																						? "bg-violet-500/15 text-violet-300"
																						: "bg-emerald-500/15 text-emerald-300"
																			}`}
																		>
																			{p.portNumber === 0 ? "MGMT" : `P${p.portNumber}`}: {p.ip}
																			{p.isGateway && " (GW)"}
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
							</div>
						)}
					</section>

					{/* ── VLAN Section ── */}
					<section>
						<h3 className="text-xs font-bold text-(--app-text-muted) uppercase tracking-wider flex items-center gap-1.5 mb-3">
							<Layers size={12} /> VLANs
						</h3>

						{vlanIds.length === 0 ? (
							<div className="text-center py-8 text-(--app-text-muted) bg-(--app-surface) rounded-lg border border-(--app-border)">
								<Layers size={28} className="mx-auto mb-2 opacity-30" />
								<p className="text-sm">No VLANs configured</p>
								<p className="text-[10px] mt-0.5 text-(--app-text-dim)">
									Right-click a switch port to assign a VLAN
								</p>
							</div>
						) : (
							<div className="space-y-3">
								{/* VLAN pills */}
								<div className="flex flex-wrap gap-2">
									{vlanIds.map((vlan) => {
										const ports = vlanMap.get(vlan) ?? []
										const devCount = new Set(ports.map((p) => p.deviceId)).size
										return (
											<button
												key={vlan}
												type="button"
												className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono transition-all ${
													selectedVlan === vlan
														? "bg-cyan-500/20 border-cyan-500 text-cyan-300"
														: "bg-(--app-surface) border-(--app-border) text-(--app-text) hover:border-(--app-border-light)"
												}`}
												onClick={() => setSelectedVlan(selectedVlan === vlan ? null : vlan)}
											>
												<div className="font-bold">VLAN {vlan}</div>
												<div className="text-[9px] text-(--app-text-muted)">
													{ports.length}p · {devCount}d
												</div>
											</button>
										)
									})}
								</div>

								{/* Selected VLAN detail */}
								{selectedVlan != null && (
									<div className="bg-(--app-surface) rounded-lg border border-(--app-border) overflow-hidden">
										<div className="px-3 py-2 border-b border-(--app-border) flex items-center gap-2">
											<Layers size={13} className="text-cyan-400" />
											<span className="text-xs font-bold text-(--app-text)">
												VLAN {selectedVlan} — {selectedVlanPorts.length} port{selectedVlanPorts.length !== 1 ? "s" : ""} / {vlanDeviceIds.length} device{vlanDeviceIds.length !== 1 ? "s" : ""}
											</span>
										</div>
										<div className="divide-y divide-(--app-border)">
											{vlanDeviceIds.map((devId) => {
												const dev = getDevice(devId)
												if (!dev) return null
												const devPorts = selectedVlanPorts.filter((p) => p.deviceId === devId)
												return (
													<div key={devId} className="px-3 py-2 flex items-center gap-2">
														<div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: dev.color }} />
														<div className="flex-1 min-w-0">
															<div className="text-xs font-medium text-(--app-text)">
																{dev.name}
																<span className="text-(--app-text-dim) text-[10px] ml-1">
																	{DEVICE_TYPE_LABELS[dev.deviceType as keyof typeof DEVICE_TYPE_LABELS] ?? dev.deviceType}
																</span>
															</div>
															<div className="flex flex-wrap gap-1 mt-0.5">
																{devPorts.map((p) => (
																	<span
																		key={p.portNumber}
																		className="px-1 py-0.5 bg-cyan-500/15 text-cyan-300 text-[9px] font-mono rounded"
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
							</div>
						)}
					</section>
				</div>
			)}

			{/* ═══════════ DIAGNOSTICS TAB ═══════════ */}
			{tab === "diagnostics" && (
				<div className="space-y-4">
					{/* Mode toggle: Trace vs Ping */}
					<div className="flex gap-1 p-1 bg-(--app-surface) rounded-lg border border-(--app-border) w-fit">
						<button
							type="button"
							className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
								diagMode === "trace"
									? "bg-(--app-surface-hover) text-white"
									: "text-(--app-text-muted) hover:text-white"
							}`}
							onClick={() => setDiagMode("trace")}
						>
							<GitBranch size={12} /> Trace
						</button>
						<button
							type="button"
							className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
								diagMode === "ping"
									? "bg-(--app-surface-hover) text-white"
									: "text-(--app-text-muted) hover:text-white"
							}`}
							onClick={() => setDiagMode("ping")}
						>
							<Radio size={12} /> Ping
						</button>
					</div>

					{/* ── Connection Tracer ── */}
					{diagMode === "trace" && (
						<div className="space-y-3">
							<div className="bg-(--app-surface) rounded-lg border border-(--app-border) p-3 space-y-3">
								<div className="flex items-center gap-2">
									<Search size={13} className="text-(--app-text-muted)" />
									<span className="text-xs font-semibold text-(--app-text)">Trace Configuration</span>
								</div>

								<div className="flex gap-2">
									<button
										type="button"
										className={`px-2.5 py-1 text-[10px] rounded-md border transition-colors ${
											traceMode === "reachable"
												? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
												: "bg-(--app-input-bg) border-(--app-border) text-(--app-text-muted)"
										}`}
										onClick={() => setTraceMode("reachable")}
									>
										<Network size={10} className="inline mr-1" /> All Reachable
									</button>
									<button
										type="button"
										className={`px-2.5 py-1 text-[10px] rounded-md border transition-colors ${
											traceMode === "path"
												? "bg-violet-500/20 border-violet-500 text-violet-300"
												: "bg-(--app-input-bg) border-(--app-border) text-(--app-text-muted)"
										}`}
										onClick={() => setTraceMode("path")}
									>
										<GitBranch size={10} className="inline mr-1" /> Shortest Path
									</button>
								</div>

								<div className="flex items-center gap-2">
									<div className="flex-1">
										<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-0.5">
											{traceMode === "reachable" ? "From" : "Source"}
										</label>
										<select
											value={traceFrom}
											onChange={(e) => setTraceFrom(e.target.value)}
											className="w-full h-7 text-xs rounded-md bg-(--app-input-bg) border border-(--app-border) text-(--app-text) px-2"
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
											<ArrowRight size={14} className="text-(--app-text-dim) mt-3 shrink-0" />
											<div className="flex-1">
												<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-0.5">
													Destination
												</label>
												<select
													value={traceTo}
													onChange={(e) => setTraceTo(e.target.value)}
													className="w-full h-7 text-xs rounded-md bg-(--app-input-bg) border border-(--app-border) text-(--app-text) px-2"
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
									<div className="px-3 py-2 border-b border-(--app-border) flex items-center gap-2">
										<Wifi size={13} className="text-emerald-400" />
										<span className="text-xs font-bold text-(--app-text)">
											{traceResult.ids.length} reachable
										</span>
										{traceResult.ids.length < devices.length && (
											<span className="text-[9px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded-full ml-auto">
												{devices.length - traceResult.ids.length} unreachable
											</span>
										)}
									</div>
									<div className="divide-y divide-(--app-border) max-h-64 overflow-y-auto">
										{traceResult.ids.map((id) => {
											const dev = getDevice(id)
											if (!dev) return null
											return (
												<div key={id} className="px-3 py-1.5 flex items-center gap-2">
													<div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: dev.color }} />
													<span className="text-xs font-medium text-(--app-text) flex-1 truncate">{dev.name}</span>
													<span className="text-[9px] text-(--app-text-dim)">
														{DEVICE_TYPE_LABELS[dev.deviceType as keyof typeof DEVICE_TYPE_LABELS] ?? dev.deviceType}
													</span>
													{id === traceFrom && (
														<span className="text-[9px] text-emerald-400 bg-emerald-400/10 px-1 py-0.5 rounded">src</span>
													)}
												</div>
											)
										})}
									</div>
								</div>
							)}

							{traceResult?.type === "path" && (
								<div className="bg-(--app-surface) rounded-lg border border-(--app-border) overflow-hidden">
									<div className="px-3 py-2 border-b border-(--app-border) flex items-center gap-2">
										<GitBranch size={13} className="text-violet-400" />
										<span className="text-xs font-bold text-(--app-text)">
											{traceResult.path
												? `${traceResult.path.length - 1} hop${traceResult.path.length - 1 !== 1 ? "s" : ""}`
												: "No path found"}
										</span>
									</div>
									{traceResult.path ? (
										<div className="p-3 flex items-center flex-wrap gap-1.5">
											{traceResult.path.map((id, idx) => {
												const dev = getDevice(id)
												if (!dev) return null
												return (
													<div key={id} className="flex items-center gap-1.5">
														{idx > 0 && <ArrowRight size={12} className="text-violet-400 shrink-0" />}
														<div className="flex items-center gap-1 px-2 py-1 bg-(--app-surface-alt) rounded border border-(--app-border)">
															<div className="w-2 h-2 rounded-sm" style={{ backgroundColor: dev.color }} />
															<span className="text-[10px] font-medium text-(--app-text)">{dev.name}</span>
														</div>
													</div>
												)
											})}
										</div>
									) : (
										<div className="p-4 text-center text-(--app-text-muted) text-xs">
											{!traceFrom || !traceTo ? "Select both devices" : "No connection path exists"}
										</div>
									)}
								</div>
							)}

							{!traceFrom && (
								<div className="text-center py-8 text-(--app-text-muted)">
									<GitBranch size={28} className="mx-auto mb-2 opacity-30" />
									<p className="text-sm">Select a device to trace connectivity</p>
								</div>
							)}
						</div>
					)}

					{/* ── Ping Simulator ── */}
					{diagMode === "ping" && (
						<div className="space-y-3">
							<div className="bg-(--app-surface) rounded-lg border border-(--app-border) p-3 space-y-3">
								<div className="flex items-center gap-2">
									<Radio size={13} className="text-orange-400" />
									<span className="text-xs font-semibold text-(--app-text)">Ping Configuration</span>
								</div>

								{portsWithIp.length === 0 ? (
									<div className="text-center py-4 text-(--app-text-muted) text-xs">
										No ports with IPs. Assign IPs to interfaces first.
									</div>
								) : (
									<>
										<div className="flex items-center gap-2">
											<div className="flex-1">
												<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-0.5">
													Source
												</label>
												<select
													value={pingFrom}
													onChange={(e) => { setPingFrom(e.target.value); setPingResult(null) }}
													className="w-full h-7 text-xs rounded-md bg-(--app-input-bg) border border-(--app-border) text-(--app-text) px-2"
												>
													<option value="">Select…</option>
													{portsWithIp.map((pc) => (
														<option key={`${pc.deviceId}:${pc.portNumber}`} value={`${pc.deviceId}:${pc.portNumber}`}>
															{pc.deviceName} P{pc.portNumber} — {pc.ipAddress}
														</option>
													))}
												</select>
											</div>
											<ArrowRight size={14} className="text-(--app-text-dim) mt-3 shrink-0" />
											<div className="flex-1">
												<label className="text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-0.5">
													Destination
												</label>
												<select
													value={pingTo}
													onChange={(e) => { setPingTo(e.target.value); setPingResult(null) }}
													className="w-full h-7 text-xs rounded-md bg-(--app-input-bg) border border-(--app-border) text-(--app-text) px-2"
												>
													<option value="">Select…</option>
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
											className="w-full py-1.5 rounded-md text-xs font-semibold transition-colors disabled:opacity-40 bg-orange-500/20 border border-orange-500 text-orange-300 hover:bg-orange-500/30"
											onClick={runPing}
										>
											{isPinging ? (
												<span className="flex items-center justify-center gap-2">
													<span className="w-3 h-3 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
													Pinging…
												</span>
											) : (
												<span className="flex items-center justify-center gap-1.5">
													<Radio size={12} /> Run Ping
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
									<div className={`px-3 py-2 border-b flex items-center gap-2 ${
										pingResult.success
											? "border-emerald-500/20 bg-emerald-500/5"
											: "border-red-500/20 bg-red-500/5"
									}`}>
										{pingResult.success ? (
											<Wifi size={13} className="text-emerald-400" />
										) : (
											<CircleDot size={13} className="text-red-400" />
										)}
										<span className={`text-xs font-bold ${pingResult.success ? "text-emerald-400" : "text-red-400"}`}>
											{pingResult.success ? "Success" : "Failed"}
										</span>
									</div>

									{pingResult.hops.length > 0 && (
										<div className="p-3 space-y-1.5">
											<div className="text-[9px] text-(--app-text-dim) uppercase tracking-wider mb-1">
												Traceroute — {pingResult.hops.length} hop{pingResult.hops.length !== 1 ? "s" : ""}
											</div>
											{pingResult.hops.map((hop, idx) => (
												<div key={hop.deviceId} className="flex items-center gap-2">
													<span className="text-[9px] text-(--app-text-dim) w-4 text-right font-mono">{idx + 1}</span>
													<div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: hop.color }} />
													<span className="text-xs font-medium text-(--app-text) flex-1 truncate">{hop.deviceName}</span>
													<span className="text-[10px] text-(--app-text-dim)">P{hop.portNumber}</span>
													<span className="text-[10px] font-mono text-(--app-text-muted)">
														{hop.ipAddress ? hop.ipAddress.split("/")[0] : "—"}
													</span>
													<span className="text-[9px] font-mono text-emerald-400 w-8 text-right">{hop.latency}ms</span>
												</div>
											))}
										</div>
									)}

									<div className={`px-3 py-2 font-mono text-[10px] ${
										pingResult.success ? "text-emerald-400 bg-emerald-500/5" : "text-red-400 bg-red-500/5"
									}`}>
										{pingResult.message}
										{pingResult.success && (
											<span className="block mt-0.5 text-(--app-text-dim)">
												RTT: ~{pingResult.totalLatency * 2}ms
											</span>
										)}
									</div>
								</div>
							)}

							{!pingFrom && portsWithIp.length > 0 && (
								<div className="text-center py-8 text-(--app-text-muted)">
									<Radio size={28} className="mx-auto mb-2 opacity-30" />
									<p className="text-sm">Select source and destination to ping</p>
								</div>
							)}
						</div>
					)}
				</div>
			)}
		</div>
	)
}
