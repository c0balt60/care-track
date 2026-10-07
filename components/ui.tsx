// Small shared pieces: Logo, PageHeader, StatusBadge, Avatar, EmptyState, Notice.
import Link from "next/link";
import type { InputHTMLAttributes, ReactNode } from "react";
import type { Status } from "@/lib/mock-data";
import { CalendarCheckIcon, CheckIcon } from "./icons";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 text-lg font-bold tracking-tight">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">
        <CalendarCheckIcon width={18} height={18} />
      </span>
      CareTrack
    </Link>
  );
}

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const badges: Record<Status, [label: string, className: string]> = {
  pending: ["Pending", "bg-amber-50 text-amber-800"],
  confirmed: ["Confirmed", "bg-green-50 text-green-800"],
  declined: ["Declined", "bg-red-50 text-red-700"],
  cancelled: ["Cancelled", "bg-stone-100 text-stone-700"],
  completed: ["Completed", "bg-blue-50 text-blue-800"],
};

export function StatusBadge({ status }: { status: Status }) {
  const [label, className] = badges[status];
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-sm font-medium ${className}`}>{label}</span>;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initials = name
    .replace(/^Dr\.\s*/, "")
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  // Same name, same color.
  const tones = ["bg-accent-soft text-teal-800", "bg-blue-50 text-blue-800", "bg-avocado-100 text-avocado-900"];
  const tone = tones[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % tones.length];
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${tone} ${size === "lg" ? "size-16 text-xl" : "size-11"}`}
    >
      {initials}
    </span>
  );
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-10 text-center">
      {icon && <span className="mb-3 grid size-12 place-items-center rounded-full bg-accent-soft text-teal-800">{icon}</span>}
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Confirmation banner after an action, e.g. "Changes saved." */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="mb-6 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">
      <CheckIcon className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** A labeled input. `id` doubles as the field name. */
export function Field({ label, id, hint, ...props }: { label: string; id: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} name={id} className="input" aria-describedby={hint ? `${id}-hint` : undefined} {...props} />
      {hint && <p id={`${id}-hint`} className="mt-1 text-sm text-muted">{hint}</p>}
    </div>
  );
}

/** Looks up the message for ?notice=, ignoring unknown values. */
export const noticeText = (messages: Record<string, string>, key?: string) =>
  key && Object.hasOwn(messages, key) ? messages[key] : undefined;

/** The value of a search param, if it's a single string. */
export const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
