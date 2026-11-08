import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { Badge, Card, PageHeader } from "@/components/ui";
import { listAllOrganizations } from "@/server/dal/admin";
import { requirePlatformAdmin } from "@/server/session";

export const metadata: Metadata = { title: "Admin" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function AdminPage() {
  const user = await requirePlatformAdmin();
  const orgs = await listAllOrganizations();
  const paying = orgs.filter((o) => o.plan === "pro").length;

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <PageHeader
          title="Admin"
          description="Every organisation on the platform. Read-only, and visible to platform admins only."
        />

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label="Organisations" value={orgs.length} />
          <Stat label="On Pro" value={paying} />
          <Stat label="Members" value={orgs.reduce((n, o) => n + o.members, 0)} />
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Organisation</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium">Subscription</th>
                <th className="px-5 py-3 font-medium">Period end</th>
                <th className="px-5 py-3 text-right font-medium">Members</th>
                <th className="px-5 py-3 text-right font-medium">Projects</th>
                <th className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium">{o.name}</p>
                    <p className="font-mono text-xs text-muted">{o.slug}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={o.plan === "pro" ? "accent" : "neutral"}>{o.plan}</Badge>
                  </td>
                  <td className="px-5 py-3 text-muted">{o.subscriptionStatus ?? "none"}</td>
                  <td className="px-5 py-3 text-muted">
                    {o.currentPeriodEnd ? dateFormat.format(o.currentPeriodEnd) : "—"}
                  </td>
                  <td className="px-5 py-3 text-right font-mono">{o.members}</td>
                  <td className="px-5 py-3 text-right font-mono">{o.projects}</td>
                  <td className="px-5 py-3 text-muted">{dateFormat.format(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
    </Card>
  );
}
