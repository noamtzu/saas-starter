import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui";
import { can } from "@/server/auth/permissions";
import { resolvePlan } from "@/server/billing/plans";
import { getOrganization } from "@/server/dal/organizations";
import { requireTenant, requireUser } from "@/server/session";
import { OrgNav } from "./org-nav";

export default async function OrgLayout({ children, params }: LayoutProps<"/o/[slug]">) {
  const { slug } = await params;
  const user = await requireUser();
  const tenant = await requireTenant(slug);
  const org = await getOrganization(tenant);
  const plan = resolvePlan(org);

  const items = [
    { href: "", label: "Projects" },
    { href: "/members", label: "Members" },
    { href: "/billing", label: "Billing" },
    ...(can(tenant.role, "org:rename") ? [{ href: "/settings", label: "Settings" }] : []),
  ];

  return (
    <>
      <AppHeader user={user}>
        <span className="text-line">/</span>
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-medium hover:text-accent">
          {org.name}
        </Link>
        <Badge tone={plan.id === "pro" ? "accent" : "neutral"}>{plan.name}</Badge>
      </AppHeader>
      <div className="border-b border-line bg-surface">
        <div className="mx-auto max-w-5xl px-2">
          <OrgNav slug={slug} items={items} />
        </div>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
