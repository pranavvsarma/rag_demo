"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Top-level nav destinations; order here determines render order.
const LINKS = [
  { href: "/", label: "Chat" },
  { href: "/explorer", label: "Data Explorer" },
];

/** Minimal cross-link between the chat and the Data Explorer. */
export function TopNav() {
  const pathname = usePathname();

  // Root ("/") only matches exactly, so it isn't marked active while on any
  // "/explorer/..." sub-route; other links match by prefix.
  return (
    <nav className="flex shrink-0 items-center gap-1 border-b border-black/10 bg-zinc-50 px-4 py-2 dark:border-white/10 dark:bg-zinc-950">
      {LINKS.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-black/[0.06] text-zinc-900 dark:bg-white/10 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-black/[0.03] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-100"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
