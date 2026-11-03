import { PageHeader } from "@/components/ui";

/** Placeholder until the admin tools land (ADM-1 to ADM-3). */
export default function AdminHome({ name }: { name: string }) {
  return (
    <>
      <PageHeader title={`Welcome, ${name}`} description="You're signed in as an admin." />
      <section aria-labelledby="admin-soon" className="card p-5">
        <h2 id="admin-soon" className="text-lg font-semibold">Admin tools are coming soon</h2>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-muted">
          <li>Manage users (ADM-1)</li>
          <li>Verify practitioners (ADM-2)</li>
          <li>Audit log (ADM-3)</li>
        </ul>
      </section>
    </>
  );
}
