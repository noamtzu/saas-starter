import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, organizations, type Organization } from "@/db/schema";
import { authorize, type Role } from "@/server/auth/permissions";
import { ValidationError } from "@/server/errors";
import { slugify, randomSuffix } from "@/lib/slug";
import { withRls, withTenant, type TenantContext } from "./rls";

export type OrgSummary = { id: string; name: string; slug: string; role: Role };

export async function listOrganizationsForUser(userId: string): Promise<OrgSummary[]> {
  return withRls({ userId }, (tx) =>
    tx
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        role: memberships.role,
      })
      .from(organizations)
      .innerJoin(
        memberships,
        and(eq(memberships.orgId, organizations.id), eq(memberships.userId, userId)),
      )
      .orderBy(asc(organizations.name)),
  );
}

/**
 * Resolves `slug` to a tenant context for `userId`, or null when the user is
 * not a member. This is the gate every `/o/[slug]` request passes through.
 */
export async function findTenant(userId: string, slug: string): Promise<TenantContext | null> {
  const rows = await withRls({ userId }, (tx) =>
    tx
      .select({ orgId: organizations.id, orgSlug: organizations.slug, role: memberships.role })
      .from(organizations)
      .innerJoin(
        memberships,
        and(eq(memberships.orgId, organizations.id), eq(memberships.userId, userId)),
      )
      .where(eq(organizations.slug, slug))
      .limit(1),
  );
  const row = rows[0];
  return row ? { userId, ...row } : null;
}

export async function getOrganization(ctx: TenantContext): Promise<Organization> {
  const [org] = await withTenant(ctx, (tx) =>
    tx.select().from(organizations).where(eq(organizations.id, ctx.orgId)),
  );
  return org!;
}

function validateName(raw: string): string {
  const name = raw.trim();
  if (name.length < 2 || name.length > 60) {
    throw new ValidationError("Organisation name must be between 2 and 60 characters.");
  }
  return name;
}

/**
 * System path: a new organisation has no members yet, so no RLS policy could
 * admit the insert. We create the org and its owner membership atomically on
 * the privileged connection; the only input trusted here is the caller's own
 * user id from the session.
 */
export async function createOrganization(
  userId: string,
  input: { name: string },
): Promise<{ id: string; slug: string }> {
  const name = validateName(input.name);
  const base = slugify(name) || "org";

  return db.transaction(async (tx) => {
    let slug = base;
    for (let attempt = 0; attempt < 5; attempt++) {
      const [created] = await tx
        .insert(organizations)
        .values({ name, slug })
        .onConflictDoNothing({ target: organizations.slug })
        .returning({ id: organizations.id, slug: organizations.slug });
      if (created) {
        await tx.insert(memberships).values({ orgId: created.id, userId, role: "owner" });
        return created;
      }
      slug = `${base}-${randomSuffix()}`;
    }
    throw new ValidationError("Could not find a free URL for that name. Try another.");
  });
}

export async function renameOrganization(ctx: TenantContext, input: { name: string }) {
  authorize(ctx.role, "org:rename");
  const name = validateName(input.name);
  await withTenant(ctx, (tx) =>
    tx.update(organizations).set({ name }).where(eq(organizations.id, ctx.orgId)),
  );
}
