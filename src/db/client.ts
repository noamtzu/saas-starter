import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reuse one pool across hot reloads in development.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForDb.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
  });

if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;

/**
 * The privileged connection. It is NOT subject to row-level security, so
 * application code should reach tenant data through `withRls` in
 * `src/server/dal/rls.ts`. Direct use is reserved for the few system paths that
 * are explicitly marked as such (bootstrap, invitations, webhooks, admin).
 */
export const db = drizzle(pool, { schema });

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
