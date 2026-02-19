import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "@tanstack/react-router"
import { Cable, LogIn, UserPlus } from "lucide-react"
import { useState } from "react"

export function SignInForm() {
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const router = useRouter()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)
		setLoading(true)
		try {
			const result = await authClient.signIn.email({
				email,
				password,
			})
			if (result.error) {
				setError(result.error.message ?? "Sign in failed")
			} else {
				router.navigate({ to: "/" })
			}
		} catch {
			setError("An unexpected error occurred")
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-(--app-bg) p-4">
			<div className="w-full max-w-sm">
				<div className="text-center mb-8">
					<div className="flex items-center justify-center gap-3 mb-3">
						<Cable className="text-cyan-400" size={32} />
						<h1 className="text-2xl font-bold text-(--app-text)">
							CableOps
						</h1>
					</div>
					<p className="text-(--app-text-muted) text-sm">
						Sign in to manage your cable topologies
					</p>
				</div>

				<form
					onSubmit={handleSubmit}
					className="bg-(--app-surface) border border-(--app-border) rounded-xl p-6 space-y-4"
				>
					{error && (
						<div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
							{error}
						</div>
					)}

					<div>
						<Label className="text-xs text-(--app-text-muted)">Email</Label>
						<Input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@example.com"
							required
							className="mt-1 bg-(--app-input-bg) border-(--app-border) text-(--app-text)"
						/>
					</div>

					<div>
						<Label className="text-xs text-(--app-text-muted)">
							Password
						</Label>
						<Input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="••••••••"
							required
							className="mt-1 bg-(--app-input-bg) border-(--app-border) text-(--app-text)"
						/>
					</div>

					<Button
						type="submit"
						disabled={loading}
						className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
					>
						<LogIn size={16} />
						{loading ? "Signing in…" : "Sign In"}
					</Button>

					<p className="text-center text-xs text-(--app-text-muted)">
						Don't have an account?{" "}
						<a
							href="/auth/sign-up"
							className="text-cyan-400 hover:underline"
						>
							Sign up
						</a>
					</p>
				</form>
			</div>
		</div>
	)
}

export function SignUpForm() {
	const [name, setName] = useState("")
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [loading, setLoading] = useState(false)
	const router = useRouter()

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault()
		setError(null)
		setLoading(true)
		try {
			const result = await authClient.signUp.email({
				name,
				email,
				password,
			})
			if (result.error) {
				setError(result.error.message ?? "Sign up failed")
			} else {
				router.navigate({ to: "/" })
			}
		} catch {
			setError("An unexpected error occurred")
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="min-h-screen flex items-center justify-center bg-(--app-bg) p-4">
			<div className="w-full max-w-sm">
				<div className="text-center mb-8">
					<div className="flex items-center justify-center gap-3 mb-3">
						<Cable className="text-cyan-400" size={32} />
						<h1 className="text-2xl font-bold text-(--app-text)">
							CableOps
						</h1>
					</div>
					<p className="text-(--app-text-muted) text-sm">
						Create your account to get started
					</p>
				</div>

				<form
					onSubmit={handleSubmit}
					className="bg-(--app-surface) border border-(--app-border) rounded-xl p-6 space-y-4"
				>
					{error && (
						<div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
							{error}
						</div>
					)}

					<div>
						<Label className="text-xs text-(--app-text-muted)">Name</Label>
						<Input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Your name"
							required
							className="mt-1 bg-(--app-input-bg) border-(--app-border) text-(--app-text)"
						/>
					</div>

					<div>
						<Label className="text-xs text-(--app-text-muted)">Email</Label>
						<Input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@example.com"
							required
							className="mt-1 bg-(--app-input-bg) border-(--app-border) text-(--app-text)"
						/>
					</div>

					<div>
						<Label className="text-xs text-(--app-text-muted)">
							Password
						</Label>
						<Input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="••••••••"
							required
							minLength={8}
							className="mt-1 bg-(--app-input-bg) border-(--app-border) text-(--app-text)"
						/>
					</div>

					<Button
						type="submit"
						disabled={loading}
						className="w-full bg-cyan-600 hover:bg-cyan-700 text-white"
					>
						<UserPlus size={16} />
						{loading ? "Creating account…" : "Sign Up"}
					</Button>

					<p className="text-center text-xs text-(--app-text-muted)">
						Already have an account?{" "}
						<a
							href="/auth/sign-in"
							className="text-cyan-400 hover:underline"
						>
							Sign in
						</a>
					</p>
				</form>
			</div>
		</div>
	)
}
