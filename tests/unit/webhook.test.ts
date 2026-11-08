import Stripe from "stripe";
import { beforeEach, describe, expect, it } from "vitest";
import {
  WebhookSignatureError,
  handleStripeEvent,
  verifyStripeEvent,
  type BillingStore,
  type BillingTx,
  type SubscriptionSnapshot,
} from "@/server/billing/webhook";

/**
 * In-memory store with the same contract as the Postgres one: the event id and
 * the effects commit together, or not at all.
 */
type OrgRow = { customerId: string | null; sub: SubscriptionSnapshot | null; billingUpdatedAt: Date | null };

class MemoryStore implements BillingStore {
  events = new Set<string>();
  orgs = new Map<string, OrgRow>();
  effects = 0;
  failNext = false;

  async runOnce(eventId: string, _type: string, fn: (tx: BillingTx) => Promise<void>) {
    if (this.events.has(eventId)) return "duplicate" as const;

    // Work on a copy; only commit if fn succeeds.
    const draft = new Map([...this.orgs].map(([id, row]) => [id, { ...row }]));
    let effects = 0;
    const tx: BillingTx = {
      findOrgIdByCustomer: async (customerId) =>
        [...draft].find(([, row]) => row.customerId === customerId)?.[0] ?? null,
      linkCustomer: async (orgId, customerId) => {
        const row = draft.get(orgId);
        if (row) row.customerId = customerId;
        effects++;
      },
      applySubscription: async (orgId, snapshot, at) => {
        const row = draft.get(orgId);
        if (!row || (row.billingUpdatedAt && row.billingUpdatedAt > at)) return "stale";
        Object.assign(row, { customerId: snapshot.customerId, sub: snapshot, billingUpdatedAt: at });
        effects++;
        return "applied";
      },
    };

    await fn(tx);
    if (this.failNext) {
      this.failNext = false;
      throw new Error("database went away");
    }
    this.orgs = draft;
    this.events.add(eventId);
    this.effects += effects;
    return "processed" as const;
  }
}

const ORG = "org_1";

function subscriptionEvent(
  id: string,
  type: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted",
  { status = "active", created = 1_700_000_000, metadata = { orgId: ORG } as Record<string, string> } = {},
): Stripe.Event {
  return {
    id,
    type,
    created,
    object: "event",
    data: {
      object: {
        id: "sub_1",
        object: "subscription",
        customer: "cus_1",
        status,
        metadata,
        items: { data: [{ current_period_end: created + 2_592_000, price: { id: "price_pro" } }] },
      },
    },
  } as unknown as Stripe.Event;
}

describe("handleStripeEvent()", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
    store.orgs.set(ORG, { customerId: null, sub: null, billingUpdatedAt: null });
  });

  it("applies a subscription to the org", async () => {
    const outcome = await handleStripeEvent(subscriptionEvent("evt_1", "customer.subscription.created"), store);
    expect(outcome).toEqual({ status: "processed", eventId: "evt_1", type: "customer.subscription.created" });
    expect(store.orgs.get(ORG)?.sub).toMatchObject({
      status: "active",
      priceId: "price_pro",
      customerId: "cus_1",
      currentPeriodEnd: new Date((1_700_000_000 + 2_592_000) * 1000),
    });
  });

  it("applies each event exactly once when Stripe redelivers it", async () => {
    const event = subscriptionEvent("evt_1", "customer.subscription.created");
    const first = await handleStripeEvent(event, store);
    const second = await handleStripeEvent(event, store);
    const third = await handleStripeEvent(event, store);

    expect([first.status, second.status, third.status]).toEqual(["processed", "duplicate", "duplicate"]);
    expect(store.effects).toBe(1);
  });

  it("rolls back on failure so the retry is processed in full", async () => {
    const event = subscriptionEvent("evt_1", "customer.subscription.created");
    store.failNext = true;
    await expect(handleStripeEvent(event, store)).rejects.toThrow("database went away");
    expect(store.events.has("evt_1")).toBe(false);
    expect(store.orgs.get(ORG)?.sub).toBeNull();

    const retry = await handleStripeEvent(event, store);
    expect(retry.status).toBe("processed");
    expect(store.orgs.get(ORG)?.sub?.status).toBe("active");
  });

  it("ignores an older event that arrives after a newer one", async () => {
    await handleStripeEvent(
      subscriptionEvent("evt_new", "customer.subscription.deleted", { status: "canceled", created: 2_000 }),
      store,
    );
    await handleStripeEvent(
      subscriptionEvent("evt_old", "customer.subscription.updated", { status: "active", created: 1_000 }),
      store,
    );
    expect(store.orgs.get(ORG)?.sub?.status).toBe("canceled");
  });

  it("finds the org by customer id when metadata is missing", async () => {
    store.orgs.get(ORG)!.customerId = "cus_1";
    await handleStripeEvent(subscriptionEvent("evt_1", "customer.subscription.updated", { metadata: {} }), store);
    expect(store.orgs.get(ORG)?.sub?.status).toBe("active");
  });

  it("records but does not apply subscriptions it cannot attribute", async () => {
    const outcome = await handleStripeEvent(
      subscriptionEvent("evt_1", "customer.subscription.updated", { metadata: {} }),
      store,
    );
    expect(outcome.status).toBe("processed");
    expect(store.effects).toBe(0);
  });

  it("links the Stripe customer when checkout completes", async () => {
    const event = {
      id: "evt_checkout",
      type: "checkout.session.completed",
      created: 1_700_000_000,
      data: { object: { mode: "subscription", client_reference_id: ORG, customer: "cus_9", metadata: {} } },
    } as unknown as Stripe.Event;
    await handleStripeEvent(event, store);
    expect(store.orgs.get(ORG)?.customerId).toBe("cus_9");
  });

  it("ignores event types it does not handle, without recording them", async () => {
    const event = { id: "evt_x", type: "invoice.created", created: 1, data: { object: {} } } as unknown as Stripe.Event;
    expect((await handleStripeEvent(event, store)).status).toBe("ignored");
    expect(store.events.size).toBe(0);
  });
});

describe("verifyStripeEvent()", () => {
  // Fake test-mode values; no network calls are made.
  const stripe = new Stripe("sk_test_placeholder");
  const secret = "whsec_test_placeholder";
  const payload = JSON.stringify({ id: "evt_sig", object: "event", type: "customer.subscription.updated" });

  it("accepts a correctly signed payload", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    expect(verifyStripeEvent(stripe, payload, header, secret).id).toBe("evt_sig");
  });

  it("rejects a payload signed with another secret", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_other" });
    expect(() => verifyStripeEvent(stripe, payload, header, secret)).toThrow(WebhookSignatureError);
  });

  it("rejects a tampered payload", () => {
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const tampered = payload.replace("evt_sig", "evt_forged");
    expect(() => verifyStripeEvent(stripe, tampered, header, secret)).toThrow(WebhookSignatureError);
  });

  it("rejects a missing signature header", () => {
    expect(() => verifyStripeEvent(stripe, payload, null, secret)).toThrow(WebhookSignatureError);
  });
});
