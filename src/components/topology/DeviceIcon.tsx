import type { DeviceType } from "@/lib/topology-types"

/**
 * Renders an SVG icon for each device type.
 * All icons are 20x20, stroke-based, monochrome.
 */
export default function DeviceIcon({
	type,
	color = "currentColor",
	size = 20,
}: {
	type: DeviceType | string
	color?: string
	size?: number
}) {
	const props = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: color,
		strokeWidth: 1.8,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
	}

	switch (type) {
		case "switch":
			return (
				<svg {...props}>
					<rect x="2" y="6" width="20" height="12" rx="2" />
					<circle cx="6" cy="10" r="1" fill={color} stroke="none" />
					<circle cx="10" cy="10" r="1" fill={color} stroke="none" />
					<circle cx="14" cy="10" r="1" fill={color} stroke="none" />
					<circle cx="18" cy="10" r="1" fill={color} stroke="none" />
					<circle cx="6" cy="14" r="1" fill={color} stroke="none" />
					<circle cx="10" cy="14" r="1" fill={color} stroke="none" />
					<circle cx="14" cy="14" r="1" fill={color} stroke="none" />
					<circle cx="18" cy="14" r="1" fill={color} stroke="none" />
				</svg>
			)

		case "router":
			return (
				<svg {...props}>
					<circle cx="12" cy="12" r="9" />
					<path d="M12 3v18" />
					<path d="M3 12h18" />
					<path d="M5.5 5.5l13 13" />
					<path d="M18.5 5.5l-13 13" />
				</svg>
			)

		case "pc":
			return (
				<svg {...props}>
					<rect x="3" y="3" width="18" height="12" rx="2" />
					<path d="M8 21h8" />
					<path d="M12 15v6" />
				</svg>
			)

		case "server":
			return (
				<svg {...props}>
					<rect x="4" y="2" width="16" height="6" rx="1" />
					<rect x="4" y="10" width="16" height="6" rx="1" />
					<circle cx="8" cy="5" r="1" fill={color} stroke="none" />
					<circle cx="8" cy="13" r="1" fill={color} stroke="none" />
					<path d="M12 18v3" />
					<path d="M8 21h8" />
				</svg>
			)

		case "phone":
			return (
				<svg {...props}>
					<rect x="5" y="2" width="14" height="20" rx="2" />
					<rect x="8" y="5" width="8" height="8" rx="1" />
					<circle cx="9" cy="16" r="0.8" fill={color} stroke="none" />
					<circle cx="12" cy="16" r="0.8" fill={color} stroke="none" />
					<circle cx="15" cy="16" r="0.8" fill={color} stroke="none" />
					<circle cx="9" cy="19" r="0.8" fill={color} stroke="none" />
					<circle cx="12" cy="19" r="0.8" fill={color} stroke="none" />
					<circle cx="15" cy="19" r="0.8" fill={color} stroke="none" />
				</svg>
			)

		case "camera":
			return (
				<svg {...props}>
					<circle cx="12" cy="13" r="4" />
					<circle cx="12" cy="13" r="1.5" fill={color} stroke="none" />
					<path d="M3 9a2 2 0 0 1 2-2h1.5l1.5-2h8l1.5 2H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9z" />
				</svg>
			)

		case "firewall":
			return (
				<svg {...props}>
					<path d="M12 2l8 4v6c0 5.5-3.8 10.7-8 12-4.2-1.3-8-6.5-8-12V6l8-4z" />
					<path d="M12 8v4" />
					<path d="M10 10h4" />
				</svg>
			)

		case "access-point":
			return (
				<svg {...props}>
					<path d="M5.5 12.5a8 8 0 0 1 13 0" />
					<path d="M8 15a4 4 0 0 1 8 0" />
					<circle cx="12" cy="18" r="1.5" fill={color} stroke="none" />
					<path d="M12 5v4" />
					<path d="M3 9a12 12 0 0 1 18 0" />
				</svg>
			)

		case "cloud":
			return (
				<svg {...props}>
					<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
				</svg>
			)

		default:
			return (
				<svg {...props}>
					<rect x="2" y="6" width="20" height="12" rx="2" />
					<path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01" />
				</svg>
			)
	}
}
