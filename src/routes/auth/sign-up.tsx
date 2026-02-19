import { SignUpForm } from "@/components/auth/AuthForms"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/auth/sign-up")({
	component: SignUpForm,
})
