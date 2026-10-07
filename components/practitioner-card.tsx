import Link from "next/link";
import { dayKey, formatDay, formatTime, formatWhen } from "@/lib/dates";
import { getClinic, type Practitioner, slotsFor } from "@/lib/mock-data";
import { MapPinIcon } from "./icons";
import { Avatar } from "./ui";

/** Up to 3 time chips for the next open day. `from` is a "YYYY-MM-DD" to start looking. */
export function PractitionerCard({ p, from }: { p: Practitioner; from?: string }) {
  const tz = p.timeZone;
  const slots = slotsFor(p).filter((s) => !from || dayKey(s.start, tz) >= from);
  const first = slots[0];
  const chips = first ? slots.filter((s) => dayKey(s.start, tz) === dayKey(first.start, tz)).slice(0, 3) : [];
  const clinic = getClinic(p.clinicId);

  return (
    <article className="card p-4 sm:p-5">
      <div className="flex gap-4">
        <Avatar name={p.name} />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">
            <Link href={`/practitioners/${p.id}`} className="hover:underline">
              {p.name}, {p.credentials}
            </Link>
          </h3>
          <p>{p.specialty}</p>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
            <MapPinIcon width={16} height={16} />
            {clinic ? `${clinic.name} · ${clinic.city}` : p.city}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        {first ? (
          <>
            <p className="text-sm font-medium">
              Next open: <time dateTime={dayKey(first.start, tz)}>{formatDay(first.start, tz)}</time>
            </p>
            <ul className="mt-2 flex flex-wrap items-center gap-2">
              {chips.map((s) => (
                <li key={s.id}>
                  <Link href={`/book/${s.id}`} className="chip" aria-label={`Book ${formatWhen(s.start, tz)}`}>
                    {formatTime(s.start, tz)}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={`/practitioners/${p.id}`} className="link inline-flex min-h-11 items-center px-2 text-sm">
                  More times →
                </Link>
              </li>
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted">No openings in the next 4 weeks.</p>
        )}
      </div>
    </article>
  );
}
