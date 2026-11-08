import Link from "next/link";
import { Logo } from "@/components/app-header";
import { buttonClass } from "@/components/ui";

const features = [
  {
    title: "Organisations and roles",
    body: "Owners, admins and members, with invitations by email. Permission rules live in one table and are unit-tested.",
  },
  {
    title: "Tenant isolation, twice",
    body: "Every query goes through a data-access layer scoped to the current organisation, and Postgres row-level security backs it up.",
  },
  {
    title: "Stripe subscriptions",
    body: "Checkout, the customer portal and a signature-verified, idempotent webhook that tolerates retries and out-of-order events.",
  },
  {
    title: "Plan limits",
    body: "An example feature with per-plan quotas, enforced in the database transaction so concurrent requests cannot overshoot.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="mx-auto flex h-14 w-full max-w-5xl items-center px-4">
        <Logo />
        <Link href="/sign-in" className="ml-auto text-sm text-muted hover:text-ink">
          Sign in
        </Link>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-20 pt-16">
        <p className="font-mono text-xs uppercase tracking-widest text-accent">
          Next.js · Postgres · Stripe
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold leading-tight tracking-tight">
          The boring, correct foundation for a multi-tenant SaaS.
        </h1>
        <p className="mt-4 max-w-xl text-muted">
          A reference implementation of the parts every B2B product needs and most get subtly
          wrong: tenancy, permissions, billing and plan limits.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/sign-in" className={buttonClass("primary")}>
            Try the demo
          </Link>
          <a href="https://github.com/noamtzu/saas-starter" className={buttonClass("secondary")}>
            Read the code
          </a>
        </div>

        <dl className="mt-16 grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
          {features.map((f) => (
            <div key={f.title} className="bg-surface p-6">
              <dt className="font-medium">{f.title}</dt>
              <dd className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</dd>
            </div>
          ))}
        </dl>
      </main>
    </div>
  );
}
