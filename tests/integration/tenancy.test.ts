import "@/db/load-env";
import { randomUUID } from "node:crypto";
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/db/client";
import { organizations, projects, stripeEvents, users } from "@/db/schema";
import { pgBillingStore } from "@/server/billing/store";
import { handleStripeEvent } from "@/server/billing/webhook";
import { acceptInvitation, createInvitation } from "@/server/dal/invitations";
import { createOrganization, findTenant, listOrganizationsForUser } from "@/server/dal/organizations";
import { createProject, deleteProject, listProjects } from "@/server/dal/projects";
import { withRls, withTenant, type TenantContext } from "@/server/dal/rls";
import { ForbiddenError, PlanLimitError } from "@/server/errors";
import type Stripe from "stripe";

/**
 * Runs against a real, migrated Postgres (DATABASE_URL). Every test creates its
 * own users and organisations with random ids, so it does not depend on seed
 * data and can run against a database that has some.
 */

const run = randomUUID().slice(0, 8);
const userIds: string[] = [];
const orgIds: string[] = [];

async function makeUser(label: string) {
  const id = `it-${run}-${label}`;
  await db.insert(users).values({ id, email: `${label}-${run}@example.com`, name: label });
  userIds.push(id);
  return id;
}

/** Drizzle wraps driver errors; the Postgres message is on `cause`. */
async function pgErrorOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    const cause = (err as { cause?: { message?: string } }).cause;
    return cause?.message ?? String(err);
  }
  throw new Error("Expected the query to fail.");
}

async function makeOrg(ownerId: string, name: string): Promise<TenantContext> {
  const org = await createOrganization(ownerId, { name: `${name} ${run}` });
  orgIds.push(org.id);
  return (await findTenant(ownerId, org.slug))!;
}

let alice: string;
let bob: string;
let aliceOrg: TenantContext;
let bobOrg: TenantContext;

beforeAll(async () => {
  alice = await makeUser("alice");
  bob = await makeUser("bob");
  aliceOrg = await makeOrg(alice, "Alice Co");
  bobOrg = await makeOrg(bob, "Bob Co");
  await createProject(aliceOrg, { name: "Alice project" });
  await createProject(bobOrg, { name: "Bob project" });
});

afterAll(async () => {
  if (orgIds.length) await db.delete(organizations).where(inArray(organizations.id, orgIds));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  await db.delete(stripeEvents).where(sql`${stripeEvents.id} like ${`evt_it_${run}%`}`);
  await pool.end();
});

describe("tenant isolation in the DAL", () => {
  it("only lists a user's own organisations", async () => {
    const orgs = await listOrganizationsForUser(alice);
    expect(orgs.map((o) => o.id)).toEqual([aliceOrg.orgId]);
  });

  it("returns no tenant context for an organisation the user is not in", async () => {
    expect(await findTenant(alice, bobOrg.orgSlug)).toBeNull();
  });

  it("lists only the current organisation's projects", async () => {
    const list = await listProjects(aliceOrg);
    expect(list.map((p) => p.name)).toEqual(["Alice project"]);
  });

  it("cannot delete another organisation's project by id", async () => {
    const [bobProject] = await listProjects(bobOrg);
    await expect(deleteProject(aliceOrg, bobProject!.id)).rejects.toThrow("Project not found");
    expect(await listProjects(bobOrg)).toHaveLength(1);
  });
});

describe("row-level security (defence in depth)", () => {
  it("hides other tenants' rows even when the query forgets its org filter", async () => {
    // Deliberately unfiltered, as if a developer forgot the where clause.
    const rows = await withTenant(aliceOrg, (tx) => tx.select({ orgId: projects.orgId }).from(projects));
    expect(rows.length).toBeGreaterThan(0);
    expect(new Set(rows.map((r) => r.orgId))).toEqual(new Set([aliceOrg.orgId]));
  });

  it("hides organisations the user does not belong to", async () => {
    const rows = await withRls({ userId: alice }, (tx) => tx.select({ id: organizations.id }).from(organizations));
    expect(rows.map((r) => r.id)).toEqual([aliceOrg.orgId]);
  });

  it("rejects an insert into another tenant", async () => {
    const message = await pgErrorOf(
      withTenant(aliceOrg, (tx) => tx.insert(projects).values({ orgId: bobOrg.orgId, name: "Sneaky" })),
    );
    expect(message).toMatch(/row-level security/);
  });

  it("does not let a tenant claim another org by switching app.org_id", async () => {
    // Alice is not a member of Bob's org, so pointing the context at it shows nothing.
    const rows = await withRls({ userId: alice, orgId: bobOrg.orgId }, (tx) => tx.select().from(projects));
    expect(rows).toEqual([]);
  });

  it("does not let tenant code change billing columns", async () => {
    const message = await pgErrorOf(
      withTenant(aliceOrg, (tx) =>
        tx.update(organizations).set({ subscriptionStatus: "active" }).where(eq(organizations.id, aliceOrg.orgId)),
      ),
    );
    expect(message).toMatch(/permission denied/);
  });

  it("does not leak settings to the next transaction on the same pool", async () => {
    await withTenant(aliceOrg, async () => undefined);
    const result = await db.execute(
      sql`select current_user as role, coalesce(current_setting('app.org_id', true), '') as org`,
    );
    expect(result.rows[0]).toMatchObject({ org: "" });
    expect(result.rows[0]!.role).not.toBe("app_user");
  });
});

describe("plan limits under concurrency", () => {
  it("lets exactly as many projects through as the Free plan allows", async () => {
    const owner = await makeUser("racer");
    const ctx = await makeOrg(owner, "Race Co");

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => createProject(ctx, { name: `Project ${i}` })),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const limited = results.filter((r) => r.status === "rejected" && r.reason instanceof PlanLimitError);
    expect(ok).toHaveLength(3);
    expect(limited).toHaveLength(3);
  });
});

describe("invitations", () => {
  it("counts open invitations against the seat limit", async () => {
    const gina = await makeUser("gina");
    const ginaOrg = await makeOrg(gina, "Gina Co");
    await createInvitation(ginaOrg, { email: `one-${run}@example.com`, role: "member" });
    await createInvitation(ginaOrg, { email: `two-${run}@example.com`, role: "member" });
    await expect(
      createInvitation(ginaOrg, { email: `three-${run}@example.com`, role: "member" }),
    ).rejects.toThrow(PlanLimitError);
  });

  it("adds the invited user with the invited role", async () => {
    const carol = await makeUser("carol");
    const { token } = await createInvitation(aliceOrg, { email: `carol-${run}@example.com`, role: "admin" });
    const { orgSlug } = await acceptInvitation({ id: carol, email: `carol-${run}@example.com` }, token);
    expect(orgSlug).toBe(aliceOrg.orgSlug);
    expect((await findTenant(carol, orgSlug))?.role).toBe("admin");
  });

  it("refuses a token used by someone with a different email", async () => {
    const dave = await makeUser("dave");
    const { token } = await createInvitation(aliceOrg, { email: `someone-${run}@example.com`, role: "member" });
    await expect(acceptInvitation({ id: dave, email: `dave-${run}@example.com` }, token)).rejects.toThrow();
    expect(await findTenant(dave, aliceOrg.orgSlug)).toBeNull();
  });

  it("stops a member from inviting", async () => {
    const frank = await makeUser("frank");
    const erin = await makeUser("erin");
    const frankOrg = await makeOrg(frank, "Frank Co");
    const { token } = await createInvitation(frankOrg, { email: `erin-${run}@example.com`, role: "member" });
    await acceptInvitation({ id: erin, email: `erin-${run}@example.com` }, token);
    const erinCtx = (await findTenant(erin, frankOrg.orgSlug))!;
    await expect(createInvitation(erinCtx, { email: `x-${run}@example.com`, role: "member" })).rejects.toThrow(
      ForbiddenError,
    );
  });
});

describe("Stripe webhook store", () => {
  function event(id: string, created: number, status: string): Stripe.Event {
    return {
      id,
      type: "customer.subscription.updated",
      created,
      data: {
        object: {
          id: `sub_${run}`,
          customer: `cus_${run}`,
          status,
          metadata: { orgId: bobOrg.orgId },
          items: { data: [{ current_period_end: created + 86_400, price: { id: "price_test" } }] },
        },
      },
    } as unknown as Stripe.Event;
  }

  async function bobStatus() {
    const [row] = await db
      .select({ status: organizations.subscriptionStatus })
      .from(organizations)
      .where(eq(organizations.id, bobOrg.orgId));
    return row?.status;
  }

  it("processes an event once, even when delivered concurrently", async () => {
    const e = event(`evt_it_${run}_1`, 1_000, "active");
    const outcomes = await Promise.all([1, 2, 3].map(() => handleStripeEvent(e, pgBillingStore)));
    expect(outcomes.map((o) => o.status).sort()).toEqual(["duplicate", "duplicate", "processed"]);
    expect(await bobStatus()).toBe("active");
  });

  it("does not let an older event overwrite a newer one", async () => {
    await handleStripeEvent(event(`evt_it_${run}_3`, 3_000, "canceled"), pgBillingStore);
    await handleStripeEvent(event(`evt_it_${run}_2`, 2_000, "past_due"), pgBillingStore);
    expect(await bobStatus()).toBe("canceled");
  });
});
