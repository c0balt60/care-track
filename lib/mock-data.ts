// PROTOTYPE DATA. Every function here stands in for an API call the team will
// write. Shapes follow "What the screens need from the API" in
// docs/frontend-outline.md. Dates are relative to today so the screens never go stale.
import { cookies } from "next/headers";
import { addDays, dayKey, type DayKey, toMinutes, weekday, zoned } from "./dates";

export type Role = "patient" | "practitioner" | "staff";
export type Status = "pending" | "confirmed" | "declined" | "cancelled" | "completed";
type Hours = [from: string, to: string][];

export type Clinic = {
  id: string;
  name: string;
  address: string;
  city: string;
  phone: string;
  services: string[];
  timeZone: string;
};

export type Practitioner = {
  id: string;
  name: string;
  credentials: string;
  specialty: string;
  services: string[];
  bio: string;
  clinicId: string | null;
  city: string;
  bookingMode: "instant" | "approval";
  timeZone: string;
  slotMinutes: number;
  /** Weekly hours, 0 = Sunday */
  hours: Partial<Record<number, Hours>>;
  /** `day` is days from today. Empty `hours` means closed. */
  exceptions: { day: number; hours: Hours; note: string }[];
};

export type Patient = { id: string; name: string; dob: string; phone: string; hasAccount: boolean };

export type Slot = { id: string; practitionerId: string; start: Date; end: Date };

export type Appointment = {
  id: string;
  practitionerId: string;
  patientId: string;
  start: Date;
  end: Date;
  status: Status;
  reason: string;
  bookedBy: "patient" | "staff";
  cancelledBy?: Role;
  cancelReason?: string;
  declineNote?: string;
  history: { label: string; at: Date }[];
};

export type Viewer =
  | { role: "patient"; name: string; patientId: string }
  | { role: "practitioner"; name: string; practitionerId: string }
  | { role: "staff"; name: string; clinicId: string };

const TZ = "America/New_York";

export const clinics: Clinic[] = [
  {
    id: "northside",
    name: "Northside Clinic",
    address: "212 River St",
    city: "Troy, NY",
    phone: "(518) 555-0142",
    services: ["Dermatology", "Family medicine", "Physical therapy"],
    timeZone: TZ,
  },
];

const weekdays = (hours: Hours) => ({ 1: hours, 2: hours, 3: hours, 4: hours, 5: hours });

export const practitioners: Practitioner[] = [
  {
    id: "rivera",
    name: "Dr. Sam Rivera",
    credentials: "MD",
    specialty: "Dermatology",
    services: ["Skin checks", "Acne", "Rashes and eczema", "Mole removal"],
    bio: "Board-certified dermatologist with 12 years of practice. Sees adults and teens for everyday skin concerns and yearly skin checks.",
    clinicId: "northside",
    city: "Troy, NY",
    bookingMode: "approval",
    timeZone: TZ,
    slotMinutes: 30,
    hours: { 1: [["09:00", "12:00"], ["13:00", "17:00"]], 2: [["09:00", "17:00"]], 4: [["09:00", "17:00"]], 5: [["09:00", "13:00"]] },
    exceptions: [
      { day: 8, hours: [], note: "Conference" },
      { day: 12, hours: [["10:00", "14:00"]], note: "Short day" },
    ],
  },
  {
    id: "kim",
    name: "Dr. Jo Kim",
    credentials: "DO",
    specialty: "Family medicine",
    services: ["Annual physicals", "Sick visits", "Vaccines", "Chronic care"],
    bio: "Family doctor for all ages. Same-week sick visits are usually available.",
    clinicId: "northside",
    city: "Troy, NY",
    bookingMode: "instant",
    timeZone: TZ,
    slotMinutes: 20,
    hours: weekdays([["08:00", "12:00"], ["13:00", "16:00"]]),
    exceptions: [],
  },
  {
    id: "patel",
    name: "Priya Patel",
    credentials: "DPT",
    specialty: "Physical therapy",
    services: ["Back and neck pain", "Sports injuries", "Post-surgery rehab"],
    bio: "Physical therapist focused on getting runners and weekend athletes back to what they love.",
    clinicId: "northside",
    city: "Troy, NY",
    bookingMode: "instant",
    timeZone: TZ,
    slotMinutes: 45,
    hours: { 1: [["10:00", "18:00"]], 3: [["10:00", "18:00"]], 5: [["10:00", "18:00"]] },
    exceptions: [],
  },
  {
    id: "okafor",
    name: "Dr. Ava Okafor",
    credentials: "MD",
    specialty: "Orthopedics",
    services: ["Knee and hip pain", "Fractures", "Joint injections"],
    bio: "Orthopedic surgeon in solo practice. Reviews each request to make sure a visit is the right next step.",
    clinicId: null,
    city: "Albany, NY",
    bookingMode: "approval",
    timeZone: TZ,
    slotMinutes: 30,
    hours: { 2: [["09:00", "15:00"]], 3: [["09:00", "15:00"]], 4: [["09:00", "15:00"]] },
    exceptions: [],
  },
  {
    id: "nguyen",
    name: "Dr. Minh Nguyen",
    credentials: "MD",
    specialty: "Pediatrics",
    services: ["Well-child visits", "Sick visits", "Vaccines"],
    bio: "Pediatrician for newborns through age 18. Saturday mornings available.",
    clinicId: null,
    city: "Cohoes, NY",
    bookingMode: "instant",
    timeZone: TZ,
    slotMinutes: 30,
    hours: { ...weekdays([["08:00", "12:00"]]), 6: [["08:00", "12:00"]] },
    exceptions: [],
  },
];

/** Suggestions for the service search box */
export const services = [...new Set(practitioners.flatMap((p) => [p.specialty, ...p.services]))].sort();

export const patients: Patient[] = [
  { id: "jordan", name: "Jordan Lee", dob: "1990-04-12", phone: "(518) 555-0110", hasAccount: true },
  { id: "jamie", name: "Jamie Doe", dob: "1985-09-30", phone: "(518) 555-0123", hasAccount: true },
  { id: "alex", name: "Alex Smith", dob: "1978-01-17", phone: "(518) 555-0187", hasAccount: true },
  { id: "bo", name: "Bo Chen", dob: "2001-06-05", phone: "(518) 555-0164", hasAccount: true },
  { id: "carmen", name: "Carmen Diaz", dob: "1995-11-21", phone: "(518) 555-0139", hasAccount: true },
  { id: "riley", name: "Riley Brooks", dob: "1962-03-08", phone: "(518) 555-0171", hasAccount: false },
];

/** Practitioners invited to a clinic who haven't joined yet. */
export const invites = [{ clinicId: "northside", name: "Dr. Lena Ortiz", email: "lena.ortiz@example.com" }];

// [id, practitioner, patient, days from today, time, status, reason, extra]
const fixtures: [string, string, string, number, string, Status, string, Partial<Appointment>?][] = [
  ["a1", "rivera", "jordan", 2, "10:30", "confirmed", "Rash that keeps coming back"],
  ["a2", "okafor", "jordan", 9, "09:00", "pending", "Knee pain when running"],
  ["a3", "kim", "jordan", 15, "08:40", "confirmed", "Annual physical"],
  ["a4", "kim", "jordan", -20, "09:00", "completed", "Sore throat"],
  ["a5", "patel", "jordan", -5, "10:45", "cancelled", "Lower back pain", { cancelledBy: "staff", cancelReason: "Priya is out sick that day. Sorry!" }],
  ["a6", "okafor", "jordan", -12, "13:00", "declined", "Shoulder pain", { declineNote: "Please see your primary care doctor first for a referral." }],
  ["a7", "rivera", "jamie", 0, "09:00", "confirmed", "Follow-up"],
  ["a8", "rivera", "alex", 0, "10:00", "confirmed", "New patient visit"],
  ["a9", "rivera", "bo", 0, "14:00", "confirmed", "Mole check", { bookedBy: "staff" }],
  ["a10", "rivera", "jamie", 2, "09:30", "pending", "Rash on my arm"],
  ["a11", "rivera", "carmen", 3, "14:00", "pending", "Acne follow-up"],
  ["a12", "rivera", "riley", -3, "11:00", "completed", "Skin check", { bookedBy: "staff" }],
  ["a13", "rivera", "carmen", -1, "15:00", "cancelled", "Itchy scalp", { cancelledBy: "patient" }],
  ["a14", "kim", "bo", 0, "09:20", "confirmed", "Flu symptoms"],
  ["a15", "kim", "carmen", 0, "10:00", "confirmed", "Blood pressure check"],
  ["a16", "kim", "riley", 1, "08:00", "confirmed", "Flu shot", { bookedBy: "staff" }],
  ["a17", "patel", "alex", 0, "11:30", "confirmed", "Knee rehab"],
];

const DAY = 24 * 60 * 60 * 1000;

function history(a: Appointment, p: Practitioner): Appointment["history"] {
  const booked = new Date(Math.min(a.start.getTime() - 6 * DAY, Date.now() - DAY));
  const h = [{ label: a.bookedBy === "staff" ? "Booked by front desk" : "Booked", at: booked }];
  if (p.bookingMode === "approval" && (a.status === "confirmed" || a.status === "completed")) h.push({ label: "Confirmed", at: booked });
  if (a.status === "declined") h.push({ label: "Declined", at: new Date(booked.getTime() + DAY) });
  if (a.status === "cancelled") h.push({ label: "Cancelled", at: new Date(booked.getTime() + DAY) });
  return h;
}

export function appointments(): Appointment[] {
  return fixtures.map(([id, practitionerId, patientId, days, time, status, reason, extra]) => {
    const p = getPractitioner(practitionerId)!;
    const start = zoned(addDays(today(p.timeZone), days), toMinutes(time), p.timeZone);
    const a: Appointment = {
      id, practitionerId, patientId, status, reason, bookedBy: "patient", history: [], ...extra,
      start,
      end: new Date(start.getTime() + p.slotMinutes * 60_000),
    };
    a.history = history(a, p);
    return a;
  });
}

export const today = (timeZone = TZ): DayKey => dayKey(new Date(), timeZone);
export const getPractitioner = (id: string) => practitioners.find((p) => p.id === id);
export const getClinic = (id: string | null) => clinics.find((c) => c.id === id);
/** Falls back to a placeholder for patients the front desk just created in the prototype. */
export const getPatient = (id: string): Patient =>
  patients.find((p) => p.id === id) ?? { id, name: "New patient", dob: "", phone: "", hasAccount: false };
export const getAppointment = (id: string) => appointments().find((a) => a.id === id);

/** How far ahead patients can book. Open question 4 in the outline. */
export const BOOKING_WINDOW_DAYS = 28;

/** Open slots from now to the end of the booking window. */
export function slotsFor(p: Practitioner): Slot[] {
  const start = today(p.timeZone);
  const taken = new Set(
    appointments()
      .filter((a) => a.practitionerId === p.id && (a.status === "confirmed" || a.status === "pending"))
      .map((a) => a.start.getTime()),
  );
  const slots: Slot[] = [];
  for (let i = 0; i < BOOKING_WINDOW_DAYS; i++) {
    const day = addDays(start, i);
    const ranges = p.exceptions.find((e) => e.day === i)?.hours ?? p.hours[weekday(day)] ?? [];
    for (const [from, to] of ranges) {
      for (let m = toMinutes(from); m + p.slotMinutes <= toMinutes(to); m += p.slotMinutes) {
        const t = zoned(day, m, p.timeZone);
        if (t.getTime() > Date.now() && !taken.has(t.getTime())) {
          slots.push({ id: `${p.id}_${t.getTime()}`, practitionerId: p.id, start: t, end: new Date(t.getTime() + p.slotMinutes * 60_000) });
        }
      }
    }
  }
  return slots;
}

/** undefined when the slot doesn't exist or someone already booked it. */
export function getSlot(id: string) {
  const p = getPractitioner(id.split("_")[0]);
  return p && slotsFor(p).find((s) => s.id === id);
}

/** Booked appointments and open slots for one practitioner on one day, in time order. */
export function agendaFor(p: Practitioner, day: DayKey): { start: Date; appointment?: Appointment; slot?: Slot }[] {
  const booked = appointments()
    .filter((a) => a.practitionerId === p.id && a.status === "confirmed" && dayKey(a.start, p.timeZone) === day)
    .map((a) => ({ start: a.start, appointment: a }));
  const open = slotsFor(p)
    .filter((s) => dayKey(s.start, p.timeZone) === day)
    .map((s) => ({ start: s.start, slot: s }));
  return [...booked, ...open].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Hasn't ended yet. */
export const isUpcoming = (a: Appointment) => a.end.getTime() > Date.now();

/** Whether the viewer may see this appointment. The real app checks this on the server. */
export const involves = (viewer: Viewer, a: Appointment) =>
  viewer.role === "patient" ? a.patientId === viewer.patientId
  : viewer.role === "practitioner" ? a.practitionerId === viewer.practitionerId
  : getPractitioner(a.practitionerId)?.clinicId === viewer.clinicId;

export const appointmentsFor = (viewer: Viewer) => appointments().filter((a) => involves(viewer, a));

/**
 * The appointment that "Book" would create. The real app creates it in the
 * database; the prototype rebuilds it from the URL.
 */
export function previewBooking(slotId: string, o: { patientId: string; reason: string; bookedBy: "patient" | "staff" }) {
  const slot = getSlot(slotId);
  const p = slot && getPractitioner(slot.practitionerId);
  if (!slot || !p) return undefined;
  const a: Appointment = {
    id: `new_${slotId}`,
    practitionerId: p.id,
    patientId: o.patientId,
    start: slot.start,
    end: slot.end,
    status: p.bookingMode === "instant" ? "confirmed" : "pending",
    reason: o.reason,
    bookedBy: o.bookedBy,
    history: [{ label: o.bookedBy === "staff" ? "Booked by front desk" : "Booked", at: new Date() }],
  };
  return a;
}

const viewers: Record<Role, Viewer> = {
  patient: { role: "patient", name: "Jordan Lee", patientId: "jordan" },
  practitioner: { role: "practitioner", name: "Dr. Sam Rivera", practitionerId: "rivera" },
  staff: { role: "staff", name: "Morgan Ellis", clinicId: "northside" },
};

/**
 * Who is "signed in". Set by the prototype bar's role switcher; null means
 * signed out. The real app reads the session here instead.
 */
export async function getViewer(): Promise<Viewer | null> {
  const role = (await cookies()).get("preview-role")?.value ?? "patient";
  return Object.hasOwn(viewers, role) ? viewers[role as Role] : null;
}
