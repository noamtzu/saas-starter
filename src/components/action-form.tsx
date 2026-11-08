"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button, FormMessage } from "@/components/ui";
import type { ActionState } from "@/lib/action";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A form bound to a server action with inline error/success feedback.
 * Works without JavaScript; with it, the message appears without a reload.
 */
export function ActionForm({
  action,
  children,
  className,
  render,
}: {
  action: Action;
  children?: ReactNode;
  className?: string;
  /** Optional extra output, e.g. to show a value returned by the action. */
  render?: (state: ActionState) => ReactNode;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className ?? "space-y-3"}>
      {children}
      <FormMessage state={state} />
      {render?.(state)}
    </form>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  variant,
  className,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </Button>
  );
}
