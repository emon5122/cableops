import { auth } from "@/lib/auth";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";

export async function createTRPCContext(request: Request) {
	const session = await auth.api.getSession({ headers: request.headers });
	return {
		session,
		userId: session?.user?.id ?? null,
	};
}

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
	transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;
