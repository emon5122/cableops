/**
 * In-process Postgres for tests: PGlite + every migration in ./drizzle,
 * so tests also prove the migration chain applies cleanly.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { Db } from "@/server/db-type";

export async function createTestDb(): Promise<{
	db: Db;
	close: () => Promise<void>;
}> {
	const client = new PGlite();
	const db = drizzle(client, { schema });
	await migrate(db, { migrationsFolder: "./drizzle" });
	return { db, close: () => client.close() };
}

export async function insertUser(db: Db, id: string) {
	await db
		.insert(schema.user)
		.values({ id, name: id, email: `${id}@example.test` });
}
