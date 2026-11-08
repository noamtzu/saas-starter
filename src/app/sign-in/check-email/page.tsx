import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/app-header";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  const devMode = !process.env.EMAIL_SERVER && process.env.NODE_ENV !== "production";
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <Card className="p-6">
          <h1 className="text-lg font-semibold">Check your email</h1>
          <p className="mt-2 text-sm text-muted">
            We sent you a sign-in link. It expires in 24 hours.
          </p>
          {devMode ? (
            <p className="mt-4 rounded-md bg-warn-soft px-3 py-2 text-sm">
              Development mode: no SMTP server is configured, so the link was printed in the
              terminal running <code>npm run dev</code>.
            </p>
          ) : null}
          <Link href="/sign-in" className="mt-6 inline-block text-sm text-accent hover:underline">
            Use a different email
          </Link>
        </Card>
      </div>
    </main>
  );
}
