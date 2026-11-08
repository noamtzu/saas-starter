import { describe, expect, it } from "vitest";
import { PLANS, assertWithinLimit, resolvePlan, usageFor } from "@/server/billing/plans";
import { PlanLimitError } from "@/server/errors";

describe("resolvePlan()", () => {
  it.each([
    [null, "free"],
    ["incomplete", "free"],
    ["canceled", "free"],
    ["unpaid", "free"],
    ["active", "pro"],
    ["trialing", "pro"],
    // Grace period while Stripe retries the card.
    ["past_due", "pro"],
  ])("status %s gives the %s plan", (status, plan) => {
    expect(resolvePlan({ subscriptionStatus: status }).id).toBe(plan);
  });
});

describe("usageFor()", () => {
  it("reports remaining capacity", () => {
    expect(usageFor(PLANS.free, "projects", 1)).toEqual({ used: 1, limit: 3, remaining: 2, allowed: true });
  });

  it("is not allowed at the limit", () => {
    expect(usageFor(PLANS.free, "projects", 3)).toMatchObject({ remaining: 0, allowed: false });
  });

  it("never reports negative remaining after a downgrade", () => {
    // An org that downgrades from Pro keeps its data but cannot add more.
    expect(usageFor(PLANS.free, "projects", 12)).toMatchObject({ remaining: 0, allowed: false });
  });
});

describe("assertWithinLimit()", () => {
  it("allows up to the limit", () => {
    expect(() => assertWithinLimit(PLANS.free, "projects", 2)).not.toThrow();
  });

  it("blocks the item that would exceed it", () => {
    expect(() => assertWithinLimit(PLANS.free, "projects", 3)).toThrow(PlanLimitError);
  });

  it("checks batch additions", () => {
    expect(() => assertWithinLimit(PLANS.free, "members", 1, 2)).not.toThrow();
    expect(() => assertWithinLimit(PLANS.free, "members", 2, 2)).toThrow(PlanLimitError);
  });

  it("gives Pro a higher ceiling", () => {
    expect(() => assertWithinLimit(PLANS.pro, "projects", 3)).not.toThrow();
  });

  it("explains the limit in the error", () => {
    expect(() => assertWithinLimit(PLANS.free, "projects", 3)).toThrow("Your plan allows 3 projects");
  });
});
