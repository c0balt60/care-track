"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./ui";

export function Topbar({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const navLink = "hidden min-h-11 items-center px-2 text-sm font-medium text-muted hover:text-ink aria-[current=page]:text-ink";

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="ml-auto flex items-center gap-1 sm:gap-3">
          <Link href="/search" aria-current={path === "/search" ? "page" : undefined} className={`${navLink} sm:flex`}>
            Find care
          </Link>
          <Link href="/#for-practitioners" className={`${navLink} md:flex`}>
            For practitioners
          </Link>
          {signedIn ? (
            <Link href="/dashboard" className="btn btn-primary">Dashboard</Link>
          ) : (
            <>
              <Link href="/login" className="flex min-h-11 items-center px-2 text-sm font-medium text-muted hover:text-ink">
                Log in
              </Link>
              <Link href="/signup" className="btn btn-primary">Sign up</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
