import "./load-env";
import { sql } from "drizzle-orm";
import { db, pool } from "./client";
import { memberships, organizations, projects, users } from "./schema";

/**
 * Idempotent demo data. All people and companies are fictional; every email
 * uses the reserved example.com domain.
 *
 *   admin@example.com   platform admin (sees /admin)
 *   owner@example.com   owner of Acme (Free) and Globex (Pro)
 *   member@example.com  member of Acme
 */
const people = [
  { id: "seed-user-admin", email: "admin@example.com", name: "Avery Admin", isPlatformAdmin: true },
  { id: "seed-user-owner", email: "owner@example.com", name: "Olive Owner", isPlatformAdmin: false },
  { id: "seed-user-member", email: "member@example.com", name: "Milo Member", isPlatformAdmin: false },
];

const orgs = [
  { id: "00000000-0000-4000-8000-00000000a001", name: "Acme Inc", slug: "acme" },
  {
    id: "00000000-0000-4000-8000-00000000b001",
    name: "Globex",
    slug: "globex",
    // Looks like an active subscription so the Pro plan can be seen without Stripe.
    stripeCustomerId: "cus_seed_globex",
    stripeSubscriptionId: "sub_seed_globex",
    subscriptionStatus: "active",
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  },
];

async function main() {
  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values(people.map((p) => ({ ...p, emailVerified: new Date() })))
      .onConflictDoNothing();

    await tx.insert(organizations).values(orgs).onConflictDoNothing();

    await tx
      .insert(memberships)
      .values([
        { orgId: orgs[0]!.id, userId: "seed-user-owner", role: "owner" as const },
        { orgId: orgs[0]!.id, userId: "seed-user-member", role: "member" as const },
        { orgId: orgs[1]!.id, userId: "seed-user-owner", role: "owner" as const },
      ])
      .onConflictDoNothing();

    const [existing] = await tx.select({ n: sql<number>`count(*)::int` }).from(projects);
    if ((existing?.n ?? 0) === 0) {
      await tx.insert(projects).values([
        { orgId: orgs[0]!.id, name: "Website relaunch", createdById: "seed-user-owner" },
        { orgId: orgs[0]!.id, name: "Customer portal", createdById: "seed-user-member" },
        { orgId: orgs[1]!.id, name: "Data warehouse", createdById: "seed-user-owner" },
      ]);
    }
  });
  console.info("Seed data ready. Sign in as owner@example.com (magic link is printed in the dev server log).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
