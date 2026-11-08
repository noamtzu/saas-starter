import type { Metadata } from "next";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Button, Card, CardHeader, PageHeader, Select } from "@/components/ui";
import { assignableRoles, can, canManage } from "@/server/auth/permissions";
import { listPendingInvitations } from "@/server/dal/invitations";
import { listMembers } from "@/server/dal/members";
import { requireTenant } from "@/server/session";
import { changeRoleAction, inviteMemberAction, removeMemberAction, revokeInvitationAction } from "../actions";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: PageProps<"/o/[slug]/members">) {
  const { slug } = await params;
  const ctx = await requireTenant(slug);
  const canInvite = can(ctx.role, "member:invite");
  const [members, invitations] = await Promise.all([
    listMembers(ctx),
    canInvite ? listPendingInvitations(ctx) : Promise.resolve([]),
  ]);
  const roles = assignableRoles(ctx.role);

  return (
    <>
      <PageHeader title="Members" description="Owners manage everything. Admins manage members and invitations." />

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="People" description={`${members.length} member${members.length === 1 ? "" : "s"}`} />
            <ul className="divide-y divide-line">
              {members.map((m) => {
                const isSelf = m.userId === ctx.userId;
                const manageable = !isSelf && canManage(ctx.role, m.role);
                return (
                  <li key={m.userId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {m.name ?? m.email} {isSelf ? <span className="text-xs text-muted">(you)</span> : null}
                      </p>
                      <p className="truncate text-xs text-muted">{m.email}</p>
                    </div>
                    {manageable ? (
                      <>
                        <ActionForm action={changeRoleAction.bind(null, slug, m.userId)} className="flex items-center gap-2">
                          <Select name="role" defaultValue={m.role} aria-label={`Role for ${m.email}`}>
                            {roles.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </Select>
                          <SubmitButton variant="secondary" pendingLabel="Saving…">
                            Save
                          </SubmitButton>
                        </ActionForm>
                        <ActionForm action={removeMemberAction.bind(null, slug, m.userId)}>
                          <SubmitButton variant="danger" pendingLabel="Removing…">
                            Remove
                          </SubmitButton>
                        </ActionForm>
                      </>
                    ) : (
                      <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{m.role}</Badge>
                    )}
                    {isSelf ? (
                      <ActionForm action={removeMemberAction.bind(null, slug, m.userId)}>
                        <SubmitButton variant="ghost" pendingLabel="Leaving…">
                          Leave
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Card>

          {canInvite && invitations.length > 0 ? (
            <Card>
              <CardHeader title="Pending invitations" />
              <ul className="divide-y divide-line">
                {invitations.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="flex-1 truncate">{inv.email}</span>
                    <Badge>{inv.role}</Badge>
                    <form action={revokeInvitationAction.bind(null, slug, inv.id)}>
                      <Button variant="danger" type="submit">
                        Revoke
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>

        {canInvite ? (
          <Card className="self-start">
            <CardHeader title="Invite someone" description="Seats count members plus open invitations." />
            <InviteForm action={inviteMemberAction.bind(null, slug)} roles={roles} />
          </Card>
        ) : null}
      </div>
    </>
  );
}
