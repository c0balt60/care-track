import { PlusIcon, SearchIcon } from "@/components/icons";
import { Field } from "@/components/ui";
import { patients } from "@/lib/mock-data";

const born = (dob: string) =>
  new Date(`${dob}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", dateStyle: "medium" });

/**
 * Front desk only. The search box is its own GET form (?q=), so the radios use
 * form="book" to belong to the booking form that comes after this section.
 */
export default function PatientPicker({ q = "" }: { q?: string }) {
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? patients.filter((p) => [p.name, p.dob, born(p.dob), p.phone].some((v) => v.toLowerCase().includes(needle)))
    : [];
  const option = "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line p-3 has-checked:border-accent has-checked:bg-accent-soft";

  return (
    <section aria-labelledby="patient" className="card mt-6 p-4 sm:p-5">
      <h2 id="patient" className="text-lg font-semibold">Patient</h2>

      <form role="search" className="mt-3 flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="q" className="label">Find a patient</label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Name, date of birth, or phone" className="input" />
        </div>
        <button className="btn btn-secondary"><SearchIcon /> Search</button>
      </form>

      <fieldset className="mt-4">
        <legend className="sr-only">Choose a patient</legend>
        <ul className="space-y-2">
          {matches.map((p) => (
            <li key={p.id}>
              <label className={option}>
                <input type="radio" name="patient" value={p.id} form="book" required className="size-5" />
                <span>
                  <span className="block font-medium">{p.name}</span>
                  <span className="block text-sm text-muted">Born {born(p.dob)} · {p.phone}</span>
                </span>
              </label>
            </li>
          ))}
          {needle && !matches.length && <li className="text-sm text-muted">No patients match “{q}”.</li>}
          <li className="group">
            <label className={option}>
              <input type="radio" name="patient" value="new" form="book" required className="size-5" />
              <PlusIcon /> New patient
            </label>
            <div className="mt-3 hidden space-y-3 group-has-checked:block">
              <Field label="Full name" id="newName" form="book" />
              <Field label="Date of birth" id="newDob" type="date" form="book" />
              <Field label="Phone" id="newPhone" type="tel" form="book" />
            </div>
          </li>
        </ul>
      </fieldset>
    </section>
  );
}
