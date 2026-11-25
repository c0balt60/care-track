import { ConfirmDialog } from "@/components/confirm-dialog";
import { Notice, noticeText, PageHeader, param } from "@/components/ui";
import { adminErrors, listUsers } from "@/lib/admin-users";
import { requireRole } from "@/lib/auth";
import { USER_ROLES } from "@/lib/db/schema";
import { disableAccount, enableAccount, setRole } from "./actions";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default async function Admin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const admin = await requireRole("admin");
  const sp = await searchParams;
  const q = param(sp.q) ?? "";
  const rows = await listUsers(q);

  const notice = noticeText(
    { role: "Role updated.", disabled: "Account disabled.", enabled: "Account enabled." },
    param(sp.notice),
  );
  const error = noticeText(adminErrors, param(sp.error));

  return (
    <>
      <PageHeader title="Users" description="Change roles and disable accounts. Every change is recorded in the audit log." />
      {notice && <Notice>{notice}</Notice>}
      {error && <Notice>{error}</Notice>}

      <form method="get" action="/admin" role="search" className="mb-4 flex gap-2">
        <label htmlFor="q" className="sr-only">Search users</label>
        <input id="q" name="q" defaultValue={q} placeholder="Search by name or email" className="input max-w-sm" />
        <button className="btn">Search</button>
      </form>

      <section aria-label="Users" className="card p-5">
        {rows.length === 0 && <p className="text-muted">No users found.</p>}
        <ul className="divide-y divide-line">
          {rows.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-48 flex-1">
                <p className="font-medium">
                  {u.name}
                  {u.id === admin.userId && <span className="text-muted"> (you)</span>}
                </p>
                <p className="text-sm text-muted">{u.email}</p>
              </div>
              <span className="w-28">{cap(u.role)}</span>
              <span className="w-24 text-muted">{u.disabledAt ? "Disabled" : "Active"}</span>
              <span className="text-sm text-muted">{u.createdAt.toISOString().slice(0, 10)}</span>

              {/* You can't change your own account (the server refuses too). */}
              {u.id !== admin.userId && (
                <div className="flex gap-2">
                  <ConfirmDialog
                    id={`role-${u.id}`}
                    trigger="Change role"
                    title={`Change role for ${u.name}`}
                    text="This changes what they can open. It doesn't create a patient or practitioner profile."
                    confirm="Change role"
                    cancel="Cancel"
                    action={setRole}
                  >
                    <input type="hidden" name="userId" value={u.id} />
                    <div>
                      <label htmlFor={`role-${u.id}-select`} className="label">Role</label>
                      <select id={`role-${u.id}-select`} name="role" defaultValue={u.role} className="input">
                        {USER_ROLES.map((r) => <option key={r} value={r}>{cap(r)}</option>)}
                      </select>
                    </div>
                  </ConfirmDialog>

                  {u.disabledAt ? (
                    <ConfirmDialog
                      id={`enable-${u.id}`}
                      trigger="Enable"
                      title={`Enable ${u.name}?`}
                      text="They'll be able to sign in again."
                      confirm="Enable"
                      cancel="Cancel"
                      action={enableAccount}
                    >
                      <input type="hidden" name="userId" value={u.id} />
                    </ConfirmDialog>
                  ) : (
                    <ConfirmDialog
                      id={`disable-${u.id}`}
                      trigger="Disable"
                      title={`Disable ${u.name}?`}
                      text="They'll be signed out right away and can't sign in until you enable the account again."
                      confirm="Disable"
                      cancel="Cancel"
                      danger
                      action={disableAccount}
                    >
                      <input type="hidden" name="userId" value={u.id} />
                    </ConfirmDialog>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}