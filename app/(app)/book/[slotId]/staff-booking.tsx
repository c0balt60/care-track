"use client";
import { useActionState } from "react";
import { bookForPatient, lookupPatient, type LookupState, type StaffBookingState } from "./actions";

/** "1990-04-12" → "Apr 12, 1990". Dates of birth are calendar days, so format in UTC. */
const born = (dob: string) => new Date(`${dob}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "medium" });

function Alert({ children }: { children: string }) {
  return <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{children}</div>;
}

/**
 * Front desk books a slot for a patient (SCH-6 #24), in two steps on this page:
 *
 * 1. Find the patient by full name + date of birth (exact). Both actions use useActionState,
 *    so the name and date of birth go in the POST body, never the URL.
 * 2. Pick the match, or add them as a new patient if there's none, give a reason, and book.
 *    The name and date of birth from step 1 travel along in hidden fields, and the server
 *    checks them again against the patient it books for.
 */
export function StaffBooking({ slotId }: { slotId: string }) {
  const [found, lookup, searching] = useActionState(lookupPatient, {} as LookupState);
  const [booking, book, saving] = useActionState(bookForPatient.bind(null, slotId), {} as StaffBookingState);
  const matches = found.matches;
  const option =
    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line p-3 has-checked:border-accent has-checked:bg-accent-soft";

  return (
    <div className="mt-6 space-y-6">
      <form action={lookup} aria-labelledby="find" className="card space-y-4 p-4 sm:p-5">
        <div>
          <h2 id="find" className="text-lg font-semibold">Find the patient</h2>
          <p className="text-sm text-muted">Ask for their full name and date of birth. Only an exact match comes up.</p>
        </div>
        {found.error && <Alert>{found.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="find-name" className="label">Full name</label>
            <input id="find-name" name="name" required autoComplete="off" defaultValue={found.name} className="input" />
          </div>
          <div>
            <label htmlFor="find-dob" className="label">Date of birth</label>
            <input id="find-dob" name="dob" type="date" required defaultValue={found.dob} className="input" />
          </div>
        </div>
        <button disabled={searching} className="btn btn-secondary disabled:opacity-60">{searching ? "Searching…" : "Find patient"}</button>
      </form>

      {matches && (
        // Keyed on the lookup, so a new search starts this form fresh.
        <form key={`${found.name}|${found.dob}`} action={book} aria-labelledby="who" className="card space-y-4 p-4 sm:p-5">
          <input type="hidden" name="name" value={found.name} />
          <input type="hidden" name="dob" value={found.dob} />

          {matches.length ? (
            <fieldset className="space-y-2">
              <legend id="who" className="mb-2 text-lg font-semibold">Book for</legend>
              <input type="hidden" name="mode" value="existing" />
              {matches.map((m, i) => (
                <label key={m.id} className={option}>
                  <input type="radio" name="patientId" value={m.id} defaultChecked={i === 0} required />
                  <span>
                    <span className="font-medium">{m.name}</span>
                    <span className="block text-sm text-muted">
                      Born {born(m.dob)} · {m.hasAccount ? "Has an account" : "Front-desk record"}
                      {m.phoneLast4 && ` · Phone ending ${m.phoneLast4}`}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 id="who" className="text-lg font-semibold">New patient</h2>
                <p className="text-sm text-muted">
                  No patient named {found.name}, born {born(found.dob!)}. Check the spelling with them, or add them now.
                </p>
              </div>
              <input type="hidden" name="mode" value="new" />
              <div>
                <label htmlFor="new-phone" className="label">Phone</label>
                <input id="new-phone" name="phone" type="tel" required autoComplete="off" className="input" />
              </div>
            </div>
          )}

          <div>
            <label htmlFor="reason" className="label">Reason for visit</label>
            <textarea id="reason" name="reason" rows={3} required maxLength={1000} className="input" />
          </div>
          {booking.error && <Alert>{booking.error}</Alert>}
          <p className="text-sm text-muted">Front-desk bookings are confirmed right away.</p>
          <button disabled={saving} className="btn btn-primary w-full disabled:opacity-60">
            {saving ? "Booking…" : matches.length ? "Book appointment" : "Add patient and book"}
          </button>
        </form>
      )}
    </div>
  );
}
