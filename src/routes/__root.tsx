import {
    HeadContent,
    Scripts,
    createRootRouteWithContext,
} from "@tanstack/react-router"
import type { ReactNode } from "react"

import Header from "../components/Header"
import TanStackQueryProvider from "../integrations/tanstack-query/root-provider"
import appCss from "../styles.css?url"

import type { TRPCRouter } from "@/integrations/trpc/router"
import type { QueryClient } from "@tanstack/react-query"
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query"

interface MyRouterContext {
	queryClient: QueryClient
	trpc: TRPCOptionsProxy<TRPCRouter>
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{ title: "CableOps – Cable Topology Manager" },
		],
		links: [{ rel: "stylesheet", href: appCss }],
	}),
	shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className="dark">
			<head>
				<HeadContent />
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var t=localStorage.getItem("cableops-theme");if(t==="light"){document.documentElement.classList.remove("dark")}else if(!t&&!window.matchMedia("(prefers-color-scheme: dark)").matches){document.documentElement.classList.remove("dark")}}catch(e){}})()`,
					}}
				/>
			</head>
			<body className="bg-[var(--app-bg)] text-[var(--app-text)] min-h-screen dark:bg-[var(--app-bg)] dark:text-[var(--app-text)]">
				<TanStackQueryProvider>
					<div className="flex flex-col h-screen">
						<Header />
						<main className="flex-1 overflow-hidden">
							{children}
						</main>
					</div>
				</TanStackQueryProvider>
				<Scripts />
			</body>
		</html>
	)
}
