import { PlanLimitError } from "@/server/errors";

export type PlanId = "free" | "pro";
export type LimitedResource = "projects" | "members";

export type Plan = {
  id: PlanId;
  name: string;
  priceLabel: string;
  limits: Record<LimitedResource, number>;
};

export const PLANS: Record<PlanId, Plan> = {
  free: { id: "free", name: "Free", priceLabel: "$0", limits: { projects: 3, members: 3 } },
  pro: { id: "pro", name: "Pro", priceLabel: "$29 / month", limits: { projects: 100, members: 50 } },
};

/**
 * Stripe statuses that keep paid features on. `past_due` is included on
 * purpose: Stripe is still retrying the card, and locking a paying customer out
 * during dunning costs more than a few days of grace.
 */
const ENTITLED_STATUSES = new Set(["active", "trialing", "past_due"]);

export function resolvePlan(org: { subscriptionStatus: string | null }): Plan {
  return org.subscriptionStatus && ENTITLED_STATUSES.has(org.subscriptionStatus)
    ? PLANS.pro
    : PLANS.free;
}

export type Usage = { used: number; limit: number; remaining: number; allowed: boolean };

export function usageFor(plan: Plan, resource: LimitedResource, used: number): Usage {
  const limit = plan.limits[resource];
  const remaining = Math.max(0, limit - used);
  return { used, limit, remaining, allowed: remaining > 0 };
}

/** Throws if adding `adding` more of `resource` would exceed the plan. */
export function assertWithinLimit(
  plan: Plan,
  resource: LimitedResource,
  used: number,
  adding = 1,
): void {
  const limit = plan.limits[resource];
  if (used + adding > limit) throw new PlanLimitError(resource, limit);
}
