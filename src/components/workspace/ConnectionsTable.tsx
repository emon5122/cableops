import type {
    ConnectionRow,
    DeviceRow,
    DeviceType,
    InterfaceRow,
} from "@/lib/topology-types";
import { DEVICE_TYPE_LABELS, negotiatedSpeed } from "@/lib/topology-types";
import {
    ArrowLeftRight,
    Cable,
    Download,
    Layers,
    Monitor,
    Trash2,
    Zap,
} from "lucide-react";
import { useCallback, useMemo } from "react";

interface ConnectionsTableProps {
	connections: ConnectionRow[];
	devices: DeviceRow[];
	portConfigs: InterfaceRow[];
	onDelete: (id: string) => void;
	highlightedConnectionId: string | null;
	onHighlight: (id: string | null) => void;
	searchQuery: string;
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
	const getDevice = (id: string) => devices.find((d) => d.id === id);
	const getPortConfig = (deviceId: string, portNumber: number) =>
		portConfigs.find(
			(pc) => pc.deviceId === deviceId && pc.portNumber === portNumber,
		);

	const filtered = connections.filter((conn) => {
		if (!searchQuery) return true;
		const q = searchQuery.toLowerCase();
		const dA = getDevice(conn.deviceAId);
		const dB = getDevice(conn.deviceBId);
		return (
			dA?.name.toLowerCase().includes(q) ||
			dB?.name.toLowerCase().includes(q) ||
			String(conn.portA).includes(q) ||
			String(conn.portB).includes(q) ||
			conn.speed?.toLowerCase().includes(q)
		);
	});

	/* ── Stats ── */
	const stats = useMemo(() => {
		const totalPorts = devices.reduce((s, d) => s + d.portCount, 0);
		const usedPorts = new Set<string>();
		for (const c of connections) {
			usedPorts.add(`${c.deviceAId}:${c.portA}`);
			usedPorts.add(`${c.deviceBId}:${c.portB}`);
		}
		const utilPct =
			totalPorts > 0 ? Math.round((usedPorts.size / totalPorts) * 100) : 0;

		const vlans = new Set<number>();
		for (const pc of portConfigs) {
			if (pc.vlan != null) vlans.add(pc.vlan);
		}

		return {
			totalDevices: devices.length,
			totalConnections: connections.length,
			utilPct,
			totalPorts,
			usedPorts: usedPorts.size,
			vlanCount: vlans.size,
		};
	}, [devices, connections, portConfigs]);

	if (connections.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 text-(--app-text-muted)">
				<ArrowLeftRight size={32} className="opacity-30 mb-3" />
				<p className="text-sm font-medium">No connections yet</p>
				<p className="text-xs mt-1">
					Click two free ports to create a connection
				</p>
			</div>
		);
	}

	const handleDownloadPdf = useCallback(async () => {
		const { default: jsPDF } = await import("jspdf");
		const { default: autoTable } = await import("jspdf-autotable");

		const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
		const pageW = doc.internal.pageSize.getWidth();

		/* Title */
		doc.setFontSize(16);
		doc.setFont("helvetica", "bold");
		doc.text("Network Links Report", pageW / 2, 14, { align: "center" });

		/* Stats summary */
		doc.setFontSize(9);
		doc.setFont("helvetica", "normal");
		doc.text(
			`Devices: ${stats.totalDevices}  |  Links: ${stats.totalConnections}  |  Port Utilization: ${stats.utilPct}% (${stats.usedPorts}/${stats.totalPorts})  |  VLANs: ${stats.vlanCount}`,
			pageW / 2,
			21,
			{ align: "center" },
		);

		/* Table data */
		const rows = filtered.map((conn, idx) => {
			const dA = getDevice(conn.deviceAId);
			const dB = getDevice(conn.deviceBId);
			const pcA = getPortConfig(conn.deviceAId, conn.portA);
			const pcB = getPortConfig(conn.deviceBId, conn.portB);
			const spd = negotiatedSpeed(pcA?.speed, pcB?.speed) ?? conn.speed ?? "—";
			return [
				String(idx + 1),
				`${dA?.name ?? "Unknown"} (${dA ? (DEVICE_TYPE_LABELS[dA.deviceType as DeviceType] ?? dA.deviceType) : ""})`,
				String(conn.portA),
				pcA?.ipAddress ?? "",
				`${dB?.name ?? "Unknown"} (${dB ? (DEVICE_TYPE_LABELS[dB.deviceType as DeviceType] ?? dB.deviceType) : ""})`,
				String(conn.portB),
				pcB?.ipAddress ?? "",
				spd,
				conn.connectionType ?? "wired",
			];
		});

		autoTable(doc, {
			startY: 25,
			head: [["#", "Device A", "Port A", "IP A", "Device B", "Port B", "IP B", "Speed", "Type"]],
			body: rows,
			theme: "grid",
			headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8, fontStyle: "bold" },
			bodyStyles: { fontSize: 7.5 },
			alternateRowStyles: { fillColor: [241, 245, 249] },
			margin: { left: 10, right: 10 },
			styles: { cellPadding: 2, overflow: "linebreak" },
		});

		/* Footer with timestamp */
		const pageCount = doc.getNumberOfPages();
		for (let i = 1; i <= pageCount; i++) {
			doc.setPage(i);
			doc.setFontSize(7);
			doc.setTextColor(150);
			doc.text(
				`Generated ${new Date().toLocaleString()} — CableOps`,
				pageW / 2,
				doc.internal.pageSize.getHeight() - 6,
				{ align: "center" },
			);
		}

		doc.save("network-links-report.pdf");
	}, [filtered, stats, getDevice, getPortConfig]);

	return (
		<div className="overflow-x-auto">
			{/* Stats cards */}
			<div className="grid grid-cols-2 lg:grid-cols-4 gap-2 px-3 py-3 border-b border-(--app-border)">
				{(
					[
						{
							icon: Monitor,
							label: "Devices",
							value: stats.totalDevices,
							color: "text-blue-400",
						},
						{
							icon: Cable,
							label: "Links",
							value: stats.totalConnections,
							color: "text-emerald-400",
						},
						{
							icon: Zap,
							label: "Port Util",
							value: `${stats.utilPct}%`,
							sub: `${stats.usedPorts}/${stats.totalPorts}`,
							color: "text-amber-400",
						},
						{
							icon: Layers,
							label: "VLANs",
							value: stats.vlanCount,
							color: "text-cyan-400",
						},
					] as const
				).map((s) => (
					<div
						key={s.label}
						className="bg-(--app-surface) rounded-lg border border-(--app-border) px-2.5 lg:px-3 py-2"
					>
						<div className="flex items-center gap-1.5 mb-1">
							<s.icon size={12} className={s.color} />
							<span className="text-[10px] text-(--app-text-muted) uppercase tracking-wider">
								{s.label}
							</span>
						</div>
						<div className="text-lg font-bold text-(--app-text) leading-tight">
							{s.value}
						</div>
						{"sub" in s && s.sub && (
							<div className="text-[10px] text-(--app-text-dim) font-mono">
								{s.sub}
							</div>
						)}
					</div>
				))}
			</div>
			{/* PDF download button */}
			<div className="flex justify-end px-3 py-2 border-b border-(--app-border)">
				<button
					type="button"
					className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-(--app-surface) border border-(--app-border) text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover) transition-colors"
					onClick={handleDownloadPdf}
					title="Download links report as PDF"
				>
					<Download size={13} />
					Download PDF
				</button>
			</div>
			<table className="w-full text-xs lg:text-sm border-collapse min-w-160">
				<thead>
					<tr className="bg-(--app-surface) text-(--app-text-muted) text-xs">
						<th className="text-left px-3 py-2 font-semibold w-8">#</th>
						<th className="text-left px-3 py-2 font-semibold">Device A</th>
						<th className="text-left px-3 py-2 font-semibold w-16">Port</th>
						<th className="text-center px-3 py-2 font-semibold w-10">⇄</th>
						<th className="text-left px-3 py-2 font-semibold">Device B</th>
						<th className="text-left px-3 py-2 font-semibold w-16">Port</th>
						<th className="text-left px-3 py-2 font-semibold w-20">Speed</th>
						<th className="text-right px-3 py-2 font-semibold w-12" />
					</tr>
				</thead>
				<tbody>
					{filtered.map((conn, idx) => {
						const dA = getDevice(conn.deviceAId);
						const dB = getDevice(conn.deviceBId);
						const isHighlighted = highlightedConnectionId === conn.id;
						return (
							<tr
								key={conn.id}
								className={`border-b border-(--app-border) cursor-pointer transition-colors ${
									isHighlighted
										? "bg-(--app-surface-hover)"
										: "hover:bg-(--app-surface-alt)"
								}`}
								onClick={() => onHighlight(isHighlighted ? null : conn.id)}
							>
								<td className="px-3 py-2 text-(--app-text-muted)">{idx + 1}</td>
								<td className="px-3 py-2">
									<div className="flex items-center gap-1.5">
										<div
											className="w-2.5 h-2.5 rounded-sm shrink-0"
											style={{
												backgroundColor: dA?.color ?? "#555",
											}}
										/>
										<div className="min-w-0">
											<span className="text-(--app-text) font-medium truncate block">
												{dA?.name ?? "Unknown"}
											</span>
											<span className="text-[10px] text-(--app-text-dim)">
												{dA
													? (DEVICE_TYPE_LABELS[dA.deviceType as DeviceType] ??
														dA.deviceType)
													: ""}
											</span>
											{(() => {
												const pcA = getPortConfig(conn.deviceAId, conn.portA);
												if (pcA?.ipAddress)
													return (
														<span className="text-[10px] text-emerald-400 font-mono block">
															{pcA.ipAddress}
														</span>
													);
												return null;
											})()}
										</div>
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
												backgroundColor: dB?.color ?? "#555",
											}}
										/>
										<div className="min-w-0">
											<span className="text-(--app-text) font-medium truncate block">
												{dB?.name ?? "Unknown"}
											</span>
											<span className="text-[10px] text-(--app-text-dim)">
												{dB
													? (DEVICE_TYPE_LABELS[dB.deviceType as DeviceType] ??
														dB.deviceType)
													: ""}
											</span>
											{(() => {
												const pcB = getPortConfig(conn.deviceBId, conn.portB);
												if (pcB?.ipAddress)
													return (
														<span className="text-[10px] text-emerald-400 font-mono block">
															{pcB.ipAddress}
														</span>
													);
												return null;
											})()}
										</div>
									</div>
								</td>
								<td className="px-3 py-2 text-(--app-text) font-mono">
									{conn.portB}
								</td>
								<td className="px-3 py-2 text-(--app-text-muted) text-xs">
									{(() => {
										const pcA = getPortConfig(conn.deviceAId, conn.portA);
										const pcB = getPortConfig(conn.deviceBId, conn.portB);
										return (
											negotiatedSpeed(pcA?.speed, pcB?.speed) ??
											conn.speed ??
											"—"
										);
									})()}
								</td>
								<td className="px-3 py-2 text-right">
									<button
										type="button"
										className="text-(--app-text-muted) hover:text-red-400 p-1 rounded transition-colors"
										onClick={(e) => {
											e.stopPropagation();
											onDelete(conn.id);
										}}
										title="Disconnect"
									>
										<Trash2 size={14} />
									</button>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
