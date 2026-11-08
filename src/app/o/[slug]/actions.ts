"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { appUrl } from "@/lib/env";
import { field, runAction, type ActionState } from "@/lib/action";
import { isRole } from "@/server/auth/permissions";
import { createCheckoutSession, createPortalSession } from "@/server/billing/stripe";
import { ValidationError } from "@/server/errors";
import { createInvitation, revokeInvitation } from "@/server/dal/invitations";
import { changeMemberRole, removeMember } from "@/server/dal/members";
import { renameOrganization } from "@/server/dal/organizations";
import { createProject, deleteProject } from "@/server/dal/projects";
import { sendInvitationEmail } from "@/server/mail";
import { requireTenant } from "@/server/session";

/*
 * Server actions are thin: resolve the tenant (which re-checks membership on
 * every call), parse input, call the DAL. Authorisation and limits live in
 * the DAL so they cannot be skipped by a new entry point.
 */

function role(formData: FormData) {
  const value = field(formData, "role");
  if (!isRole(value)) throw new ValidationError("Choose a valid role.");
  return value;
}

export async function createProjectAction(slug: string, _: ActionState, formData: FormData) {
  const ctx = await requireTenant(slug);
  return runAction(async () => {
    await createProject(ctx, { name: field(formData, "name") });
    revalidatePath(`/o/${slug}`);
    return { message: "Project created." };
  });
}

export async function deleteProjectAction(slug: string, projectId: string) {
  const ctx = await requireTenant(slug);
  await deleteProject(ctx, projectId);
  revalidatePath(`/o/${slug}`);
}

export async function inviteMemberAction(slug: string, _: ActionState, formData: FormData) {
  const ctx = await requireTenant(slug);
  return runAction(async () => {
    const { invitation, token } = await createInvitation(ctx, {
      email: field(formData, "email"),
      role: role(formData),
    });
    const link = `${appUrl()}/invite/${token}`;
    await sendInvitationEmail({ to: invitation.email, link });
    revalidatePath(`/o/${slug}/members`);
    return { message: `Invitation sent to ${invitation.email}.`, data: { link } };
  });
}

export async function revokeInvitationAction(slug: string, invitationId: string) {
  const ctx = await requireTenant(slug);
  await revokeInvitation(ctx, invitationId);
  revalidatePath(`/o/${slug}/members`);
}

export async function changeRoleAction(slug: string, userId: string, _: ActionState, formData: FormData) {
  const ctx = await requireTenant(slug);
  return runAction(async () => {
    await changeMemberRole(ctx, { userId, role: role(formData) });
    revalidatePath(`/o/${slug}/members`);
    return { message: "Role updated." };
  });
}

export async function removeMemberAction(slug: string, userId: string, _: ActionState) {
  const ctx = await requireTenant(slug);
  const result = await runAction(() => removeMember(ctx, userId));
  if (result.error) return result;
  if (userId === ctx.userId) redirect("/dashboard");
  revalidatePath(`/o/${slug}/members`);
  return { message: "Member removed." };
}

export async function renameOrganizationAction(slug: string, _: ActionState, formData: FormData) {
  const ctx = await requireTenant(slug);
  return runAction(async () => {
    await renameOrganization(ctx, { name: field(formData, "name") });
    revalidatePath(`/o/${slug}`, "layout");
    return { message: "Saved." };
  });
}

export async function checkoutAction(slug: string, _: ActionState) {
  const ctx = await requireTenant(slug);
  let url: string | undefined;
  const result = await runAction(async () => {
    url = await createCheckoutSession(ctx);
  });
  if (url) redirect(url);
  return result;
}

export async function portalAction(slug: string, _: ActionState) {
  const ctx = await requireTenant(slug);
  let url: string | undefined;
  const result = await runAction(async () => {
    url = await createPortalSession(ctx);
  });
  if (url) redirect(url);
  return result;
}
