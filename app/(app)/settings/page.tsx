import Link from "next/link";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field, Notice, noticeText, PageHeader, param } from "@/components/ui";
import { accountDeletionErrors } from "@/lib/account-deletion";
import { requireRole } from "@/lib/auth";
import { patientDetailErrors } from "@/lib/patient-details";
import { practitionerProfileErrors } from "@/lib/practitioner-profile";
import { deleteMyAccount, updatePatientDetails, updatePractitionerProfile } from "./actions";
import { getCurrentPatient } from "./current-patient";
import { getCurrentPractitioner } from "./current-practitioner";

// Every field here saves. Patients edit their details, practitioners their public profile.
// Changing email or password isn't built yet, so the account card is read-only rather than
// showing boxes that would silently do nothing.
export default async function Settings({ searchParams }: PageProps<"/settings">) {
  const viewer = await requireRole("patient", "practitioner", "staff");
  const sp = await searchParams;

  const patient = viewer.role === "patient" ? await getCurrentPatient() : null;
  const profile = viewer.role === "practitioner" ? await getCurrentPractitioner() : null;
  const notice = noticeText({ saved: "Changes saved." }, param(sp.notice));
  const error = noticeText({ ...patientDetailErrors, ...practitionerProfileErrors, ...accountDeletionErrors }, param(sp.error));

  return (
    <>
      <PageHeader
        title="Settings"
        actions={profile && <Link href={`/practitioners/${profile.id}`} className="btn btn-secondary">View public profile</Link>}
      />
      {notice && <Notice>{notice}</Notice>}
      {error && <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</p>}

      <section aria-labelledby="account" className="card p-5">
        <h2 id="account" className="text-lg font-semibold">Account</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          {!patient && (
            <div>
              <dt className="label">Name</dt>
              <dd>{viewer.name}</dd>
            </div>
          )}
          <div>
            <dt className="label">Email</dt>
            <dd>{viewer.email}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted">Changing your email or password isn&rsquo;t available yet.</p>
      </section>

      {patient && (
        <form action={updatePatientDetails} aria-labelledby="details" className="card mt-6 p-5">
          <h2 id="details" className="text-lg font-semibold">Your details</h2>
          <p className="text-sm text-muted">Your clinic sees these when you book.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Full name" id="name" autoComplete="name" defaultValue={patient.name} required />
            <Field label="Date of birth" id="dob" type="date" autoComplete="bday" defaultValue={patient.dob ?? ""} required />
            <Field label="Phone" id="phone" type="tel" autoComplete="tel" defaultValue={patient.phone ?? ""} required />
          </div>
          <div className="mt-6 flex justify-end">
            <button className="btn btn-primary">Save changes</button>
          </div>
        </form>
      )}

      {profile && (
        <form action={updatePractitionerProfile} aria-labelledby="public" className="card mt-6 p-5">
          <h2 id="public" className="text-lg font-semibold">Public profile</h2>
          <p className="text-sm text-muted">Patients see this on your profile and in search results.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Credentials" id="credentials" defaultValue={profile.credentials} required />
            <Field label="Specialty" id="specialty" defaultValue={profile.specialty} required />
            <div className="sm:col-span-2">
              <Field label="Services" id="services" defaultValue={profile.services.join(", ")} hint="Separate with commas." />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="bio" className="label">Bio</label>
              <textarea id="bio" name="bio" rows={4} defaultValue={profile.bio} className="input" />
            </div>
          </div>
          <div className="mt-6 flex justify-end">
            <button className="btn btn-primary">Save changes</button>
          </div>
        </form>
      )}

      {/* #78. Patients only: an admin deletes other kinds of account on request. */}
      {patient && (
        <section aria-labelledby="delete" className="card mt-6 border-red-200 p-5">
          <h2 id="delete" className="text-lg font-semibold">Delete account</h2>
          <p className="mt-1 text-muted">
            This signs you out everywhere, cancels your upcoming appointments and removes your name, date of birth and phone.
            Your clinic keeps the history of past visits, without your details. You can&rsquo;t undo it.
          </p>
          <div className="mt-4">
            <ConfirmDialog
              id="delete-account"
              trigger="Delete my account"
              triggerClassName="btn btn-danger"
              title="Delete your account?"
              text="Your upcoming appointments will be cancelled and you'll be signed out. Enter your password to confirm."
              confirm="Delete my account"
              cancel="Keep my account"
              danger
              action={deleteMyAccount}
            >
              <div>
                <label htmlFor="delete-password" className="label">Password</label>
                <input id="delete-password" name="password" type="password" autoComplete="current-password" required className="input" />
              </div>
            </ConfirmDialog>
          </div>
        </section>
      )}
    </>
  );
}
