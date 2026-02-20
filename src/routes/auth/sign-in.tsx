import { createFileRoute } from "@tanstack/react-router";
import { SignInForm } from "@/components/auth/AuthForms";

export const Route = createFileRoute("/auth/sign-in")({
	component: SignInForm,
});
