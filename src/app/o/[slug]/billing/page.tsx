import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, CardHeader, PageHeader, cx } from "@/components/ui";
import { can } from "@/server/auth/permissions";
import { PLANS, resolvePlan } from "@/server/billing/plans";
import { isStripeConfigured } from "@/server/billing/stripe";
import { getOrganization } from "@/server/dal/organizations";
import { requireTenant } from "@/server/session";
import { checkoutAction, portalAction } from "../actions";

export const metadata: Metadata = { title: "Billing" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "long" });

function statusTone(status: string | null) {
  if (status === "active" || status === "trialing") return "accent" as const;
  if (status === "past_due" || status === "incomplete") return "warn" as const;
  if (status === "canceled" || status === "unpaid") return "danger" as const;
  return "neutral" as const;
}

export default async function BillingPage({ params, searchParams }: PageProps<"/o/[slug]/billing">) {
  const { slug } = await params;
  const { checkout } = await searchParams;
  const ctx = await requireTenant(slug);
  const org = await getOrganization(ctx);
  const plan = resolvePlan(org);
  const canManage = can(ctx.role, "billing:manage");
  const stripeReady = isStripeConfigured();

  return (
    <>
      <PageHeader title="Billing" description="Subscriptions are handled by Stripe (test mode)." />

      {checkout === "success" && plan.id === "free" ? (
        <p role="status" className="mb-6 rounded-md bg-accent-soft px-4 py-3 text-sm text-accent-strong">
          Payment received. Your plan updates as soon as Stripe confirms the subscription, usually
          within a few seconds. Refresh to see it.
        </p>
      ) : null}

      <Card className="mb-6">
        <CardHeader
          title="Current subscription"
          action={
            org.subscriptionStatus ? (
              <Badge tone={statusTone(org.subscriptionStatus)}>{org.subscriptionStatus.replace("_", " ")}</Badge>
            ) : null
          }
        />
        <dl className="grid gap-4 px-5 py-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Plan</dt>
            <dd className="mt-0.5 font-medium" data-testid="current-plan">
              {plan.name}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Renews</dt>
            <dd className="mt-0.5 font-medium">
              {org.currentPeriodEnd ? dateFormat.format(org.currentPeriodEnd) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-muted">Limits</dt>
            <dd className="mt-0.5 font-medium">
              {plan.limits.projects} projects · {plan.limits.members} seats
            </dd>
          </div>
        </dl>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {Object.values(PLANS).map((p) => {
          const current = p.id === plan.id;
          return (
            <Card key={p.id} className={cx("p-5", current && "border-accent")}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{p.name}</h2>
                {current ? <Badge tone="accent">Current</Badge> : null}
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-tight">{p.priceLabel}</p>
              <ul className="mt-4 space-y-1 text-sm text-muted">
                <li>Up to {p.limits.projects} projects</li>
                <li>Up to {p.limits.members} seats</li>
              </ul>
            </Card>
          );
        })}
      </div>

      <div className="mt-6">
        {!canManage ? (
          <p className="text-sm text-muted">Only owners can change the subscription.</p>
        ) : !stripeReady ? (
          <p className="rounded-md bg-warn-soft px-4 py-3 text-sm">
            Stripe is not configured. Add <code>STRIPE_SECRET_KEY</code>, <code>STRIPE_PRICE_PRO</code>{" "}
            and <code>STRIPE_WEBHOOK_SECRET</code> (test mode) to enable checkout.
          </p>
        ) : org.stripeSubscriptionId ? (
          <ActionForm action={portalAction.bind(null, slug)}>
            <SubmitButton variant="secondary" pendingLabel="Opening Stripe…">
              Manage subscription
            </SubmitButton>
          </ActionForm>
        ) : (
          <ActionForm action={checkoutAction.bind(null, slug)}>
            <SubmitButton pendingLabel="Opening Stripe…">Upgrade to Pro</SubmitButton>
          </ActionForm>
        )}
      </div>
    </>
  );
}
