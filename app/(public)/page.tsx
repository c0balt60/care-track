import Link from "next/link";
import { CalendarCheckIcon, CheckIcon, ClockIcon, SearchIcon } from "@/components/icons";
import { PractitionerCard } from "@/components/practitioner-card";
import { practitioners, services, slotsFor } from "@/lib/mock-data";

const steps = [
  { icon: <SearchIcon />, tone: "bg-accent-soft text-teal-800", title: "Search", text: "Tell us what you need and where. We list who has the soonest opening." },
  { icon: <ClockIcon />, tone: "bg-blue-50 text-blue-800", title: "Pick a time", text: "See real open times and pick one that works for you." },
  { icon: <CalendarCheckIcon />, tone: "bg-avocado-100 text-avocado-900", title: "Get confirmed", text: "Many practitioners confirm right away. Others review your request first." },
];

const popular = ["Family medicine", "Dermatology", "Physical therapy", "Pediatrics"];

export default function Home() {
  const soonest = practitioners
    .map((p) => ({ p, next: slotsFor(p)[0]?.start.getTime() ?? Infinity }))
    .sort((a, b) => a.next - b.next)[0].p;

  return (
    <>
      <section className="overflow-hidden bg-sand">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:py-20">
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
                  {/* teal-800: teal-700 is under 4.5:1 on sand. */}
                  <Link href={`/search?service=${encodeURIComponent(s)}`} className="link text-teal-800">{s}</Link>
                </span>
              ))}
            </p>
          </div>

          <div className="relative isolate">
            {/* Decorative avocado shapes behind the card. */}
            <div aria-hidden="true" className="absolute -inset-3 -z-10 -rotate-2 rounded-[2.5rem] bg-avocado-300/30 sm:-inset-8" />
            <div aria-hidden="true" className="absolute -inset-1.5 -z-10 -rotate-2 rounded-4xl bg-avocado-300/60 sm:-inset-4" />
            <p className="mb-3 text-sm font-medium text-avocado-900">Opening soon near Troy, NY</p>
            <PractitionerCard p={soonest} />
          </div>
        </div>
      </section>

      <section className="bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-4">
                <span className={`grid size-11 shrink-0 place-items-center rounded-full ${s.tone}`}>{s.icon}</span>
                <div>
                  <h3 className="font-semibold">{i + 1}. {s.title}</h3>
                  <p className="mt-1 text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="for-practitioners" className="panel-dark scroll-mt-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">For practitioners and clinics</h2>
            <p className="mt-3 text-lg text-white/80">
              Publish your open hours once. Patients book the times you choose, and you decide whether bookings confirm
              instantly or wait for your approval.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/signup?as=practitioner" className="btn bg-avocado-300 text-avocado-900 hover:bg-avocado-100">Sign up as a practitioner</Link>
              <Link href="/signup?as=clinic" className="btn btn-ghost">Set up your clinic</Link>
            </div>
          </div>
          <ul className="space-y-4 lg:pt-2 lg:text-lg">
            {[
              "Weekly hours plus days off and extra hours",
              "Accept or decline requests in one click",
              "Front desk can book phone and walk-in patients",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <CheckIcon className="mt-0.5 shrink-0 text-avocado-300" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
