import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import {
  type AuditEntry,
  auditEntities,
  diffLines,
  entityLabel,
  filterHref,
  formatStamp,
  listAuditEntries,
  parseAuditFilters,
} from "@/lib/admin-audit";
import { requireRole } from "@/lib/auth";

// Read-only: a GET form and links, no server actions. Every filter is in the URL, so a
// filtered view can be bookmarked or shared with another admin.
export default async function AuditLog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("admin");
  const f = parseAuditFilters(await searchParams);
  const [{ rows, hasMore }, known] = await Promise.all([listAuditEntries(f), auditEntities()]);
  // Keep a filtered entity in the select even if it isn't in the log (yet), so the form shows what's applied.
  const entities = f.entity && !known.includes(f.entity) ? [...known, f.entity] : known;
  const filtered = Boolean(f.actor || f.entity || f.entityId || f.from || f.to);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change, and every time someone opened a patient's details. Newest first. Times are in UTC."
      />

      {/* key: remount when the filters change, so the fields show the ones applied after a link click. */}
      <form key={filterHref(f)} method="get" action="/admin/audit" role="search" aria-label="Filter the audit log" className="card mb-6 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="actor" className="label">Actor</label>
            <input id="actor" name="actor" defaultValue={f.actor} className="input" aria-describedby="actor-hint" />
            <p id="actor-hint" className="mt-1 text-sm text-muted">Name, email, user id, or &ldquo;system&rdquo;</p>
          </div>
          <div>
            <label htmlFor="entity" className="label">Entity</label>
            <select id="entity" name="entity" defaultValue={f.entity} className="input">
              <option value="">All</option>
              {entities.map((e) => <option key={e} value={e}>{entityLabel(e)}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="entityId" className="label">Record id</label>
            <input id="entityId" name="entityId" defaultValue={f.entityId} className="input" />
          </div>
          <div>
            <label htmlFor="from" className="label">From</label>
            <input id="from" name="from" type="date" defaultValue={f.from ?? ""} className="input" />
          </div>
          <div>
            <label htmlFor="to" className="label">To</label>
            <input id="to" name="to" type="date" defaultValue={f.to ?? ""} className="input" />
          </div>
          <div className="flex items-end gap-2">
            <button className="btn btn-primary">Filter</button>
            {filtered && <Link href="/admin/audit" className="btn btn-secondary">Clear</Link>}
          </div>
        </div>
      </form>

      {rows.length ? (
        <section aria-label={f.page > 1 ? `Audit entries, page ${f.page}` : "Audit entries"} className="card p-5">
          <ol className="divide-y divide-line">
            {rows.map((r) => <Entry key={r.id} row={r} />)}
          </ol>
        </section>
      ) : (
        <EmptyState
          title="No matching entries"
          text={f.page > 1 ? "There's nothing on this page." : filtered ? "Try fewer filters or a wider date range." : "Actions show up here as people use the app."}
          action={(filtered || f.page > 1) && <Link href="/admin/audit" className="btn btn-secondary">Show everything</Link>}
        />
      )}

      {(f.page > 1 || hasMore) && (
        <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-2">
          {f.page > 1 ? <Link href={filterHref({ ...f, page: f.page - 1 })} className="btn btn-secondary">Newer</Link> : <span />}
          <span className="text-sm text-muted">Page {f.page}</span>
          {hasMore ? <Link href={filterHref({ ...f, page: f.page + 1 })} className="btn btn-secondary">Older</Link> : <span />}
        </nav>
      )}
    </>
  );
}

function Entry({ row }: { row: AuditEntry }) {
  const lines = diffLines(row.diff);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <code className="font-mono text-sm font-semibold">{row.action}</code>
        <time dateTime={row.at.toISOString()} className="text-sm text-muted">{formatStamp(row.at)}</time>
      </div>
      <p className="mt-1 text-sm">
        By <Actor row={row} />
        {" · "}
        <Link href={filterHref({ entity: row.entity, entityId: row.entityId })} className="link" title="Show this record's history">
          {entityLabel(row.entity)} <code className="font-mono break-all">{row.entityId}</code>
        </Link>
      </p>
      {lines.length > 0 && (
        <ul aria-label="Changes" className="mt-2 space-y-0.5 text-sm text-muted">
          {lines.map((l) => (
            <li key={l.field} className="break-words">
              <span className="font-medium text-ink">{l.field}</span>: {l.from}{" "}
              <span aria-hidden="true">→</span><span className="sr-only">to</span> {l.to}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** Links to everything this actor did. */
function Actor({ row }: { row: AuditEntry }) {
  if (!row.actorId) return <Link href={filterHref({ actor: "system" })} className="link">System</Link>;
  const href = filterHref({ actor: row.actorId });
  // actor_id has no FK, so the user may be gone; the id still finds their other actions.
  if (!row.actor) {
    return (
      <Link href={href} className="link" title={row.actorId}>
        Deleted user <code className="font-mono">{row.actorId.slice(0, 8)}</code>
      </Link>
    );
  }
  return (
    <>
      <Link href={href} className="link">{row.actor.name}</Link> <span className="text-muted">({row.actor.email})</span>
    </>
  );
}
