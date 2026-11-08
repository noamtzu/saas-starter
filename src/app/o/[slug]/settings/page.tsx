import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, CardHeader, Input, Label, PageHeader } from "@/components/ui";
import { can } from "@/server/auth/permissions";
import { getOrganization } from "@/server/dal/organizations";
import { requireTenant } from "@/server/session";
import { renameOrganizationAction } from "../actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ params }: PageProps<"/o/[slug]/settings">) {
  const { slug } = await params;
  const ctx = await requireTenant(slug);
  if (!can(ctx.role, "org:rename")) notFound();
  const org = await getOrganization(ctx);

  return (
    <>
      <PageHeader title="Settings" />
      <Card className="max-w-lg">
        <CardHeader title="Organisation name" description={`URL: /o/${org.slug}`} />
        <ActionForm action={renameOrganizationAction.bind(null, slug)} className="space-y-3 px-5 py-4">
          <div>
            <Label htmlFor="org-name">Name</Label>
            <Input id="org-name" name="name" defaultValue={org.name} required minLength={2} maxLength={60} />
          </div>
          <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
