import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/app-header";
import { Card, buttonClass } from "@/components/ui";
import { previewInvitation } from "@/server/dal/invitations";
import { acceptInvitationAction } from "./actions";

export const metadata: Metadata = { title: "Invitation" };

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/sign-in?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);

  const invite = await previewInvitation(token);

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6">
          {!invite || invite.expired ? (
            <>
              <h1 className="text-lg font-semibold">Invitation unavailable</h1>
              <p className="mt-2 text-sm text-muted">
                This link has expired or was already used. Ask for a new invitation.
              </p>
              <Link href="/dashboard" className={buttonClass("secondary", "mt-6")}>
                Go to dashboard
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold">Join {invite.orgName}</h1>
              <p className="mt-2 text-sm text-muted">
                You have been invited as <strong className="text-ink">{invite.role}</strong>. The
                invitation is for {invite.email}; you are signed in as {session.user.email}.
              </p>
              <ActionForm action={acceptInvitationAction.bind(null, token)} className="mt-6 space-y-3">
                <SubmitButton pendingLabel="Joining…">Accept invitation</SubmitButton>
              </ActionForm>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
