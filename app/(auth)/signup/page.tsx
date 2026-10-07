import Link from "next/link";
import { Field, param } from "@/components/ui";

const roles = {
  patient: { title: "I’m a patient", text: "Find open times and book appointments." },
  practitioner: { title: "I’m a practitioner", text: "Publish your hours and take bookings." },
  clinic: { title: "I manage a clinic", text: "Set up your clinic and book for patients." },
};

export default async function Signup({ searchParams }: PageProps<"/signup">) {
  const sp = await searchParams;
  const as = param(sp.as);
  const next = param(sp.next);
  const keepNext = next ? `next=${encodeURIComponent(next)}` : "";
  const login = (
    <p className="mt-6 text-center text-sm text-muted">
      Already have an account? <Link href={`/login${keepNext && `?${keepNext}`}`} className="link">Log in</Link>
    </p>
  );

  if (as !== "patient" && as !== "practitioner" && as !== "clinic") {
    return (
      <div className="card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight">Create an account</h1>
        <p className="mt-1 text-muted">Which describes you?</p>
        <ul className="mt-6 space-y-3">
          {Object.entries(roles).map(([key, r]) => (
            <li key={key}>
              <Link href={`/signup?as=${key}${keepNext && `&${keepNext}`}`} className="card card-link block p-4 hover:border-accent">
                <span className="block font-semibold">{r.title}</span>
                <span className="block text-sm text-muted">{r.text}</span>
              </Link>
            </li>
          ))}
        </ul>
        {login}
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8">
      <p className="text-sm text-muted">
        {roles[as].title} · <Link href={`/signup${keepNext && `?${keepNext}`}`} className="link">Change</Link>
      </p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create an account</h1>

      {/* Prototype: posts to the dashboard. The real form calls the team's sign-up action. */}
      <form method="post" action="/dashboard" className="mt-6 space-y-4">
        <Field label="Full name" id="name" autoComplete="name" required />
        <Field label="Email" id="email" type="email" autoComplete="email" required />
        <Field label="Password" id="password" type="password" autoComplete="new-password" minLength={8} required hint="At least 8 characters." />

        {as === "patient" && (
          <>
            <Field label="Date of birth" id="dob" type="date" autoComplete="bday" required />
            <Field label="Phone" id="phone" type="tel" autoComplete="tel" required />
          </>
        )}

        {as === "practitioner" && (
          <>
            <Field label="Specialty" id="specialty" placeholder="e.g. Dermatology" required />
            <Field label="Credentials" id="credentials" placeholder="e.g. MD" required hint="You can join a clinic later, when it invites you." />
          </>
        )}

        {as === "clinic" && (
          <fieldset className="space-y-4 border-t border-line pt-4">
            <legend className="float-left mb-2 font-semibold">Your clinic</legend>
            <div className="clear-left space-y-4">
              <Field label="Clinic name" id="clinicName" required />
              <Field label="Street address" id="address" autoComplete="street-address" required />
              <Field label="City" id="city" autoComplete="address-level2" required />
              <Field label="Clinic phone" id="clinicPhone" type="tel" required />
            </div>
          </fieldset>
        )}

        <button className="btn btn-primary w-full">Create account</button>
      </form>
      {login}
    </div>
  );
}
