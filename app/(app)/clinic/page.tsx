import { eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PlusIcon } from "@/components/icons";
import { Field, Notice, noticeText, PageHeader, param } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { clinicProfileErrors } from "@/lib/clinic-profile";
import { db } from "@/lib/db";
import { practitioners } from "@/lib/db/schema";
import { getPractitioner, invites, practitioners as mockPractitioners } from "@/lib/mock-data";
import { removePractitioner, updateClinicProfile } from "./actions";
import { getCurrentClinic } from "./current-clinic";

const pill = "inline-flex rounded-full px-2.5 py-0.5 text-sm font-medium";

export default async function ClinicSettings({ searchParams }: PageProps<"/clinic">) {
  const viewer = await getViewer();
  const sp = await searchParams;
  if (!viewer) return null;
  if (viewer.role !== "staff") notFound();

  const clinic = await getCurrentClinic();
  if (!clinic) return <p role="alert" className="card p-5">{clinicProfileErrors["no-clinic"]}</p>;

  const team = await db
    .select({ id: practitioners.id, name: practitioners.name, specialty: practitioners.specialty })
    .from(practitioners)
    .where(eq(practitioners.clinicId, clinic.id))
    .orderBy(practitioners.name);
  // ponytail: TEMPORARY. Invites have no table yet (no email service), so they stay mock data.
  const invited = invites.filter((i) => i.clinicId === viewer.clinicId);
  // ponytail: TEMPORARY. /practitioners/[id] still takes mock ids, so link by matching names.
  const profileHref = (name: string) => {
    const mock = mockPractitioners.find((m) => m.name === name);
    return mock && getPractitioner(mock.id) ? `/practitioners/${mock.id}` : null;
  };
  const error = noticeText(clinicProfileErrors, param(sp.error));
  const notice = noticeText(
    { saved: "Clinic profile saved.", invited: "Invite sent.", removed: "Practitioner removed." },
    param(sp.notice),
  );

  return (
    <>
      <PageHeader
        title="Clinic"
        description="Your clinic’s public profile and practitioners."
        actions={<Link href={`/clinics/${clinic.id}`} className="btn btn-secondary">View public page</Link>}
      />
      {notice && <Notice>{notice}</Notice>}
      {error && <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800">{error}</p>}

      <section aria-labelledby="profile" className="card p-5">
        <h2 id="profile" className="text-lg font-semibold">Clinic profile</h2>
        <form action={updateClinicProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Clinic name" id="name" defaultValue={clinic.name} required />
          <Field label="Phone" id="phone" type="tel" defaultValue={clinic.phone} required />
          <Field label="Street address" id="address" defaultValue={clinic.address} required />
          <Field label="City" id="city" defaultValue={clinic.city} required />
          <div className="sm:col-span-2">
            <Field label="Services" id="services" defaultValue={clinic.services.join(", ")} hint="Separate with commas." />
          </div>
          <div className="flex justify-end sm:col-span-2">
            <button className="btn btn-primary">Save profile</button>
          </div>
        </form>
      </section>

      <section aria-labelledby="team" className="card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="team" className="text-lg font-semibold">Practitioners</h2>
          <ConfirmDialog
            id="invite"
            trigger={<><PlusIcon /> Invite practitioner</>}
            title="Invite a practitioner"
            text={`They’ll get an email to join ${clinic.name}. They keep control of their own schedule.`}
            confirm="Send invite"
            cancel="Cancel"
            action="/clinic?notice=invited"
            method="post"
          >
            <Field label="Email" id="email" type="email" required />
          </ConfirmDialog>
        </div>

        <table className="mt-4 w-full text-left">
          <thead className="text-sm text-muted">
            <tr>
              <th scope="col" className="py-2 font-medium">Name</th>
              <th scope="col" className="hidden py-2 font-medium sm:table-cell">Specialty</th>
              <th scope="col" className="py-2 font-medium">Status</th>
              <th scope="col" className="py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-t border-line">
            {team.map((p) => (
              <tr key={p.id}>
                <td className="py-3 pr-2">{profileHref(p.name) ? <Link href={profileHref(p.name)!} className="link">{p.name}</Link> : p.name}</td>
                <td className="hidden py-3 pr-2 sm:table-cell">{p.specialty}</td>
                <td className="py-3 pr-2"><span className={`${pill} bg-green-50 text-green-800`}>Active</span></td>
                <td className="py-3 text-right">
                  <ConfirmDialog
                    id={`remove-${p.id}`}
                    trigger="Remove"
                    title={`Remove ${p.name}?`}
                    text="They’ll leave your clinic’s page. Appointments already booked stay booked."
                    confirm="Remove"
                    danger
                    action={removePractitioner}
                    hidden={{ practitionerId: p.id }}
                  />
                </td>
              </tr>
            ))}
            {invited.map((i) => (
              <tr key={i.email}>
                <td className="py-3 pr-2">{i.name}<span className="block text-sm text-muted">{i.email}</span></td>
                <td className="hidden py-3 pr-2 text-muted sm:table-cell">Not joined yet</td>
                <td className="py-3 pr-2"><span className={`${pill} bg-amber-50 text-amber-800`}>Invited</span></td>
                <td className="py-3 text-right" />
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
