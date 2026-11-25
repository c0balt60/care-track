import Link from "next/link";
import { MapPinIcon, SearchIcon } from "@/components/icons";
import { PractitionerCard } from "@/components/practitioner-card";
import { UseMyLocation } from "@/components/use-my-location";
import { EmptyState, param } from "@/components/ui";
import { addDays, dayKey } from "@/lib/dates";
import { AVG_KMH } from "@/lib/geo";
import { resolveLocation } from "@/lib/geocode";
import { listServices, searchPractitioners } from "@/lib/practitioner-search";

export default async function Search({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const service = param(sp.service)?.trim() ?? "";
  const near = param(sp.near)?.trim() ?? "";
  const from = param(sp.from) ?? "";
  // MAP-3 (#53). Unknown or missing values mean "any"; a URL can't pick values the selects don't offer.
  const pick = (v: string | undefined, allowed: number[]) => (allowed.includes(Number(v)) ? Number(v) : undefined);
  const maxKm = pick(param(sp.km), KM);
  const maxMin = pick(param(sp.min), MINUTES);
  const maxWait = pick(param(sp.wait), WAIT_DAYS);
  const sort = param(sp.sort) === "nearest" ? "nearest" : "soonest";

  // `location.point` is where the patient searches from (MAP-2 #52). Travel time is distance at
  // AVG_KMH, so a time limit is just a tighter distance limit.
  const location = await resolveLocation(near, param(sp.lat), param(sp.lng));
  const limits = [maxKm, maxMin && (maxMin / 60) * AVG_KMH].filter((x): x is number => !!x);
  const [results, services] = await Promise.all([
    searchPractitioners({
      service, from, near: location.point, maxKm: limits.length ? Math.min(...limits) : undefined, maxWaitDays: maxWait, sort,
    }),
    listServices(),
  ]);
  const needsPlace = !location.point && !location.error && (maxKm || maxMin || sort === "nearest");
  // "Use my location" leaves Near empty; keep its coordinates through the next form submit.
  const fromBrowser = !near && location.point;
  // Earliest day the date picker allows. Patients are in many zones, and in the Americas
  // "today" can already be tomorrow in UTC, so allow from yesterday (UTC). Picking a day
  // that's over is harmless: searchPractitioners never shows past slots.
  const earliest = addDays(dayKey(new Date(), "UTC"), -1);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[18rem_1fr] lg:items-start">
      <form className="card grid gap-4 p-4 sm:grid-cols-3 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:grid-cols-1 lg:overflow-y-auto">
        <h2 className="sr-only">Filters</h2>
        <div>
          <label htmlFor="service" className="label">Service or specialty</label>
          <select id="service" name="service" defaultValue={service} className="input">
            <option value="">All services</option>
            {/* Keep a value from an old link or typed URL selectable even if it isn't in the list. */}
            {(service && !services.includes(service) ? [service, ...services] : services).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="near" className="label">Near</label>
          <input id="near" name="near" defaultValue={near} className="input" placeholder="City or postal code" />
          {fromBrowser && (
            <>
              <input type="hidden" name="lat" value={fromBrowser.lat} />
              <input type="hidden" name="lng" value={fromBrowser.lng} />
              <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
                <MapPinIcon className="shrink-0" />
                <span>
                  Searching near <strong>{location.label}</strong>
                </span>
              </p>
            </>
          )}
          <div className="mt-2">
            <UseMyLocation />
          </div>
        </div>
        <Choice id="km" label="Distance" value={maxKm} options={KM.map((n) => [n, `Within ${n} km`])} />
        <Choice id="min" label="Travel time (est.)" value={maxMin} options={MINUTES.map((n) => [n, `Within ~${n} min`])} />
        <Choice id="wait" label="Next opening" value={maxWait} options={WAIT_DAYS.map((n) => [n, n === 1 ? "Within 1 day" : `Within ${n} days`])} />
        <div>
          <label htmlFor="sort" className="label">Sort by</label>
          <select id="sort" name="sort" defaultValue={sort} className="input">
            <option value="soonest">Soonest opening</option>
            <option value="nearest">Nearest</option>
          </select>
        </div>
        <div>
          <label htmlFor="from" className="label">From</label>
          <input id="from" name="from" type="date" min={earliest} defaultValue={from} className="input" />
        </div>
        <button className="btn btn-primary sm:col-span-3 lg:col-span-1">
          <SearchIcon /> Find openings
        </button>
      </form>

      <section aria-labelledby="results">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h1 id="results" className="text-2xl font-semibold tracking-tight">
            {service || "All openings"}
            {near ? <span className="text-muted"> near {near}</span> : fromBrowser && <span className="text-muted"> near {location.label}</span>}
          </h1>
          <p className="text-sm text-muted">
            {results.length} {results.length === 1 ? "result" : "results"}, {sort === "nearest" && location.point ? "nearest first" : "soonest opening first"}
          </p>
        </div>

        {location.error && (
          <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            {location.error}
          </p>
        )}

        {needsPlace && (
          <p role="alert" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            Enter a city or postal code, or use your location, to filter or sort by distance.
          </p>
        )}

        {results.length ? (
          <ul className="grid gap-4">
            {results.map((r) => (
              <li key={r.practitioner.id}>
                <PractitionerCard result={r} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<SearchIcon />}
            title="No openings found"
            text={`No openings for ${service}${near ? ` near ${near}` : ""} in the next 4 weeks. Try a different service, a wider area, or clear the date.`}
            action={<Link href="/search" className="btn btn-secondary">Clear filters</Link>}
          />
        )}
      </section>
    </div>
  );
}

const KM = [5, 10, 25, 50];
const MINUTES = [15, 30, 60];
const WAIT_DAYS = [1, 3, 7, 14];

/** A filter select whose blank option means "any". Submits nothing when blank. */
function Choice({ id, label, value, options }: { id: string; label: string; value?: number; options: [number, string][] }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <select id={id} name={id} defaultValue={value ?? ""} className="input">
        <option value="">Any</option>
        {options.map(([n, text]) => <option key={n} value={n}>{text}</option>)}
      </select>
    </div>
  );
}
