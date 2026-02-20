import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";

function getSystemTheme(): Theme {
	if (typeof window === "undefined") return "dark";
	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function getStoredTheme(): Theme | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem("cableops-theme") as Theme | null;
}

export function useTheme() {
	const [theme, setThemeState] = useState<Theme>(
		() => getStoredTheme() ?? getSystemTheme(),
	);

	useEffect(() => {
		const root = document.documentElement;
		if (theme === "dark") {
			root.classList.add("dark");
		} else {
			root.classList.remove("dark");
		}
		localStorage.setItem("cableops-theme", theme);
	}, [theme]);

	/* Listen for system theme changes when no stored preference */
	useEffect(() => {
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = (e: MediaQueryListEvent) => {
			if (!getStoredTheme()) {
				setThemeState(e.matches ? "dark" : "light");
			}
		};
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, []);

	const toggleTheme = useCallback(() => {
		setThemeState((t) => (t === "dark" ? "light" : "dark"));
	}, []);

	return { theme, toggleTheme } as const;
}
