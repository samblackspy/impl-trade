"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Trade" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/history", label: "History" },
] as const;

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex w-max gap-1" aria-label="Pages">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-3.5 py-1.5 text-sm font-semibold transition-all duration-250 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              active
                ? "bg-primary/10 text-primary border-primary/20 shadow-[0_0_12px_rgba(45,212,191,0.08)]"
                : "text-muted hover:text-foreground hover:bg-white/[0.03] border-transparent"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
