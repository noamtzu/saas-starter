import { and, count, desc, eq } from "drizzle-orm";
import { organizations, projects, type Project } from "@/db/schema";
import { authorize } from "@/server/auth/permissions";
import { assertWithinLimit, resolvePlan, usageFor, type Usage } from "@/server/billing/plans";
import { NotFoundError, ValidationError } from "@/server/errors";
import { lockOrg, withTenant, type TenantContext } from "./rls";

export async function listProjects(ctx: TenantContext): Promise<Project[]> {
  return withTenant(ctx, (tx) =>
    tx
      .select()
      .from(projects)
      .where(eq(projects.orgId, ctx.orgId))
      .orderBy(desc(projects.createdAt)),
  );
}

export async function getProjectUsage(ctx: TenantContext): Promise<Usage> {
  return withTenant(ctx, async (tx) => {
    const [org] = await tx
      .select({ subscriptionStatus: organizations.subscriptionStatus })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId));
    if (!org) throw new NotFoundError("Organisation not found.");
    const [row] = await tx
      .select({ n: count() })
      .from(projects)
      .where(eq(projects.orgId, ctx.orgId));
    return usageFor(resolvePlan(org), "projects", row?.n ?? 0);
  });
}

export async function createProject(ctx: TenantContext, input: { name: string }): Promise<Project> {
  authorize(ctx.role, "project:create");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) {
    throw new ValidationError("Project name must be between 2 and 80 characters.");
  }

  return withTenant(ctx, async (tx) => {
    await lockOrg(tx, ctx.orgId);
    const [org] = await tx
      .select({ subscriptionStatus: organizations.subscriptionStatus })
      .from(organizations)
      .where(eq(organizations.id, ctx.orgId));
    if (!org) throw new NotFoundError("Organisation not found.");

    const [row] = await tx
      .select({ n: count() })
      .from(projects)
      .where(eq(projects.orgId, ctx.orgId));
    assertWithinLimit(resolvePlan(org), "projects", row?.n ?? 0);

    const [project] = await tx
      .insert(projects)
      .values({ orgId: ctx.orgId, name, createdById: ctx.userId })
      .returning();
    return project!;
  });
}

export async function deleteProject(ctx: TenantContext, projectId: string): Promise<void> {
  authorize(ctx.role, "project:delete");
  await withTenant(ctx, async (tx) => {
    const deleted = await tx
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.orgId, ctx.orgId)))
      .returning({ id: projects.id });
    if (deleted.length === 0) throw new NotFoundError("Project not found.");
  });
}
