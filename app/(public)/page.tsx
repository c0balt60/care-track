import Link from "next/link";
import { CalendarCheckIcon, CheckIcon, ClockIcon, SearchIcon } from "@/components/icons";
import { PractitionerCard } from "@/components/practitioner-card";
import { practitioners, services, slotsFor } from "@/lib/mock-data";

const steps = [
  { icon: <SearchIcon />, title: "Search", text: "Tell us what you need and where. We list who has the soonest opening." },
  { icon: <ClockIcon />, title: "Pick a time", text: "See real open times and pick one that works for you." },
  { icon: <CalendarCheckIcon />, title: "Get confirmed", text: "Many practitioners confirm right away. Others review your request first." },
];

const popular = ["Family medicine", "Dermatology", "Physical therapy", "Pediatrics"];

export default function Home() {
  const soonest = practitioners
    .map((p) => ({ p, next: slotsFor(p)[0]?.start.getTime() ?? Infinity }))
    .sort((a, b) => a.next - b.next)[0].p;

  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
        <div>
          <h1 className="text-[clamp(2.5rem,6vw,4rem)] font-bold leading-[1.05] tracking-tight">
            See who’s open.
            <span className="block text-accent">Book sooner.</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-muted">
            CareTrack shows real open times from practitioners near you, so you can book a visit in a few taps.
          </p>

          <form action="/search" className="card mt-8 grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="service" className="label">Service or specialty</label>
              <input id="service" name="service" list="services" className="input" placeholder="e.g. Dermatology" />
            </div>
            <div>
              <label htmlFor="near" className="label">Near</label>
              <input id="near" name="near" className="input" placeholder="City or ZIP" defaultValue="Troy, NY" />
            </div>
            <button className="btn btn-primary">
              <SearchIcon /> Find openings
            </button>
          </form>
          <datalist id="services">
            {services.map((s) => <option key={s} value={s} />)}
          </datalist>

          <p className="mt-4 text-sm text-muted">
            Popular:{" "}
            {popular.map((s, i) => (
              <span key={s}>
                {i > 0 && " · "}
                <Link href={`/search?service=${encodeURIComponent(s)}`} className="link">{s}</Link>
              </span>
            ))}
          </p>
        </div>

        <div>
          <p className="mb-3 text-sm font-medium text-muted">Opening soon near Troy, NY</p>
          <PractitionerCard p={soonest} />
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-teal-800">{s.icon}</span>
                <div>
                  <h3 className="font-semibold">{i + 1}. {s.title}</h3>
                  <p className="mt-1 text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="for-practitioners" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6">
        <div className="card grid gap-8 p-6 sm:p-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">For practitioners and clinics</h2>
            <p className="mt-2 text-muted">
              Publish your open hours once. Patients book the times you choose, and you decide whether bookings confirm
              instantly or wait for your approval.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/signup?as=practitioner" className="btn btn-secondary">Sign up as a practitioner</Link>
              <Link href="/signup?as=clinic" className="btn btn-secondary">Set up your clinic</Link>
            </div>
          </div>
          <ul className="space-y-3">
            {[
              "Weekly hours plus days off and extra hours",
              "Accept or decline requests in one click",
              "Front desk can book phone and walk-in patients",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <CheckIcon className="mt-0.5 shrink-0 text-accent" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
