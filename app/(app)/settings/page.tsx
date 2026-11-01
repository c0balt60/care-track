import Link from "next/link";
import { Field, Notice, noticeText, PageHeader, param } from "@/components/ui";
import { getPractitioner, getViewer } from "@/lib/mock-data";
import { patientDetailErrors } from "@/lib/patient-details";
import { updatePatientDetails } from "./actions";
import { getCurrentPatient } from "./current-patient";

export default async function Settings({ searchParams }: PageProps<"/settings">) {
  const viewer = await getViewer();
  const sp = await searchParams;
  if (!viewer) return null;

  const patient = viewer.role === "patient" ? await getCurrentPatient() : null;
  const p = viewer.role === "practitioner" ? getPractitioner(viewer.practitionerId) : undefined;
  const email = `${viewer.name.replace(/^Dr\.\s*/, "").toLowerCase().replace(/\s+/g, ".")}@example.com`;
  const notice = noticeText({ saved: "Changes saved." }, param(sp.notice));
  const error = noticeText(patientDetailErrors, param(sp.error));

  return (
    <>
      <PageHeader
        title="Settings"
        actions={p && <Link href={`/practitioners/${p.id}`} className="btn btn-secondary">View public profile</Link>}
      />
      {notice && <Notice>{notice}</Notice>}
      {error && <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</p>}

      {/* Patients save name, DOB, and phone to the DB. Other roles are still prototype: posts back here. */}
      <form {...(patient ? { action: updatePatientDetails } : { method: "post", action: "/settings?notice=saved" })} className="space-y-6">
        <section aria-labelledby="account" className="card p-5">
          <h2 id="account" className="text-lg font-semibold">Account</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Full name" id="name" autoComplete="name" defaultValue={patient?.name ?? viewer.name} required />
            <Field label="Email" id="email" type="email" autoComplete="email" defaultValue={email} required />
            {patient && (
              <>
                <Field label="Date of birth" id="dob" type="date" autoComplete="bday" defaultValue={patient.dob ?? ""} required />
                <Field label="Phone" id="phone" type="tel" autoComplete="tel" defaultValue={patient.phone ?? ""} required />
              </>
            )}
            <Field label="New password" id="password" type="password" autoComplete="new-password" minLength={8} hint="Leave blank to keep your current password." />
          </div>
        </section>

        {p && (
          <section aria-labelledby="public" className="card p-5">
            <h2 id="public" className="text-lg font-semibold">Public profile</h2>
            <p className="text-sm text-muted">Patients see this on your profile and in search results.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Photo" id="photo" type="file" accept="image/*" className="input file:mr-3 file:rounded-md file:border-0 file:bg-sand file:px-3 file:py-1" />
              <Field label="Credentials" id="credentials" defaultValue={p.credentials} required />
              <Field label="Specialty" id="specialty" defaultValue={p.specialty} required />
              <Field label="Services" id="services" defaultValue={p.services.join(", ")} hint="Separate with commas." />
              <div className="sm:col-span-2">
                <label htmlFor="bio" className="label">Bio</label>
                <textarea id="bio" name="bio" rows={4} defaultValue={p.bio} className="input" />
              </div>
            </div>
          </section>
        )}

        <div className="flex justify-end">
          <button className="btn btn-primary">Save changes</button>
        </div>
      </form>
    </>
  );
}
