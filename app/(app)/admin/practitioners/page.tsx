import Link from "next/link";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Notice, noticeText, PageHeader, param } from "@/components/ui";
import { listPractitionersForAdmin, practitionerAdminErrors } from "@/lib/admin-practitioners";
import { requireRole } from "@/lib/auth";
import { unverifyPractitioner, verifyPractitioner } from "./actions";

const pill = "inline-flex rounded-full px-2.5 py-0.5 text-sm font-medium";

export default async function AdminPractitioners({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("admin");
  const sp = await searchParams;
  const rows = await listPractitionersForAdmin();

  const notice = noticeText(
    { verified: "Practitioner verified. They now show up in search.", unverified: "Practitioner unverified. They no longer show up in search." },
    param(sp.notice),
  );
  const error = noticeText(practitionerAdminErrors, param(sp.error));

  return (
    <>
      <PageHeader
        title="Practitioners"
        description={
          <>
            Only verified practitioners show up in search, on the home page and on clinic pages. Every change is recorded
            in the <Link href="/admin/audit?entity=practitioners" className="link">audit log</Link>.
          </>
        }
      />
      {notice && <Notice>{notice}</Notice>}
      {error && <Notice>{error}</Notice>}

      <section aria-label="Practitioners" className="card p-5">
        {rows.length === 0 && <p className="text-muted">No practitioners yet.</p>}
        <ul className="divide-y divide-line">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-48 flex-1">
                <p className="font-medium">
                  {p.name}, {p.credentials}
                </p>
                <p className="text-sm text-muted">
                  {p.specialty} · {p.clinicName ?? "Solo practice"} · {p.city}
                  {!p.hasAccount && " · No account yet"}
                </p>
              </div>
              {p.verifiedAt ? (
                <span className={`${pill} bg-green-50 text-green-800`}>Verified</span>
              ) : (
                <span className={`${pill} bg-amber-50 text-amber-800`}>Unverified</span>
              )}

              <div className="flex gap-2">
                <Link href={`/practitioners/${p.id}`} className="btn btn-secondary">View profile</Link>
                {p.verifiedAt ? (
                  <ConfirmDialog
                    id={`unverify-${p.id}`}
                    trigger="Unverify"
                    title={`Unverify ${p.name}?`}
                    text="They'll drop out of search, the home page and clinic pages. Booked appointments stay booked."
                    confirm="Unverify"
                    cancel="Cancel"
                    danger
                    action={unverifyPractitioner}
                    hidden={{ practitionerId: p.id }}
                  />
                ) : (
                  <ConfirmDialog
                    id={`verify-${p.id}`}
                    trigger="Verify"
                    title={`Verify ${p.name}?`}
                    text="Check their credentials first. Once verified, patients can find them in search."
                    confirm="Verify"
                    cancel="Cancel"
                    action={verifyPractitioner}
                    hidden={{ practitionerId: p.id }}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
