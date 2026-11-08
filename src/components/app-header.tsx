import Link from "next/link";
import { signOut } from "@/auth";
import { Button } from "@/components/ui";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
      <span aria-hidden className="grid size-6 place-items-center rounded bg-accent text-xs text-white">
        S
      </span>
      SaaS Starter
    </Link>
  );
}

export function AppHeader({
  user,
  children,
}: {
  user: { email?: string | null; isPlatformAdmin?: boolean };
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Logo />
        {children}
        <div className="ml-auto flex items-center gap-3 text-sm">
          {user.isPlatformAdmin ? (
            <Link href="/admin" className="text-muted hover:text-ink">
              Admin
            </Link>
          ) : null}
          <span className="hidden text-muted sm:inline">{user.email}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <Button variant="ghost" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
