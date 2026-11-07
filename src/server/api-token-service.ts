/**
 * API token management (list / create / revoke) for the signed-in user.
 * Called only from session-authenticated tRPC procedures: a bearer token can
 * never reach these, so a token cannot mint or revoke tokens.
 */

import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import * as schema from "@/db/schema";
import {
	API_TOKEN_SCOPES,
	type ApiTokenScope,
	apiTokenState,
	generateApiToken,
} from "@/lib/api-tokens";
import type { Db } from "./db-type";

export const MAX_ACTIVE_TOKENS_PER_USER = 25;

export const createApiTokenInput = z.object({
	name: z.string().trim().min(1).max(64),
	scopes: z.array(z.enum(API_TOKEN_SCOPES)).min(1),
	/** null / omitted = never expires */
	expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});
export type CreateApiTokenInput = z.infer<typeof createApiTokenInput>;

export async function listApiTokens(db: Db, userId: string, now = new Date()) {
	const rows = await db
		.select({
			id: schema.apiTokens.id,
			name: schema.apiTokens.name,
			prefix: schema.apiTokens.prefix,
			scopes: schema.apiTokens.scopes,
			createdAt: schema.apiTokens.createdAt,
			lastUsedAt: schema.apiTokens.lastUsedAt,
			expiresAt: schema.apiTokens.expiresAt,
			revokedAt: schema.apiTokens.revokedAt,
		})
		.from(schema.apiTokens)
		.where(eq(schema.apiTokens.userId, userId))
		.orderBy(desc(schema.apiTokens.createdAt));
	return rows.map((r) => ({ ...r, state: apiTokenState(r, now) }));
}

export async function createApiToken(
	db: Db,
	userId: string,
	input: CreateApiTokenInput,
	now = new Date(),
) {
	const active = (await listApiTokens(db, userId, now)).filter(
		(t) => t.state === "active",
	);
	if (active.length >= MAX_ACTIVE_TOKENS_PER_USER) {
		throw new Error(
			`At most ${MAX_ACTIVE_TOKENS_PER_USER} active tokens per user; revoke one first`,
		);
	}

	// Deduplicated, in canonical order
	const scopes = API_TOKEN_SCOPES.filter((s): s is ApiTokenScope =>
		input.scopes.includes(s),
	);
	const { token, prefix, hash } = generateApiToken();
	const expiresAt = input.expiresInDays
		? new Date(now.getTime() + input.expiresInDays * 86_400_000)
		: null;
	const id = crypto.randomUUID();
	await db.insert(schema.apiTokens).values({
		id,
		userId,
		name: input.name,
		prefix,
		tokenHash: hash,
		scopes,
		createdAt: now,
		expiresAt,
	});
	return {
		id,
		name: input.name,
		prefix,
		scopes,
		expiresAt,
		createdAt: now,
		token,
	};
}

export async function revokeApiToken(
	db: Db,
	userId: string,
	tokenId: string,
	now = new Date(),
) {
	const rows = await db
		.update(schema.apiTokens)
		.set({ revokedAt: now })
		.where(
			and(
				eq(schema.apiTokens.id, tokenId),
				eq(schema.apiTokens.userId, userId),
				isNull(schema.apiTokens.revokedAt),
			),
		)
		.returning({ id: schema.apiTokens.id });
	return { revoked: rows.length > 0 };
}
