import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, stripeEvents } from "@/db/schema";
import type { BillingStore, BillingTx } from "./webhook";

/**
 * Postgres implementation of the webhook store. System path: webhooks have no
 * user, so they use the privileged connection and are authenticated by the
 * Stripe signature instead.
 *
 * Concurrency: if Stripe delivers the same event twice at once, the second
 * insert blocks on the primary key until the first transaction finishes, then
 * either sees the conflict (first committed) or proceeds (first rolled back).
 */
export const pgBillingStore: BillingStore = {
  async runOnce(eventId, eventType, fn) {
    return db.transaction(async (tx) => {
      const inserted = await tx
        .insert(stripeEvents)
        .values({ id: eventId, type: eventType })
        .onConflictDoNothing()
        .returning({ id: stripeEvents.id });
      if (inserted.length === 0) return "duplicate" as const;

      const billingTx: BillingTx = {
        async findOrgIdByCustomer(customerId) {
          const [org] = await tx
            .select({ id: organizations.id })
            .from(organizations)
            .where(eq(organizations.stripeCustomerId, customerId));
          return org?.id ?? null;
        },
        async linkCustomer(orgId, customerId) {
          await tx
            .update(organizations)
            .set({ stripeCustomerId: customerId })
            .where(eq(organizations.id, orgId));
        },
        async applySubscription(orgId, s, eventCreatedAt) {
          const updated = await tx
            .update(organizations)
            .set({
              stripeCustomerId: s.customerId,
              stripeSubscriptionId: s.subscriptionId,
              stripePriceId: s.priceId,
              subscriptionStatus: s.status,
              currentPeriodEnd: s.currentPeriodEnd,
              billingUpdatedAt: eventCreatedAt,
            })
            .where(
              and(
                eq(organizations.id, orgId),
                or(
                  isNull(organizations.billingUpdatedAt),
                  lte(organizations.billingUpdatedAt, eventCreatedAt),
                ),
              ),
            )
            .returning({ id: organizations.id });
          return updated.length > 0 ? "applied" : "stale";
        },
      };

      await fn(billingTx);
      return "processed" as const;
    });
  },
};
