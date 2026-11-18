// Lists of appointments for the dashboards and /appointments (SCH-7 #25).
//
// lib/appointments.ts loads ONE appointment for its detail page. This file loads
// MANY, already narrowed to the ones the viewer is a party to. The narrowing is
// part of the SQL WHERE, so rows the viewer may not see never leave the database.
// It must match involves() in ./appointment-rules (the tests check both agree):
//
//   patient       -> their own appointments
//   practitioner  -> appointments with them
//   staff         -> appointments with any practitioner at their clinic
//   admin         -> none (managing other people's appointments is ADM-1 #32)
//
// Only the columns the cards show are selected. In particular the patient's date
// of birth and phone stay out: those appear only on the detail page, which audits
// who looked.
import { and, asc, eq, gte, inArray, lt, type SQL } from "drizzle-orm";
import type { ReadyViewer } from "./auth";
import { db } from "./db";
import { APPOINTMENT_STATUSES, appointments, clinics, patients, practitioners } from "./db/schema";

type Status = (typeof APPOINTMENT_STATUSES)[number];

export type ListOptions = {
  /** Only appointments starting at or after this time. */
  from?: Date;
  /** Only appointments starting before this time. */
  to?: Date;
  /** Only these statuses. */
  statuses?: Status[];
  /**
   * Staff only: narrow to one practitioner at their clinic. Ignored for other
   * roles. It can only narrow: the clinic check still applies, so a practitioner
   * id from another clinic gives an empty list, not that clinic's appointments.
   */
  practitionerId?: string;
};

/** The SQL condition for "appointments this viewer is a party to". null for admins. */
function partyTo(viewer: ReadyViewer, practitionerId?: string): SQL | null {
  switch (viewer.role) {
    case "patient":
      return eq(appointments.patientId, viewer.patientId);
    case "practitioner":
      return eq(appointments.practitionerId, viewer.practitionerId);
    case "staff": {
      const clinic = eq(practitioners.clinicId, viewer.clinicId);
      return practitionerId ? and(clinic, eq(appointments.practitionerId, practitionerId))! : clinic;
    }
    case "admin":
      return null;
  }
}

/** The viewer's appointments, earliest first, with the names and places the cards show. */
export async function listAppointmentsFor(viewer: ReadyViewer, options: ListOptions = {}) {
  const party = partyTo(viewer, options.practitionerId);
  if (!party) return [];
  // An empty status list means "none of them", not "any".
  if (options.statuses && options.statuses.length === 0) return [];

  return db
    .select({
      appointment: appointments,
      practitioner: {
        id: practitioners.id,
        name: practitioners.name,
        specialty: practitioners.specialty,
        city: practitioners.city,
        clinicId: practitioners.clinicId,
        timeZone: practitioners.timeZone,
      },
      clinic: { name: clinics.name, city: clinics.city },
      patient: { id: patients.id, name: patients.name },
    })
    .from(appointments)
    .innerJoin(practitioners, eq(practitioners.id, appointments.practitionerId))
    .innerJoin(patients, eq(patients.id, appointments.patientId))
    .leftJoin(clinics, eq(clinics.id, practitioners.clinicId))
    .where(
      and(
        party,
        options.from && gte(appointments.startsAt, options.from),
        options.to && lt(appointments.startsAt, options.to),
        options.statuses && inArray(appointments.status, options.statuses),
      ),
    )
    // id breaks ties so two appointments at the same time keep a stable order.
    .orderBy(asc(appointments.startsAt), asc(appointments.id));
}

/** The practitioners at a clinic, by name: the staff filter and the staff dashboard's columns. */
export function practitionersAt(clinicId: string) {
  return db
    .select({ id: practitioners.id, name: practitioners.name, specialty: practitioners.specialty, timeZone: practitioners.timeZone })
    .from(practitioners)
    .where(eq(practitioners.clinicId, clinicId))
    .orderBy(asc(practitioners.name), asc(practitioners.id));
}

/** One row of listAppointmentsFor. The card and the list pages take this shape. */
export type ListedAppointment = Awaited<ReturnType<typeof listAppointmentsFor>>[number];
