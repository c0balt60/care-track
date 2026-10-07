import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon, CalendarIcon, ClockIcon, InfoIcon, MapPinIcon } from "@/components/icons";
import { EmptyState, PageHeader, param } from "@/components/ui";
import { formatWhen } from "@/lib/dates";
import { getAppointment, getClinic, getPractitioner, getSlot, getViewer } from "@/lib/mock-data";
import PatientPicker from "./_components/PatientPicker";

export default async function Book({ params, searchParams }: PageProps<"/book/[slotId]">) {
  const viewer = await getViewer();
  const { slotId } = await params;
  const sp = await searchParams;
  if (!viewer) return null;

  const p = getPractitioner(slotId.split("_")[0]);
  if (!p || viewer.role === "practitioner") notFound();

  const tz = p.timeZone;
  const slot = getSlot(slotId);
  const old = viewer.role === "patient" ? getAppointment(param(sp.reschedule) ?? "") : undefined;
  const back = `/practitioners/${p.id}${old ? `?reschedule=${old.id}` : ""}`;
  const backLink = (
    <Link href={back} className="link mb-4 inline-flex min-h-11 items-center gap-1 text-sm">
      <ArrowLeftIcon width={16} height={16} /> Back to {p.name}
    </Link>
  );

  if (!slot) {
    return (
      <div className="mx-auto max-w-xl">
        {backLink}
        <EmptyState
          icon={<ClockIcon />}
          title="Someone just booked this time"
          text="Pick another time. Openings update as people book."
          action={<Link href={back} className="btn btn-primary">See other times</Link>}
        />
      </div>
    );
  }

  const staff = viewer.role === "staff";
  const approval = p.bookingMode === "approval";
  const clinic = getClinic(p.clinicId);

  return (
    <div className="mx-auto max-w-xl">
      {backLink}
      <PageHeader title={old ? "Confirm your new time" : staff ? "Book for a patient" : "Confirm your appointment"} />

      <div className="card space-y-1 p-4 sm:p-5">
        {old && (
          <p className="text-muted">
            <del>{formatWhen(old.start, tz)}</del>
            <span className="sr-only"> moves to</span>
          </p>
        )}
        <p className="flex items-center gap-2 text-lg font-semibold">
          <CalendarIcon className="text-accent" />
          <time dateTime={slot.start.toISOString()}>{formatWhen(slot.start, tz)}</time>
        </p>
        <p className="text-muted">{p.slotMinutes} min · {p.name}, {p.specialty}</p>
        <p className="flex items-center gap-1 text-muted">
          <MapPinIcon width={16} height={16} />
          {clinic ? `${clinic.name}, ${clinic.address}, ${clinic.city}` : p.city}
        </p>
      </div>

      {staff && <PatientPicker q={param(sp.q)} />}

      {/* Prototype: a GET form that "creates" a fake appointment. The real form posts to the team's booking action. */}
      <form id="book" action={`/appointments/new_${slotId}`} className="mt-6 space-y-4">
        {old && <input type="hidden" name="from" value={old.id} />}
        {viewer.role === "patient" && (
          <p className="text-sm text-muted">
            Booking as {viewer.name}. Your date of birth and phone come from your{" "}
            <Link href="/settings" className="link">account</Link>.
          </p>
        )}
        <div>
          <label htmlFor="reason" className="label">Reason for visit</label>
          <textarea id="reason" name="reason" rows={3} required defaultValue={old?.reason} className="input" aria-describedby="mode" />
        </div>
        <p id="mode" className="flex items-start gap-2 text-sm text-muted">
          <InfoIcon className="mt-px shrink-0" width={18} height={18} />
          {!approval ? "This time is confirmed right away."
            : old ? `${p.name} reviews requests first. You keep your current time until the new one is accepted.`
            : `${p.name} reviews requests before confirming.`}
        </p>
        <button className="btn btn-primary w-full">
          {old ? "Confirm new time" : staff ? "Book" : approval ? "Request appointment" : "Book appointment"}
        </button>
      </form>
    </div>
  );
}
