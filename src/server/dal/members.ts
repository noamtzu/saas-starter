import { and, asc, count, eq } from "drizzle-orm";
import { memberships, users } from "@/db/schema";
import {
  assertCanChangeRole,
  assertCanRemove,
  type Role,
} from "@/server/auth/permissions";
import { NotFoundError } from "@/server/errors";
import type { Tx } from "@/db/client";
import { lockOrg, withTenant, type TenantContext } from "./rls";

export type Member = {
  userId: string;
  name: string | null;
  email: string | null;
  role: Role;
  joinedAt: Date;
};

export async function listMembers(ctx: TenantContext): Promise<Member[]> {
  return withTenant(ctx, (tx) =>
    tx
      .select({
        userId: memberships.userId,
        name: users.name,
        email: users.email,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, ctx.orgId))
      .orderBy(asc(memberships.createdAt)),
  );
}

async function loadTarget(tx: Tx, ctx: TenantContext, userId: string) {
  // Serialise membership changes so two owners cannot demote each other at once.
  await lockOrg(tx, ctx.orgId);
  const [target] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, userId)));
  if (!target) throw new NotFoundError("Member not found.");

  const [owners] = await tx
    .select({ n: count() })
    .from(memberships)
    .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.role, "owner")));
  return { role: target.role, ownerCount: owners?.n ?? 0 };
}

export async function changeMemberRole(
  ctx: TenantContext,
  input: { userId: string; role: Role },
): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const target = await loadTarget(tx, ctx, input.userId);
    assertCanChangeRole({
      actor: ctx.role,
      target: target.role,
      next: input.role,
      isSelf: input.userId === ctx.userId,
      ownerCount: target.ownerCount,
    });
    await tx
      .update(memberships)
      .set({ role: input.role })
      .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, input.userId)));
  });
}

export async function removeMember(ctx: TenantContext, userId: string): Promise<void> {
  await withTenant(ctx, async (tx) => {
    const target = await loadTarget(tx, ctx, userId);
    assertCanRemove({
      actor: ctx.role,
      target: target.role,
      isSelf: userId === ctx.userId,
      ownerCount: target.ownerCount,
    });
    await tx
      .delete(memberships)
      .where(and(eq(memberships.orgId, ctx.orgId), eq(memberships.userId, userId)));
  });
}
