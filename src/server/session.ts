import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { findTenant } from "@/server/dal/organizations";
import type { TenantContext } from "@/server/dal/rls";

/**
 * Request-scoped helpers that bridge Next.js (session, redirects) and the DAL.
 * Authorisation lives here and in the DAL, not in a proxy/middleware, so it
 * runs next to the data it protects on every request.
 */

export const requireUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");
  return session.user;
});

export const requireTenant = cache(async (slug: string): Promise<TenantContext> => {
  const user = await requireUser();
  const tenant = await findTenant(user.id, slug);
  // 404 rather than 403: do not confirm that an organisation exists.
  if (!tenant) notFound();
  return tenant;
});

export const requirePlatformAdmin = cache(async () => {
  const user = await requireUser();
  if (!user.isPlatformAdmin) notFound();
  return user;
});
