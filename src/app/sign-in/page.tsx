import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Logo } from "@/components/app-header";
import { Button, Card, Input, Label } from "@/components/ui";
import { authProviders } from "@/lib/env";

export const metadata: Metadata = { title: "Sign in" };

/** Only allow same-site relative redirects. */
function safeRedirect(value: string | string[] | undefined): string {
  const target = Array.isArray(value) ? value[0] : value;
  return target && target.startsWith("/") && !target.startsWith("//") ? target : "/dashboard";
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const redirectTo = safeRedirect(params.callbackUrl);
  const session = await auth();
  if (session?.user) redirect(redirectTo);

  const error = typeof params.error === "string" ? params.error : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-muted">New here? Signing in creates your account.</p>

          {error ? (
            <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              Sign-in failed. Please try again.
            </p>
          ) : null}

          {authProviders.email ? (
            <form
              className="mt-6 space-y-3"
              action={async (formData) => {
                "use server";
                // Auth.js would redirect through /api/auth/verify-request; going straight to
                // our page keeps the address bar on a real app URL.
                await signIn("nodemailer", { email: formData.get("email"), redirectTo, redirect: false });
                redirect("/sign-in/check-email");
              }}
            >
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
              </div>
              <Button type="submit" className="w-full">
                Email me a sign-in link
              </Button>
            </form>
          ) : null}

          {authProviders.email && authProviders.github ? (
            <div className="my-5 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
            </div>
          ) : null}

          {authProviders.github ? (
            <form
              className={authProviders.email ? "" : "mt-6"}
              action={async () => {
                "use server";
                await signIn("github", { redirectTo });
              }}
            >
              <Button type="submit" variant="secondary" className="w-full">
                Continue with GitHub
              </Button>
            </form>
          ) : null}

          {!authProviders.email && !authProviders.github ? (
            <p className="mt-6 text-sm text-muted">
              No sign-in method is configured. Set <code>EMAIL_SERVER</code> or the GitHub OAuth
              variables (see <code>.env.example</code>).
            </p>
          ) : null}
        </Card>
      </div>
    </main>
  );
}
