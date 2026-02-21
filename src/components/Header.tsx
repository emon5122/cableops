import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth-client";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Cable, Moon, Power, Sun, User } from "lucide-react";

export default function Header() {
	const { data: session } = authClient.useSession();
	const { theme, toggleTheme } = useTheme();

	return (
		<header className="h-12 lg:h-14 px-3 lg:px-4 flex items-center gap-2 lg:gap-3 bg-linear-to-b from-(--app-header-from) to-(--app-header-to) border-b border-(--app-border) shrink-0 dark:from-(--app-header-from) dark:to-(--app-header-to)">
			<Link to="/" className="flex items-center gap-1.5 lg:gap-2 shrink-0">
				<motion.div whileHover={{ rotate: -8, scale: 1.08 }} transition={{ duration: 0.15 }}>
					<Cable className="text-cyan-400" size={20} />
				</motion.div>
				<h1 className="text-base lg:text-lg font-bold text-(--app-text)">CableOps</h1>
			</Link>
			<span className="text-(--app-text-muted) text-[10px] lg:text-xs border border-(--app-border) px-1.5 lg:px-2 py-0.5 rounded-full hidden sm:inline-block">
				beta
			</span>

			<div className="ml-auto flex items-center gap-1.5 lg:gap-2">
				{/* Theme toggle */}
				<Button
					size="sm"
					variant="ghost"
					className="text-(--app-text-muted) hover:text-(--app-text) hover:bg-(--app-surface-hover) rounded-lg gap-1.5"
					onClick={toggleTheme}
					title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
					asChild
				>
					<motion.button whileTap={{ scale: 0.95 }} type="button">
						{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
						<span className="text-xs hidden lg:inline">{theme === "dark" ? "Light" : "Dark"}</span>
					</motion.button>
				</Button>
				{session?.user ? (
					<>
						<div className="hidden md:flex items-center gap-2">
							<div
								className="w-7 h-7 rounded-full bg-(--app-surface-hover) flex items-center justify-center shrink-0"
							>
								{session.user.image ? (
									<img
										src={session.user.image}
										alt=""
										className="w-7 h-7 rounded-full"
									/>
								) : (
									<User size={14} className="text-(--app-text-muted)" />
								)}
							</div>
							<span className="text-sm text-(--app-text) max-w-32 truncate">
								{session.user.name ?? session.user.email}
							</span>
						</div>
						<div className="w-px h-5 bg-(--app-border) hidden md:block" />
						<Button
							size="sm"
							variant="ghost"
							className="text-red-400 hover:text-red-300 hover:bg-red-500/15 rounded-lg gap-1.5 transition-colors border border-red-500/20"
							onClick={() => void authClient.signOut()}
							title="Sign out"
							asChild
						>
							<motion.button whileTap={{ scale: 0.95 }} type="button">
								<Power size={14} />
								<span className="text-xs font-medium">Sign out</span>
							</motion.button>
						</Button>
					</>
				) : (
					<Link to="/auth/sign-in">
						<Button
							size="sm"
							className="bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg"
						>
							<User size={14} />
							<span className="text-xs">Sign in</span>
						</Button>
					</Link>
				)}
			</div>
		</header>
	);
}
