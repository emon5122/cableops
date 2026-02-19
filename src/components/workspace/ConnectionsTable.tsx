import type { ConnectionRow, DeviceRow, PortConfigRow } from "@/lib/topology-types"
import { negotiatedSpeed } from "@/lib/topology-types"
import { ArrowLeftRight, Trash2 } from "lucide-react"

interface ConnectionsTableProps {
	connections: ConnectionRow[]
	devices: DeviceRow[]
	portConfigs: PortConfigRow[]
	onDelete: (id: string) => void
	highlightedConnectionId: string | null
	onHighlight: (id: string | null) => void
	searchQuery: string
}

export default function ConnectionsTable({
	connections,
	devices,
	portConfigs,
	onDelete,
	highlightedConnectionId,
	onHighlight,
	searchQuery,
}: ConnectionsTableProps) {
	const getDevice = (id: string) => devices.find((d) => d.id === id)
	const getPortConfig = (deviceId: string, portNumber: number) =>
		portConfigs.find((pc) => pc.deviceId === deviceId && pc.portNumber === portNumber)

	const filtered = connections.filter((conn) => {
		if (!searchQuery) return true
		const q = searchQuery.toLowerCase()
		const dA = getDevice(conn.deviceAId)
		const dB = getDevice(conn.deviceBId)
		return (
			dA?.name.toLowerCase().includes(q) ||
			dB?.name.toLowerCase().includes(q) ||
			String(conn.portA).includes(q) ||
			String(conn.portB).includes(q) ||
			conn.speed?.toLowerCase().includes(q)
		)
	})

	if (connections.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-(--app-text-muted)">
				<ArrowLeftRight size={32} className="opacity-30 mb-3" />
				<p className="text-sm font-medium">No connections yet</p>
				<p className="text-xs mt-1">
					Click two free ports to create a connection
				</p>
			</div>
		)
	}

	return (
		<div className="overflow-x-auto">
			<table className="w-full text-sm border-collapse">
				<thead>
					<tr className="bg-(--app-surface) text-(--app-text-muted) text-xs">
						<th className="text-left px-3 py-2 font-semibold w-8">
							#
						</th>
						<th className="text-left px-3 py-2 font-semibold">
							Device A
						</th>
						<th className="text-left px-3 py-2 font-semibold w-16">
							Port
						</th>
						<th className="text-center px-3 py-2 font-semibold w-10">
							⇄
						</th>
						<th className="text-left px-3 py-2 font-semibold">
							Device B
						</th>
						<th className="text-left px-3 py-2 font-semibold w-16">
							Port
						</th>
						<th className="text-left px-3 py-2 font-semibold w-20">
							Speed
						</th>
						<th className="text-right px-3 py-2 font-semibold w-12" />
					</tr>
				</thead>
				<tbody>
					{filtered.map((conn, idx) => {
						const dA = getDevice(conn.deviceAId)
						const dB = getDevice(conn.deviceBId)
						const isHighlighted =
							highlightedConnectionId === conn.id
						return (
							<tr
								key={conn.id}
								className={`border-b border-(--app-border) cursor-pointer transition-colors ${
									isHighlighted
										? "bg-(--app-surface-hover)"
										: "hover:bg-(--app-surface-alt)"
								}`}
								onClick={() =>
									onHighlight(
										isHighlighted ? null : conn.id,
									)
								}
							>
								<td className="px-3 py-2 text-(--app-text-muted)">
									{idx + 1}
								</td>
								<td className="px-3 py-2">
									<div className="flex items-center gap-1.5">
										<div
											className="w-2.5 h-2.5 rounded-sm shrink-0"
											style={{
												backgroundColor:
													dA?.color ?? "#555",
											}}
										/>
										<span className="text-(--app-text) font-medium truncate">
											{dA?.name ?? "Unknown"}
										</span>
									</div>
								</td>
								<td className="px-3 py-2 text-(--app-text) font-mono">
									{conn.portA}
								</td>
								<td className="px-3 py-2 text-center text-(--app-text-muted)">
									⇄
								</td>
								<td className="px-3 py-2">
									<div className="flex items-center gap-1.5">
										<div
											className="w-2.5 h-2.5 rounded-sm shrink-0"
											style={{
												backgroundColor:
													dB?.color ?? "#555",
											}}
										/>
										<span className="text-(--app-text) font-medium truncate">
											{dB?.name ?? "Unknown"}
										</span>
									</div>
								</td>
								<td className="px-3 py-2 text-(--app-text) font-mono">
									{conn.portB}
								</td>
								<td className="px-3 py-2 text-(--app-text-muted) text-xs">
									{(() => {
										const pcA = getPortConfig(conn.deviceAId, conn.portA)
										const pcB = getPortConfig(conn.deviceBId, conn.portB)
										return negotiatedSpeed(pcA?.speed, pcB?.speed) ?? conn.speed ?? "—"
									})()}
								</td>
								<td className="px-3 py-2 text-right">
									<button
										type="button"
										className="text-(--app-text-muted) hover:text-red-400 p-1 rounded transition-colors"
										onClick={(e) => {
											e.stopPropagation()
											onDelete(conn.id)
										}}
										title="Disconnect"
									>
										<Trash2 size={14} />
									</button>
								</td>
							</tr>
						)
					})}
				</tbody>
			</table>
		</div>
	)
}
