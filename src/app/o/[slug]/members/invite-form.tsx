"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { Input, Label, Select } from "@/components/ui";
import type { ActionState } from "@/lib/action";

export function InviteForm({
  action,
  roles,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  roles: string[];
}) {
  return (
    <ActionForm
      action={action}
      className="space-y-3 px-5 py-4"
      render={(state) =>
        state.data?.link ? (
          <div className="rounded-md bg-paper p-3 text-xs">
            <p className="mb-1 text-muted">Invite link (also emailed):</p>
            <code className="block break-all" data-testid="invite-link">
              {state.data.link}
            </code>
          </div>
        ) : null
      }
    >
      <div>
        <Label htmlFor="invite-email">Email</Label>
        <Input id="invite-email" name="email" type="email" required placeholder="teammate@example.com" />
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="invite-role">Role</Label>
          <Select id="invite-role" name="role" defaultValue="member" className="w-full">
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
        <SubmitButton pendingLabel="Sending…">Send invite</SubmitButton>
      </div>
    </ActionForm>
  );
}
