import Link from "next/link";
import { dayKey, formatDay, formatTime, formatWhen } from "@/lib/dates";
import { directionsUrl, travelMinutes } from "@/lib/geo";
import type { SearchResult } from "@/lib/practitioner-search";
import { MapPinIcon } from "./icons";
import { Avatar } from "./ui";

/**
 * Up to 3 time chips for the next open day. Takes one row from
 * searchPractitioners(), which already worked out the open slots (and applied
 * any ?from= day filter), so this component does no data loading of its own.
 */
export function PractitionerCard({ result }: { result: SearchResult }) {
  const { practitioner: p, clinic, slots, km, point } = result;
  const tz = p.timeZone;
  const first = slots[0];
  const firstDay = first ? dayKey(first.start, tz) : null;
  const chips = first ? slots.filter((s) => dayKey(s.start, tz) === firstDay).slice(0, 3) : [];
  // "More times" opens the picker on the day this card shows, so a search with ?from=
  // doesn't jump back to earlier times. Only the day goes in the link: SlotPicker works
  // out its week when the profile renders, so the link can't go stale after midnight.
  const moreTimes = firstDay
    ? `/practitioners/${p.id}?${new URLSearchParams({ day: firstDay })}`
    : `/practitioners/${p.id}`;

  return (
    <article
      id={`result-${p.id}`}
      data-result-id={p.id}
      tabIndex={-1}
      className="card scroll-mt-24 p-4 transition-shadow data-[active]:ring-2 data-[active]:ring-accent sm:p-5"
    >
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
          <p>
            <a
              href={directionsUrl({ address: clinic?.address, city: clinic?.city ?? p.city, point: point })}
              target="_blank"
              rel="noopener noreferrer"
              className="link text-sm"
            >
              Get directions<span className="sr-only"> (opens Google Maps)</span>
            </a>
          </p>
          {km != null && (
            <p className="text-sm text-muted">
              {km < 10 ? km.toFixed(1) : Math.round(km)} km away · about {travelMinutes(km)} min drive (estimate)
            </p>
          )}
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
                <Link href={moreTimes} className="link inline-flex min-h-11 items-center px-2 text-sm">
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
