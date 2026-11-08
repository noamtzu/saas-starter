import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Button, Card, CardHeader, Input, PageHeader, buttonClass } from "@/components/ui";
import { UsageMeter } from "@/components/usage-meter";
import { can } from "@/server/auth/permissions";
import { getProjectUsage, listProjects } from "@/server/dal/projects";
import { requireTenant } from "@/server/session";
import { createProjectAction, deleteProjectAction } from "./actions";

export const metadata: Metadata = { title: "Projects" };

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

export default async function ProjectsPage({ params }: PageProps<"/o/[slug]">) {
  const { slug } = await params;
  const ctx = await requireTenant(slug);
  const [projects, usage] = await Promise.all([listProjects(ctx), getProjectUsage(ctx)]);
  const canDelete = can(ctx.role, "project:delete");

  return (
    <>
      <PageHeader
        title="Projects"
        description="The example plan-limited feature. Free organisations get 3 projects; Pro gets 100."
      />

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        <Card>
          <CardHeader title="All projects" description={`${projects.length} in this organisation`} />
          {projects.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted">No projects yet.</p>
          ) : (
            <ul className="divide-y divide-line" data-testid="project-list">
              {projects.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted">Created {dateFormat.format(p.createdAt)}</p>
                  </div>
                  {canDelete ? (
                    <form action={deleteProjectAction.bind(null, slug, p.id)}>
                      <Button variant="danger" type="submit" aria-label={`Delete ${p.name}`}>
                        Delete
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <UsageMeter label="Projects" used={usage.used} limit={usage.limit} />
            {!usage.allowed ? (
              <p className="mt-3 text-sm text-muted">
                You have reached your plan&apos;s limit.{" "}
                <Link href={`/o/${slug}/billing`} className="text-accent hover:underline">
                  Upgrade to Pro
                </Link>
              </p>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="New project" />
            <ActionForm action={createProjectAction.bind(null, slug)} className="space-y-3 px-5 py-4">
              <Input
                name="name"
                aria-label="Project name"
                placeholder="Project name"
                required
                minLength={2}
                maxLength={80}
                disabled={!usage.allowed}
              />
              {usage.allowed ? (
                <SubmitButton pendingLabel="Creating…">Create project</SubmitButton>
              ) : (
                <Link href={`/o/${slug}/billing`} className={buttonClass("secondary")}>
                  See plans
                </Link>
              )}
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
