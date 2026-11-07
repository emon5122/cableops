import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Link2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTRPC } from "@/integrations/trpc/react";
import {
	WORKSPACE_LINK_TYPE_LABELS,
	WORKSPACE_LINK_TYPES,
	type WorkspaceLinkType,
} from "@/lib/workspace-links";

interface WorkspaceLinkDialogProps {
	workspaceId: string;
	source: { deviceId: string; deviceName: string; port: number };
	onClose: () => void;
	onCreated: () => void;
}

const fieldClass =
	"w-full h-8 text-xs rounded-md bg-(--app-input-bg) border border-(--app-border) text-(--app-text) px-2";
const labelClass =
	"text-[10px] text-(--app-text-dim) uppercase tracking-wider block mb-1";

/**
 * Link a port to a port in another workspace: pick workspace → device →
 * port, then the link type. Only workspaces the user can edit are offered;
 * the server re-checks permissions and port use.
 */
export default function WorkspaceLinkDialog({
	workspaceId,
	source,
	onClose,
	onCreated,
}: WorkspaceLinkDialogProps) {
	const trpc = useTRPC();
	const uid = useId();
	const ids = {
		title: `${uid}-title`,
		workspace: `${uid}-workspace`,
		device: `${uid}-device`,
		type: `${uid}-type`,
		label: `${uid}-label`,
	};
	const [targetWorkspaceId, setTargetWorkspaceId] = useState("");
	const [targetDeviceId, setTargetDeviceId] = useState("");
	const [targetPort, setTargetPort] = useState<number | null>(null);
	const [linkType, setLinkType] = useState<WorkspaceLinkType>("vpn");
	const [label, setLabel] = useState("");

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const targetsQuery = useQuery(
		trpc.workspaceLinks.linkTargets.queryOptions({
			excludeWorkspaceId: workspaceId,
		}),
	);
	const devicesQuery = useQuery({
		...trpc.workspaceLinks.targetDevices.queryOptions({
			workspaceId: targetWorkspaceId,
		}),
		enabled: !!targetWorkspaceId,
	});
	const createLink = useMutation(
		trpc.workspaceLinks.create.mutationOptions({
			onSuccess: () => {
				onCreated();
				onClose();
			},
		}),
	);

	const targets = targetsQuery.data ?? [];
	const targetDevices = devicesQuery.data ?? [];
	const targetDevice = targetDevices.find((d) => d.id === targetDeviceId);

	const submit = () => {
		if (!targetWorkspaceId || !targetDeviceId || targetPort === null) return;
		createLink.mutate({
			a: { workspaceId, deviceId: source.deviceId, port: source.port },
			b: {
				workspaceId: targetWorkspaceId,
				deviceId: targetDeviceId,
				port: targetPort,
			},
			linkType,
			label: label.trim() || null,
		});
	};

	return (
		<div
			className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
			role="presentation"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby={ids.title}
				className="w-full max-w-md bg-(--app-surface) border border-(--app-border) rounded-xl shadow-2xl"
			>
				<div className="flex items-center justify-between px-4 py-3 border-b border-(--app-border)">
					<h3
						id={ids.title}
						className="text-sm font-bold text-(--app-text) flex items-center gap-2"
					>
						<Link2 size={14} className="text-violet-400" />
						Link to another workspace
					</h3>
					<button
						type="button"
						className="p-1 rounded text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover)"
						onClick={onClose}
						aria-label="Close"
					>
						<X size={16} />
					</button>
				</div>

				<div className="px-4 py-3 space-y-3">
					<p className="text-xs text-(--app-text-muted)">
						From{" "}
						<span className="text-(--app-text) font-semibold">
							{source.deviceName}
						</span>{" "}
						port {source.port}
					</p>

					{targetsQuery.isLoading ? (
						<p className="text-xs text-(--app-text-muted) animate-pulse">
							Loading workspaces…
						</p>
					) : targets.length === 0 ? (
						<p className="text-xs text-(--app-text-muted)">
							No other workspace you can edit. Create one from the{" "}
							<Link to="/" className="text-cyan-400 hover:underline">
								home page
							</Link>
							, or ask its owner to turn on collaboration mode.
						</p>
					) : (
						<>
							<div>
								<label htmlFor={ids.workspace} className={labelClass}>
									Workspace
								</label>
								<select
									id={ids.workspace}
									value={targetWorkspaceId}
									onChange={(e) => {
										setTargetWorkspaceId(e.target.value);
										setTargetDeviceId("");
										setTargetPort(null);
									}}
									className={fieldClass}
								>
									<option value="">Select workspace…</option>
									{targets.map((w) => (
										<option key={w.id} value={w.id}>
											{w.name}
										</option>
									))}
								</select>
							</div>

							{targetWorkspaceId && (
								<div>
									<label htmlFor={ids.device} className={labelClass}>
										Device
									</label>
									<select
										id={ids.device}
										value={targetDeviceId}
										onChange={(e) => {
											setTargetDeviceId(e.target.value);
											setTargetPort(null);
										}}
										className={fieldClass}
										disabled={devicesQuery.isLoading}
									>
										<option value="">
											{devicesQuery.isLoading
												? "Loading devices…"
												: targetDevices.length === 0
													? "No devices in that workspace"
													: "Select device…"}
										</option>
										{targetDevices
											.filter((d) => d.portCount > 0)
											.map((d) => (
												<option key={d.id} value={d.id}>
													{d.name}
												</option>
											))}
									</select>
								</div>
							)}

							{targetDevice && (
								<div>
									<span className={labelClass}>Port</span>
									<div className="flex flex-wrap gap-1">
										{Array.from({ length: targetDevice.portCount }, (_, i) => {
											const p = i + 1;
											const used = targetDevice.usedPorts.includes(p);
											const selected = targetPort === p;
											return (
												<button
													key={p}
													type="button"
													disabled={used}
													onClick={() => setTargetPort(p)}
													title={used ? `Port ${p} is in use` : `Port ${p}`}
													className={`w-7 h-7 rounded-md text-[10px] font-bold border transition-colors ${
														selected
															? "bg-violet-500 border-violet-300 text-white"
															: used
																? "bg-(--app-surface-alt) border-(--app-border) text-(--app-text-dim) opacity-40 cursor-not-allowed"
																: "bg-(--app-bg) border-(--app-border) text-(--app-text) hover:border-violet-400"
													}`}
												>
													{p}
												</button>
											);
										})}
									</div>
								</div>
							)}

							<div className="grid grid-cols-2 gap-2">
								<div>
									<label htmlFor={ids.type} className={labelClass}>
										Link type
									</label>
									<select
										id={ids.type}
										value={linkType}
										onChange={(e) =>
											setLinkType(e.target.value as WorkspaceLinkType)
										}
										className={fieldClass}
									>
										{WORKSPACE_LINK_TYPES.map((t) => (
											<option key={t} value={t}>
												{WORKSPACE_LINK_TYPE_LABELS[t]}
											</option>
										))}
									</select>
								</div>
								<div>
									<label htmlFor={ids.label} className={labelClass}>
										Label (optional)
									</label>
									<input
										id={ids.label}
										value={label}
										onChange={(e) => setLabel(e.target.value)}
										placeholder="e.g. wg0, ISP circuit"
										maxLength={120}
										className={fieldClass}
									/>
								</div>
							</div>
						</>
					)}

					{createLink.error && (
						<p className="text-xs text-red-400">{createLink.error.message}</p>
					)}
				</div>

				<div className="flex justify-end gap-2 px-4 py-3 border-t border-(--app-border)">
					<button
						type="button"
						className="px-3 py-1.5 text-xs rounded-md text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover)"
						onClick={onClose}
					>
						Cancel
					</button>
					<button
						type="button"
						className="px-3 py-1.5 text-xs font-semibold rounded-md bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
						disabled={
							!targetWorkspaceId ||
							!targetDeviceId ||
							targetPort === null ||
							createLink.isPending
						}
						onClick={submit}
					>
						{createLink.isPending ? "Linking…" : "Create link"}
					</button>
				</div>
			</div>
		</div>
	);
}
