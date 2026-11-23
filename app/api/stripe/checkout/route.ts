// Where Stripe Checkout sends the patient back to (PAY-1 #29):
//   ?appointment=<id>              after paying (success_url)
//   ?appointment=<id>&cancelled=1  after pressing back on Stripe's page (cancel_url)
//
// The URL proves nothing: anyone can type it. All it does is make us ask Stripe
// about the appointment's Checkout Session (reconcileCheckout in lib/payments.ts),
// and only the patient who booked may trigger that.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { loadAppointmentFor } from "@/lib/appointments";
import { getViewerAs } from "@/lib/auth";
import { slotIdFor } from "@/lib/booking";
import { reconcileCheckout } from "@/lib/payments";

export async function GET(request: NextRequest) {
  const { searchParams, pathname, search } = request.nextUrl;
  const viewer = await getViewerAs("patient");
  if (!viewer) redirect(`/login?next=${encodeURIComponent(pathname + search)}`);

  // Null unless it exists and is this patient's own appointment (it also checks the id's format).
  const found = await loadAppointmentFor(viewer, searchParams.get("appointment") ?? "");
  if (!found) redirect("/appointments");
  const { appointment, practitioner } = found;

  const status = await reconcileCheckout(appointment.id, { release: searchParams.has("cancelled") });
  revalidatePath("/appointments");
  revalidatePath("/dashboard");

  // Back to the booking page, which shows the result or lets them try again.
  const book = `/book/${encodeURIComponent(slotIdFor(practitioner.id, appointment.startsAt))}`;
  if (status === "confirmed") redirect(`${book}?notice=booked`);
  if (status === "pending") redirect(`${book}?notice=requested`);
  if (status === null) redirect(`${book}?error=payment_cancelled`);
  // Still unpaid (Stripe hasn't finished), or changed since: its own page has the latest.
  redirect(`/appointments/${appointment.id}`);
}
