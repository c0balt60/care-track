import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PlusIcon, XIcon } from "@/components/icons";
import { Field, Notice, noticeText, PageHeader, param } from "@/components/ui";
import { getClinic, getViewer, invites, practitioners } from "@/lib/mock-data";

const pill = "inline-flex rounded-full px-2.5 py-0.5 text-sm font-medium";

export default async function ClinicSettings({ searchParams }: PageProps<"/clinic">) {
  const viewer = await getViewer();
  const sp = await searchParams;
  if (!viewer) return null;
  if (viewer.role !== "staff") notFound();

  const clinic = getClinic(viewer.clinicId)!;
  const team = practitioners.filter((p) => p.clinicId === clinic.id);
  const invited = invites.filter((i) => i.clinicId === clinic.id);
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

      <section aria-labelledby="profile" className="card p-5">
        <h2 id="profile" className="text-lg font-semibold">Clinic profile</h2>
        {/* Prototype: posts back here. The real form calls the team's save action. */}
        <form method="post" action="/clinic?notice=saved" className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Clinic name" id="name" defaultValue={clinic.name} required />
          <Field label="Phone" id="phone" type="tel" defaultValue={clinic.phone} required />
          <Field label="Street address" id="address" defaultValue={clinic.address} required />
          <Field label="City" id="city" defaultValue={clinic.city} required />
          <fieldset className="sm:col-span-2">
            <legend className="label">Services</legend>
            <ul className="flex flex-wrap gap-2">
              {clinic.services.map((s) => (
                <li key={s} className="tag gap-1 pr-1">
                  {s}
                  <button type="button" aria-label={`Remove ${s}`} className="grid size-7 place-items-center rounded-full hover:bg-avocado-300">
                    <XIcon width={14} height={14} />
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex max-w-md items-end gap-2">
              <div className="flex-1">
                <label htmlFor="newService" className="label">Add a service</label>
                <input id="newService" name="newService" className="input" placeholder="e.g. Pediatrics" />
              </div>
              <button type="button" className="btn btn-secondary"><PlusIcon /> Add</button>
            </div>
          </fieldset>
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
                <td className="py-3 pr-2"><Link href={`/practitioners/${p.id}`} className="link">{p.name}</Link></td>
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
                    action="/clinic?notice=removed"
                    method="post"
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
