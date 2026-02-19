import { SignInForm } from "@/components/auth/AuthForms"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/auth/sign-in")({
	component: SignInForm,
})
