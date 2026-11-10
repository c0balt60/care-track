"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewer, getViewerAs } from "@/lib/auth";
import { bookSlot } from "@/lib/booking";

/** Books the slot for the signed-in patient. Bound to the slot id by the /book/[slotId] form. */
export async function bookAppointment(slotId: string, formData: FormData) {
  const here = `/book/${encodeURIComponent(slotId)}`;

  // The patient comes from who is signed in, never from the form.
  const patient = await getViewerAs("patient");
  if (!patient) {
    // Staff booking for a patient is SCH-6 (#24).
    redirect((await getViewer()) ? `${here}?error=staff` : `/login?next=${encodeURIComponent(here)}`);
  }

  const result = await bookSlot(patient, slotId, formData.get("reason"));
  if (!result.ok) redirect(`${here}?error=${result.error}`);

  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  redirect(`${here}?notice=${result.status === "confirmed" ? "booked" : "requested"}`);
}