"use server";

// Server actions for the appointment page (SCH-5 #23). Each one is bound to the
// appointment id by the page, e.g. approveAppointment.bind(null, id).
//
// The id comes from the browser, so it's not trusted: lib/appointments.ts loads
// the appointment and checks the signed-in viewer against the rules before
// changing anything. The viewer always comes from the session, never the form.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getViewerAs } from "@/lib/auth";
import { approve, cancel, decline } from "@/lib/appointments";

type Outcome = Awaited<ReturnType<typeof approve>>;

async function viewerOrLogin(id: string) {
  const viewer = await getViewerAs("patient", "practitioner", "staff");
  if (!viewer) redirect(`/login?next=${encodeURIComponent(`/appointments/${id}`)}`);
  return viewer;
}

/** Refreshes every page that lists the appointment, then shows the result on its page. */
function finish(id: string, result: Outcome, notice: string): never {
  const here = `/appointments/${id}`;
  revalidatePath(here);
  revalidatePath("/appointments");
  revalidatePath("/dashboard");
  if (result.ok) redirect(`${here}?notice=${notice}`);
  // not_found: send them back and let the page itself 404, without saying why.
  redirect(result.error === "not_found" ? here : `${here}?error=${result.error}`);
}

export async function approveAppointment(id: string) {
  const viewer = await viewerOrLogin(id);
  finish(id, await approve(viewer, id), "confirmed");
}

export async function declineAppointment(id: string, formData: FormData) {
  const viewer = await viewerOrLogin(id);
  finish(id, await decline(viewer, id, formData.get("note")), "declined");
}

export async function cancelAppointment(id: string, formData: FormData) {
  const viewer = await viewerOrLogin(id);
  // Withdrawing a pending request and cancelling a confirmed one read differently on the page.
  const notice = formData.get("pending") === "1" ? "withdrawn" : "cancelled";
  finish(id, await cancel(viewer, id, formData.get("note")), notice);
}
