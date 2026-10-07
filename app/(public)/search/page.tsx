import Link from "next/link";
import { SearchIcon } from "@/components/icons";
import { PractitionerCard } from "@/components/practitioner-card";
import { EmptyState, param } from "@/components/ui";
import { dayKey } from "@/lib/dates";
import { practitioners, services, slotsFor, today } from "@/lib/mock-data";

export default async function Search({ searchParams }: PageProps<"/search">) {
  const sp = await searchParams;
  const service = param(sp.service)?.trim() ?? "";
  const near = param(sp.near)?.trim() ?? "";
  const from = param(sp.from) ?? "";

  // Prototype: every mock practitioner counts as "near", so only service and date filter.
  const q = service.toLowerCase();
  const results = practitioners
    .filter((p) => !q || [p.specialty, ...p.services].some((s) => s.toLowerCase().includes(q)))
    .map((p) => ({
      p,
      next: slotsFor(p).find((s) => !from || dayKey(s.start, p.timeZone) >= from)?.start.getTime() ?? Infinity,
    }))
    .sort((a, b) => a.next - b.next);

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
          <input id="from" name="from" type="date" min={today()} defaultValue={from} className="input" />
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
            {results.map(({ p }) => (
              <li key={p.id}>
                <PractitionerCard p={p} from={from} />
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
