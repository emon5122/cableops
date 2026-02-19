import { Button } from "@/components/ui/button"
import { useTheme } from "@/hooks/use-theme"
import { authClient } from "@/lib/auth-client"
import { Link } from "@tanstack/react-router"
import { Cable, LogOut, Moon, Sun, User } from "lucide-react"

export default function Header() {
	const { data: session } = authClient.useSession()
	const { theme, toggleTheme } = useTheme()

	return (
		<header className="h-14 px-4 flex items-center gap-3 bg-linear-to-b from-(--app-header-from) to-(--app-header-to) border-b border-(--app-border) shrink-0 dark:from-(--app-header-from) dark:to-(--app-header-to)">
			<Link to="/" className="flex items-center gap-2">
				<Cable className="text-cyan-400" size={22} />
				<h1 className="text-lg font-bold text-(--app-text)">CableOps</h1>
			</Link>
			<span className="text-(--app-text-muted) text-xs border border-(--app-border) px-2 py-0.5 rounded-full">
				beta
			</span>

			<div className="ml-auto flex items-center gap-3">
				{/* Theme toggle */}
				<Button
					size="xs"
					variant="ghost"
					className="text-(--app-text-muted) hover:text-white"
					onClick={toggleTheme}
					title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
				>
					{theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
				</Button>
				{session?.user ? (
					<>
						<div className="flex items-center gap-2">
							<div className="w-7 h-7 rounded-full bg-(--app-surface-hover) flex items-center justify-center">
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
							<span className="text-sm text-(--app-text) hidden sm:inline">
								{session.user.name ?? session.user.email}
							</span>
						</div>
						<Button
							size="xs"
							variant="ghost"
							className="text-(--app-text-muted) hover:text-white"
							onClick={() => void authClient.signOut()}
						>
							<LogOut size={14} />
						</Button>
					</>
				) : (
					<Link
						to="/auth/sign-in"
						className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
					>
						Sign in
					</Link>
				)}
			</div>
		</header>
	)
}
