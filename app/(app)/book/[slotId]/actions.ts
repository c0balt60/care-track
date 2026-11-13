"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewer, getViewerAs } from "@/lib/auth";
import { bookSlot } from "@/lib/booking";

/**
 * Books the slot for the signed-in patient. Bound to the slot id, and to the
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

  const result = await bookSlot(patient, slotId, formData.get("reason"), new Date(), { rescheduleFromId });
  if (!result.ok) redirect(`${here}${join}error=${result.error}`);

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  if (rescheduleFromId) {
    revalidatePath(`/appointments/${rescheduleFromId}`);
    // Land on the new appointment, which links back to the old one.
    redirect(`/appointments/${result.appointmentId}?notice=${result.status === "confirmed" ? "moved" : "move_requested"}`);
  }
  redirect(`${here}?notice=${result.status === "confirmed" ? "booked" : "requested"}`);
}