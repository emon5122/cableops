import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";
import { db } from "@/db";
import {
	createApiToken,
	createApiTokenInput,
	listApiTokens,
	revokeApiToken,
} from "@/server/api-token-service";
import { publicProcedure, type TRPCContext } from "./init";

/**
 * Token management requires a browser session. A request authenticated with
 * an API token (or carrying one) is refused, so a token can never mint,
 * list or revoke tokens.
 */
export function requireSessionUser(
	ctx: Pick<TRPCContext, "userId" | "hasBearerToken">,
): string {
	if (ctx.hasBearerToken) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"API tokens cannot manage API tokens; sign in with a browser session",
		});
	}
	if (!ctx.userId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Sign in to manage API tokens",
		});
	}
	return ctx.userId;
}

export const apiTokensRouter = {
	list: publicProcedure.query(({ ctx }) =>
		listApiTokens(db, requireSessionUser(ctx)),
	),

	/** Returns the plaintext token exactly once */
	create: publicProcedure
		.input(createApiTokenInput)
		.mutation(async ({ ctx, input }) => {
			const userId = requireSessionUser(ctx);
			try {
				return await createApiToken(db, userId, input);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error ? error.message : "Could not create token",
				});
			}
		}),

	revoke: publicProcedure
		.input(z.object({ id: z.string().min(1) }))
		.mutation(({ ctx, input }) =>
			revokeApiToken(db, requireSessionUser(ctx), input.id),
		),
} satisfies TRPCRouterRecord;
