import type Stripe from "stripe";

/**
 * Stripe webhook processing, kept free of HTTP and database details so it can
 * be unit-tested with an in-memory store.
 *
 * Guarantees:
 * 1. Signature verified before anything is parsed or trusted.
 * 2. Idempotent: an event id is recorded in the same transaction as its
 *    effects. A redelivery finds the id and becomes a no-op; a failure rolls
 *    both back so Stripe's retry gets a clean second attempt.
 * 3. Order-tolerant: Stripe does not guarantee delivery order, so subscription
 *    state is only applied when the event is newer than the last one applied.
 */

export type SubscriptionSnapshot = {
  subscriptionId: string;
  customerId: string;
  status: Stripe.Subscription.Status;
  priceId: string | null;
  currentPeriodEnd: Date | null;
};

export interface BillingTx {
  findOrgIdByCustomer(customerId: string): Promise<string | null>;
  linkCustomer(orgId: string, customerId: string): Promise<void>;
  /** Returns "stale" (and changes nothing) if a newer event was already applied. */
  applySubscription(
    orgId: string,
    snapshot: SubscriptionSnapshot,
    eventCreatedAt: Date,
  ): Promise<"applied" | "stale">;
}

export interface BillingStore {
  /**
   * Records `eventId` and runs `fn` in one transaction. Resolves "duplicate"
   * without running `fn` if the id was already recorded.
   */
  runOnce(
    eventId: string,
    eventType: string,
    fn: (tx: BillingTx) => Promise<void>,
  ): Promise<"processed" | "duplicate">;
}

export type WebhookOutcome =
  | { status: "processed"; eventId: string; type: string }
  | { status: "duplicate"; eventId: string; type: string }
  | { status: "ignored"; eventId: string; type: string };

export const HANDLED_EVENTS = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

export class WebhookSignatureError extends Error {}

export function verifyStripeEvent(
  stripe: Stripe,
  payload: string,
  signature: string | null,
  secret: string,
): Stripe.Event {
  if (!signature) throw new WebhookSignatureError("Missing Stripe-Signature header.");
  try {
    return stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    throw new WebhookSignatureError(err instanceof Error ? err.message : "Invalid signature.");
  }
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export function toSnapshot(sub: Stripe.Subscription): SubscriptionSnapshot {
  const item = sub.items.data[0];
  // Since API version 2025-03-31 the billing period lives on subscription items.
  const periodEnd = item?.current_period_end ?? null;
  return {
    subscriptionId: sub.id,
    customerId: idOf(sub.customer)!,
    status: sub.status,
    priceId: item?.price.id ?? null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
  };
}

async function resolveOrgId(
  tx: BillingTx,
  metadata: Stripe.Metadata | null | undefined,
  customerId: string | null,
): Promise<string | null> {
  if (metadata?.orgId) return metadata.orgId;
  return customerId ? tx.findOrgIdByCustomer(customerId) : null;
}

export async function handleStripeEvent(
  event: Stripe.Event,
  store: BillingStore,
): Promise<WebhookOutcome> {
  const base = { eventId: event.id, type: event.type };
  if (!HANDLED_EVENTS.has(event.type)) return { status: "ignored", ...base };

  const eventCreatedAt = new Date(event.created * 1000);

  const status = await store.runOnce(event.id, event.type, async (tx) => {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription") return;
        const orgId = session.client_reference_id ?? session.metadata?.orgId ?? null;
        const customerId = idOf(session.customer);
        if (orgId && customerId) await tx.linkCustomer(orgId, customerId);
        return;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const snapshot = toSnapshot(subscription);
        const orgId = await resolveOrgId(tx, subscription.metadata, snapshot.customerId);
        if (!orgId) {
          // Not ours (e.g. another product on the same Stripe account). Record and move on.
          return;
        }
        await tx.applySubscription(orgId, snapshot, eventCreatedAt);
        return;
      }
    }
  });

  return { status, ...base };
}
