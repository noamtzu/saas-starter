"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export function OrgNav({ slug, items }: { slug: string; items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Organisation" className="flex gap-1 overflow-x-auto">
      {items.map((item) => {
        const href = `/o/${slug}${item.href}`;
        const active = item.href === "" ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={item.href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "border-b-2 px-3 py-2.5 text-sm",
              active
                ? "border-accent font-medium text-ink"
                : "border-transparent text-muted hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
