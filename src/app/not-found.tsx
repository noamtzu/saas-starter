import Link from "next/link";
import { buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="font-mono text-sm text-muted">404</p>
      <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
      <p className="mt-2 text-sm text-muted">It does not exist, or you do not have access to it.</p>
      <Link href="/dashboard" className={buttonClass("secondary", "mt-6")}>
        Back to dashboard
      </Link>
    </main>
  );
}
