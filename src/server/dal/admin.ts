import { count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, organizations, projects } from "@/db/schema";
import { resolvePlan, type PlanId } from "@/server/billing/plans";

export type AdminOrgRow = {
  id: string;
  name: string;
  slug: string;
  plan: PlanId;
  subscriptionStatus: string | null;
  currentPeriodEnd: Date | null;
  members: number;
  projects: number;
  createdAt: Date;
};

/**
 * System path, cross-tenant by design. Callers must have passed
 * `requirePlatformAdmin()`; this module does not check the session itself so
 * it stays usable from scripts and tests.
 */
export async function listAllOrganizations(): Promise<AdminOrgRow[]> {
  const memberCounts = db
    .select({ orgId: memberships.orgId, n: count().as("member_count") })
    .from(memberships)
    .groupBy(memberships.orgId)
    .as("mc");
  const projectCounts = db
    .select({ orgId: projects.orgId, n: count().as("project_count") })
    .from(projects)
    .groupBy(projects.orgId)
    .as("pc");

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      subscriptionStatus: organizations.subscriptionStatus,
      currentPeriodEnd: organizations.currentPeriodEnd,
      createdAt: organizations.createdAt,
      members: sql<number>`coalesce(${memberCounts.n}, 0)::int`,
      projects: sql<number>`coalesce(${projectCounts.n}, 0)::int`,
    })
    .from(organizations)
    .leftJoin(memberCounts, eq(memberCounts.orgId, organizations.id))
    .leftJoin(projectCounts, eq(projectCounts.orgId, organizations.id))
    .orderBy(desc(organizations.createdAt));

  return rows.map((r) => ({ ...r, plan: resolvePlan(r).id }));
}
