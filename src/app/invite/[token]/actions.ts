"use server";

import { redirect } from "next/navigation";
import { runAction, type ActionState } from "@/lib/action";
import { acceptInvitation } from "@/server/dal/invitations";
import { requireUser } from "@/server/session";

export async function acceptInvitationAction(token: string, _: ActionState) {
  const user = await requireUser();
  let slug: string | undefined;
  const result = await runAction(async () => {
    ({ orgSlug: slug } = await acceptInvitation({ id: user.id, email: user.email }, token));
  });
  if (slug) redirect(`/o/${slug}`);
  return result;
}
