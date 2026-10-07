"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** `prefix` also marks the link current on child pages, e.g. /appointments/a1. */
export function NavLink({ href, prefix, children }: { href: string; prefix?: boolean; children: ReactNode }) {
  const path = usePathname();
  const current = path === href || (prefix && path.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      // Client navigation keeps the mobile menu popover open, so close it.
      onClick={(e) => e.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover()}
      className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium ${
        current ? "bg-accent-soft text-teal-800" : "text-muted hover:bg-slate-100 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
