"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { audit, type AuditDiff } from "@/lib/audit";
import { getViewerAs } from "@/lib/auth";
import { isDayKey, parseBookingSettings, parseException, parseWeeklyHours } from "@/lib/availability";
import { dayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { availabilityExceptions, availabilityRules, practitioners } from "@/lib/db/schema";

/** Everything that shows slots or availability has to pick up the change. */
function refresh() {
  revalidatePath("/availability");
  revalidatePath("/practitioners/[id]", "page");
  revalidatePath("/clinics/[id]", "page");
  revalidatePath("/book/[slotId]", "page");
  revalidatePath("/search");
  revalidatePath("/");
}

/** "1 09:00-12:00" lines, sorted, so two sets of hours can be compared and logged. */
const describe = (rules: { weekday: number; startTime: string; endTime: string }[]) =>
  rules.map((r) => `${r.weekday} ${r.startTime.slice(0, 5)}-${r.endTime.slice(0, 5)}`).sort();

/** Saves booking mode, slot length and weekly hours from the /availability form. */
export async function saveAvailability(formData: FormData) {
  // Identify the practitioner on the server. Never trust an id sent in the form.
  const viewer = await getViewerAs("practitioner");
  if (!viewer) redirect("/availability?error=no-practitioner");

  const settings = parseBookingSettings(formData);
  if (!settings.ok) redirect(`/availability?error=${settings.error}`);
  const weekly = parseWeeklyHours(formData);
  if (!weekly.ok) redirect(`/availability?error=${weekly.error}`);

  // Hours are replaced as a set, in one transaction with the settings and the audit
  // row, so a failure can't leave half-saved hours.
  const saved = await db.transaction(async (tx) => {
    const [before] = await tx
      .select({ bookingMode: practitioners.bookingMode, slotMinutes: practitioners.slotMinutes })
      .from(practitioners)
      .where(eq(practitioners.id, viewer.practitionerId))
      .limit(1);
    if (!before) return false;

    const oldRules = await tx
      .select({ weekday: availabilityRules.weekday, startTime: availabilityRules.startTime, endTime: availabilityRules.endTime })
      .from(availabilityRules)
      .where(eq(availabilityRules.practitionerId, viewer.practitionerId));

    await tx.delete(availabilityRules).where(eq(availabilityRules.practitionerId, viewer.practitionerId));
    if (weekly.data.length) {
      await tx.insert(availabilityRules).values(weekly.data.map((r) => ({ ...r, practitionerId: viewer.practitionerId })));
    }
    await tx.update(practitioners).set(settings.data).where(eq(practitioners.id, viewer.practitionerId));

    const diff: AuditDiff = {};
    if (before.bookingMode !== settings.data.bookingMode) {
      diff.bookingMode = { from: before.bookingMode, to: settings.data.bookingMode };
    }
    if (before.slotMinutes !== settings.data.slotMinutes) {
      diff.slotMinutes = { from: before.slotMinutes, to: settings.data.slotMinutes };
    }
    const was = describe(oldRules);
    const now = describe(weekly.data);
    if (was.join("|") !== now.join("|")) diff.weeklyHours = { from: was, to: now };

    await audit(
      viewer.userId,
      "practitioner.update_availability",
      "practitioners",
      viewer.practitionerId,
      Object.keys(diff).length ? diff : null,
      tx,
    );
    return true;
  });
  if (!saved) redirect("/availability?error=no-practitioner");

  refresh();
  redirect("/availability?notice=saved");
}

/** Adds an exception for one date. An existing exception on that date is replaced. */
export async function addException(formData: FormData) {
  const viewer = await getViewerAs("practitioner");
  if (!viewer) redirect("/availability?error=no-practitioner");

  const [p] = await db
    .select({ timeZone: practitioners.timeZone })
    .from(practitioners)
    .where(eq(practitioners.id, viewer.practitionerId))
    .limit(1);
  if (!p) redirect("/availability?error=no-practitioner");

  const parsed = parseException(formData, dayKey(new Date(), p.timeZone));
  if (!parsed.ok) redirect(`/availability?error=${parsed.error}`);

  await db.transaction(async (tx) => {
    // One exception per date keeps the list simple and avoids "closed" and "open" rows mixing.
    await tx
      .delete(availabilityExceptions)
      .where(and(eq(availabilityExceptions.practitionerId, viewer.practitionerId), eq(availabilityExceptions.date, parsed.data.date)));
    const [row] = await tx
      .insert(availabilityExceptions)
      .values({ practitionerId: viewer.practitionerId, ...parsed.data })
      .returning({ id: availabilityExceptions.id });

    const hours = parsed.data.startTime ? `${parsed.data.startTime}-${parsed.data.endTime}` : "closed";
    await audit(
      viewer.userId,
      "availability_exception.add",
      "availability_exceptions",
      row.id,
      { date: { from: null, to: parsed.data.date }, hours: { from: null, to: hours } },
      tx,
    );
  });

  refresh();
  redirect("/availability?notice=added");
}

/** Removes the exception on one date, so the weekly hours apply again. */
export async function removeException(formData: FormData) {
  const viewer = await getViewerAs("practitioner");
  if (!viewer) redirect("/availability?error=no-practitioner");

  const date = String(formData.get("date") ?? "");
  if (!isDayKey(date)) redirect("/availability?error=bad-date");

  await db.transaction(async (tx) => {
    // The practitioner id comes from the session, so one practitioner can't delete another's.
    const removed = await tx
      .delete(availabilityExceptions)
      .where(and(eq(availabilityExceptions.practitionerId, viewer.practitionerId), eq(availabilityExceptions.date, date)))
      .returning({ id: availabilityExceptions.id });
    for (const row of removed) {
      await audit(viewer.userId, "availability_exception.remove", "availability_exceptions", row.id, { date: { from: date, to: null } }, tx);
    }
  });

  refresh();
  redirect("/availability?notice=removed");
}