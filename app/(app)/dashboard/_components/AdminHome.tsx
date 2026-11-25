import Link from "next/link";
import { PageHeader } from "@/components/ui";

export default function AdminHome({ name }: { name: string }) {
  return (
    <>
      <PageHeader title={`Welcome, ${name}`} description="You're signed in as an admin." />
      <section aria-labelledby="admin-tools" className="card p-5">
        <h2 id="admin-tools" className="text-lg font-semibold">Admin tools</h2>
        <ul className="mt-3 space-y-2">
          <li><Link href="/admin" className="link">Users</Link>: change roles and disable accounts</li>
          <li><Link href="/admin/audit" className="link">Audit log</Link>: find who did what, and when</li>
          <li className="text-muted">Verify practitioners (ADM-2) is coming soon</li>
        </ul>
      </section>
    </>
  );
}
