"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getViewer, getViewerAs } from "@/lib/auth";
import { bookSlot } from "@/lib/booking";
import { releaseStaleHolds, startCheckout } from "@/lib/payments";

/**
 * Books the slot for the signed-in patient. A new booking first goes through Stripe
 * Checkout for the deposit (PAY-1 #29, see lib/payments.ts): the slot is held, and the
 * patient is sent to Stripe. A reschedule keeps the original deposit and books directly.
 * Bound to the slot id, and to the
 * appointment being moved when rescheduling, by the /book/[slotId] form.
 * bookSlot() checks that appointment belongs to this patient; the id isn't trusted.
 */
export async function bookAppointment(slotId: string, rescheduleFromId: string | null, formData: FormData) {
  const here = `/book/${encodeURIComponent(slotId)}${rescheduleFromId ? `?reschedule=${encodeURIComponent(rescheduleFromId)}` : ""}`;
  const join = rescheduleFromId ? "&" : "?";

  // The patient comes from who is signed in, never from the form.
  const patient = await getViewerAs("patient");
  if (!patient) {
    // Staff booking for a patient is SCH-6 (#24).
    redirect((await getViewer()) ? `${here}${join}error=staff` : `/login?next=${encodeURIComponent(here)}`);
  }

  // Next.js checks a server action's Origin against the host, so this is our own site.
  const origin = (await headers()).get("origin");
  if (!origin) redirect(`${here}${join}error=payment`);

  // A hold abandoned on Stripe's page could still be blocking this slot.
  await releaseStaleHolds();
  const hold = !rescheduleFromId;
  const result = await bookSlot(patient, slotId, formData.get("reason"), new Date(), { rescheduleFromId, hold });
  if (!result.ok) redirect(`${here}${join}error=${result.error}`);

  if (result.status === "awaiting_payment") {
    // Off to Stripe; it sends the patient back to app/api/stripe/checkout/route.ts.
    redirect((await startCheckout(result.appointmentId, origin)) ?? `${here}${join}error=payment`);
  }

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  if (rescheduleFromId) {
    revalidatePath(`/appointments/${rescheduleFromId}`);
    // Land on the new appointment, which links back to the old one.
    redirect(`/appointments/${result.appointmentId}?notice=${result.status === "confirmed" ? "moved" : "move_requested"}`);
  }
  redirect(`${here}?notice=${result.status === "confirmed" ? "booked" : "requested"}`);
}