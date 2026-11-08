import { unstable_rethrow } from "next/navigation";
import { DomainError } from "@/server/errors";

export type ActionState = { error?: string; message?: string; data?: Record<string, string> };

export const initialActionState: ActionState = {};

/**
 * Wraps a server action body: domain errors become form messages, Next.js
 * control flow (redirect, notFound) passes through, anything else is logged
 * and reported generically so internals never reach the browser.
 */
export async function runAction(fn: () => Promise<ActionState | void>): Promise<ActionState> {
  try {
    return (await fn()) ?? {};
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof DomainError) return { error: err.message };
    console.error(err);
    return { error: "Something went wrong. Please try again." };
  }
}

export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
