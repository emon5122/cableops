import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "@/db/schema";

/**
 * Any drizzle Postgres database over the CableOps schema. Server modules take
 * this as a parameter so the app passes the node-postgres `db` and tests pass
 * an in-process PGlite database.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
