"use server";

import { redirect } from "next/navigation";
import { field, runAction, type ActionState } from "@/lib/action";
import { createOrganization } from "@/server/dal/organizations";
import { requireUser } from "@/server/session";

export async function createOrganizationAction(_: ActionState, formData: FormData) {
  const user = await requireUser();
  let slug: string | undefined;
  const result = await runAction(async () => {
    ({ slug } = await createOrganization(user.id, { name: field(formData, "name") }));
  });
  if (slug) redirect(`/o/${slug}`);
  return result;
}
