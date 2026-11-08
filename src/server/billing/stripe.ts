import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { authorize } from "@/server/auth/permissions";
import type { TenantContext } from "@/server/dal/rls";
import { getOrganization } from "@/server/dal/organizations";
import { ValidationError } from "@/server/errors";
import { appUrl } from "@/lib/env";

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PRO);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  client ??= new Stripe(key, { appInfo: { name: "saas-starter" } });
  return client;
}

/**
 * Returns the org's Stripe customer, creating it on first use. Writing the id
 * back is a system update: tenants cannot write billing columns under RLS.
 */
async function ensureCustomer(ctx: TenantContext): Promise<string> {
  const org = await getOrganization(ctx);
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customer = await getStripe().customers.create(
    { name: org.name, metadata: { orgId: org.id } },
    { idempotencyKey: `customer-for-org-${org.id}` },
  );
  await db
    .update(organizations)
    .set({ stripeCustomerId: customer.id })
    .where(eq(organizations.id, org.id));
  return customer.id;
}

export async function createCheckoutSession(ctx: TenantContext): Promise<string> {
  authorize(ctx.role, "billing:manage");
  if (!isStripeConfigured()) throw new ValidationError("Stripe is not configured.");

  const customer = await ensureCustomer(ctx);
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: ctx.orgId,
    line_items: [{ price: process.env.STRIPE_PRICE_PRO!, quantity: 1 }],
    subscription_data: { metadata: { orgId: ctx.orgId } },
    allow_promotion_codes: true,
    success_url: `${appUrl()}/o/${ctx.orgSlug}/billing?checkout=success`,
    cancel_url: `${appUrl()}/o/${ctx.orgSlug}/billing`,
  });
  if (!session.url) throw new Error("Stripe did not return a checkout URL.");
  return session.url;
}

export async function createPortalSession(ctx: TenantContext): Promise<string> {
  authorize(ctx.role, "billing:manage");
  if (!isStripeConfigured()) throw new ValidationError("Stripe is not configured.");

  const customer = await ensureCustomer(ctx);
  const session = await getStripe().billingPortal.sessions.create({
    customer,
    return_url: `${appUrl()}/o/${ctx.orgSlug}/billing`,
  });
  return session.url;
}
