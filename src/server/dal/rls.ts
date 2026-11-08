import { sql } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import type { Role } from "@/server/auth/permissions";

/** Who is acting, and in which organisation. Produced by `requireTenant` after a membership check. */
export type TenantContext = {
  userId: string;
  orgId: string;
  orgSlug: string;
  role: Role;
};

type RlsScope = { userId: string; orgId?: string };

/**
 * Runs `fn` in a transaction that is subject to Postgres row-level security.
 *
 * - `app.user_id` / `app.org_id` are set with `set_config(..., true)`, so they
 *   are local to this transaction and cannot leak to the next pooled request.
 * - `SET LOCAL ROLE app_user` drops privileges for the rest of the
 *   transaction. That role has narrow grants and every tenant table has
 *   policies keyed on the settings above (see drizzle/0001_rls.sql).
 *
 * The DAL still filters by `org_id` explicitly in every query. RLS is the
 * second line of defence for when a query is written wrong.
 */
export async function withRls<T>(scope: RlsScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${scope.userId}, true), set_config('app.org_id', ${scope.orgId ?? ""}, true)`,
    );
    await tx.execute(sql`set local role app_user`);
    return fn(tx);
  });
}

export function withTenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withRls({ userId: ctx.userId, orgId: ctx.orgId }, fn);
}

/**
 * Serialises "count then insert" sequences per organisation so two concurrent
 * requests cannot both pass a plan-limit check. Transaction-scoped.
 */
export async function lockOrg(tx: Tx, orgId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${orgId}, 0))`);
}
