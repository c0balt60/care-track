import Link from "next/link";
import type { ReactNode } from "react";
import { appointmentsFor, type Viewer } from "@/lib/mock-data";
import { MenuIcon, XIcon } from "./icons";
import { NavLink } from "./nav-link";
import { PreviewBar } from "./preview-bar";
import { Logo } from "./ui";

const roleLabel = { patient: "Patient", practitioner: "Practitioner", staff: "Clinic staff" };

function Nav({ viewer }: { viewer: Viewer }) {
  const pending = appointmentsFor(viewer).filter((a) => a.status === "pending").length;
  const items: [label: string, href: string][] =
    viewer.role === "patient" ? [["Home", "/dashboard"], ["Find care", "/search"], ["Appointments", "/appointments"], ["Settings", "/settings"]]
    : viewer.role === "practitioner" ? [["Today", "/dashboard"], ["Appointments", "/appointments"], ["Availability", "/availability"], ["Settings", "/settings"]]
    : [["Clinic today", "/dashboard"], ["Book for a patient", "/clinic/book"], ["Appointments", "/appointments"], ["Clinic", "/clinic"], ["Settings", "/settings"]];

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col">
      <ul className="space-y-1">
        {items.map(([label, href]) => (
          <li key={href}>
            <NavLink href={href} prefix={href === "/appointments"}>
              {label}
              {href === "/appointments" && viewer.role === "practitioner" && pending > 0 && (
                <span className="rounded-full bg-amber-50 px-2 text-xs font-semibold text-amber-800">
                  {pending}<span className="sr-only"> pending</span>
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="mt-auto border-t border-white/15 pt-4">
        <p className="px-3 font-medium">{viewer.name}</p>
        <p className="px-3 text-sm text-white/70">{roleLabel[viewer.role]}</p>
        <Link href="/login" className="mt-2 flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-white/75 hover:bg-white/10 hover:text-white">
          Log out
        </Link>
      </div>
    </nav>
  );
}

/** Sidebar at lg and up. Below that, a top bar whose menu is a native popover. */
export function AppShell({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return (
    <div className="flex-1 lg:flex">
      <aside className="panel-dark sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 p-4 lg:flex">
        <Logo href="/dashboard" />
        <Nav viewer={viewer} />
      </aside>

      <div className="min-w-0 flex-1">
        <PreviewBar role={viewer.role} />
        <header className="panel-dark sticky top-0 z-10 flex h-16 items-center justify-between px-4 lg:hidden">
          <Logo href="/dashboard" />
          <button type="button" popoverTarget="app-menu" className="btn btn-ghost">
            <MenuIcon /> Menu
          </button>
          <div
            id="app-menu"
            popover="auto"
            className="panel-dark inset-x-0 top-0 bottom-auto m-0 w-full max-w-none p-4 shadow-lg"
          >
            <div className="mb-4 flex items-center justify-between">
              <Logo href="/dashboard" />
              <button type="button" popoverTarget="app-menu" popoverTargetAction="hide" className="btn btn-ghost px-3" aria-label="Close menu">
                <XIcon />
              </button>
            </div>
            <Nav viewer={viewer} />
          </div>
        </header>

        <main id="main">
          <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}
