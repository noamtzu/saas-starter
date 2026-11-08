import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AppHeader } from "@/components/app-header";
import { Badge, Card, CardHeader, Input, Label, PageHeader } from "@/components/ui";
import { listOrganizationsForUser } from "@/server/dal/organizations";
import { requireUser } from "@/server/session";
import { createOrganizationAction } from "./actions";

export const metadata: Metadata = { title: "Your organisations" };

export default async function DashboardPage() {
  const user = await requireUser();
  const orgs = await listOrganizationsForUser(user.id);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <PageHeader
          title="Your organisations"
          description="Everything in this app belongs to an organisation. Pick one, or create a new one."
        />

        {orgs.length > 0 ? (
          <Card className="mb-8">
            <ul className="divide-y divide-line">
              {orgs.map((org) => (
                <li key={org.id}>
                  <Link
                    href={`/o/${org.slug}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-paper"
                  >
                    <span className="font-medium">{org.name}</span>
                    <Badge tone={org.role === "owner" ? "accent" : "neutral"}>{org.role}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="Create an organisation" description="You will be its owner." />
          <ActionForm action={createOrganizationAction} className="space-y-3 px-5 py-4">
            <div>
              <Label htmlFor="org-name">Name</Label>
              <Input id="org-name" name="name" required minLength={2} maxLength={60} placeholder="Acme Inc" />
            </div>
            <SubmitButton pendingLabel="Creating…">Create organisation</SubmitButton>
          </ActionForm>
        </Card>
      </main>
    </>
  );
}
