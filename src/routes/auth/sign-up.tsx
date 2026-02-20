import { createFileRoute } from "@tanstack/react-router";
import { SignUpForm } from "@/components/auth/AuthForms";

export const Route = createFileRoute("/auth/sign-up")({
	component: SignUpForm,
});
