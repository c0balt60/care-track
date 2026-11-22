import Link from "next/link";
import { SearchIcon } from "@/components/icons";
import { PractitionerCard } from "@/components/practitioner-card";
import { EmptyState, param } from "@/components/ui";
import { addDays, dayKey } from "@/lib/dates";
import { listServices, searchPractitioners } from "@/lib/practitioner-search";

export default async function Search({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const service = param(sp.service)?.trim() ?? "";
  const near = param(sp.near)?.trim() ?? "";
  const from = param(sp.from) ?? "";

  // "near" is shown in the heading but doesn't filter yet: location search is MAP-2 (#52) / MAP-3 (#53).
  const [results, services] = await Promise.all([searchPractitioners({ service, from }), listServices()]);
  // Earliest day the date picker allows. Patients are in many zones, and in the Americas
  // "today" can already be tomorrow in UTC, so allow from yesterday (UTC). Picking a day
  // that's over is harmless: searchPractitioners never shows past slots.
  const earliest = addDays(dayKey(new Date(), "UTC"), -1);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[18rem_1fr] lg:items-start">
      <form className="card grid gap-4 p-4 sm:grid-cols-3 lg:sticky lg:top-24 lg:grid-cols-1">
        <h2 className="sr-only">Filters</h2>
        <div>
          <label htmlFor="service" className="label">Service or specialty</label>
          <input id="service" name="service" list="services" defaultValue={service} className="input" />
          <datalist id="services">
            {services.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor="near" className="label">Near</label>
          <input id="near" name="near" defaultValue={near} className="input" placeholder="City or ZIP" />
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
            {near && <span className="text-muted"> near {near}</span>}
          </h1>
          <p className="text-sm text-muted">
            {results.length} {results.length === 1 ? "result" : "results"}, soonest opening first
          </p>
        </div>

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
