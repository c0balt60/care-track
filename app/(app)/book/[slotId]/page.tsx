import Link from "next/link";
import { ArrowLeftIcon, CalendarIcon, ClockIcon, InfoIcon, MapPinIcon } from "@/components/icons";
import { EmptyState, PageHeader, param } from "@/components/ui";
import { formatWhen } from "@/lib/dates";
import { requireRole } from "@/lib/auth";
import { bookingErrors, loadBookableSlot, type BookingError } from "@/lib/booking";
import { bookAppointment } from "./actions";

// Patients book for themselves here. Not yet on real data: staff booking for a
// patient (SCH-6 #24) and rescheduling (SCH-5 #23).
export default async function Book({ params, searchParams }: PageProps<"/book/[slotId]">) {
  const viewer = await requireRole("patient", "staff");
  const { slotId } = await params;
  const sp = await searchParams;
  const notice = param(sp.notice);
  const error = param(sp.error);
  const message = error && Object.hasOwn(bookingErrors, error) ? bookingErrors[error as BookingError] : null;

  // ponytail: practitioner pages are still on mock data (SCH-3 #21), so "back" goes to search.
  const back = "/search";
  const backLink = (
    <Link href={back} className="link mb-4 inline-flex min-h-11 items-center gap-1 text-sm">
      <ArrowLeftIcon width={16} height={16} /> Back to search
    </Link>
  );

  if (notice === "booked" || notice === "requested") {
    return (
      <div className="mx-auto max-w-xl">
        <EmptyState
          icon={<CalendarIcon />}
          title={notice === "booked" ? "You're booked" : "Request sent"}
          text={
            notice === "booked"
              ? "Your appointment is confirmed."
              : "The practitioner reviews requests first. You'll see it confirmed in your appointments once they accept."
          }
          action={<Link href="/appointments" className="btn btn-primary">See my appointments</Link>}
        />
      </div>
    );
  }

  const found = await loadBookableSlot(slotId);
  if (!found || found.taken) {
    return (
      <div className="mx-auto max-w-xl">
        {backLink}
        <EmptyState
          icon={<ClockIcon />}
          title={found?.taken ? "Someone just booked this time" : "This time isn't available"}
          text="Pick another time. Openings update as people book."
          action={<Link href={back} className="btn btn-primary">See other times</Link>}
        />
      </div>
    );
  }

  const { practitioner: p, clinic, slot } = found;
  const tz = p.timeZone;
  const approval = p.bookingMode === "approval";

  return (
    <div className="mx-auto max-w-xl">
      {backLink}
      <PageHeader title={viewer.role === "staff" ? "Book for a patient" : "Confirm your appointment"} />

      <div className="card space-y-1 p-4 sm:p-5">
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

      {message && (
        <p role="alert" className="mt-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {message}
        </p>
      )}

      {viewer.role === "staff" ? (
        <p className="mt-6 flex items-start gap-2 text-sm text-muted">
          <InfoIcon className="mt-px shrink-0 text-blue-700" width={18} height={18} />
          {bookingErrors.staff}
        </p>
      ) : (
        <form action={bookAppointment.bind(null, slotId)} className="mt-6 space-y-4">
          <p className="text-sm text-muted">
            Booking as {viewer.name}. Your date of birth and phone come from your{" "}
            <Link href="/settings" className="link">account</Link>.
          </p>
          <div>
            <label htmlFor="reason" className="label">Reason for visit</label>
            <textarea id="reason" name="reason" rows={3} required maxLength={1000} className="input" aria-describedby="mode" />
          </div>
          <p id="mode" className="flex items-start gap-2 text-sm text-muted">
            <InfoIcon className="mt-px shrink-0 text-blue-700" width={18} height={18} />
            {approval ? `${p.name} reviews requests before confirming.` : "This time is confirmed right away."}
          </p>
          <button className="btn btn-primary w-full">{approval ? "Request appointment" : "Book appointment"}</button>
        </form>
      )}
    </div>
  );
}