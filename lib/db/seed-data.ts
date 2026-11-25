// FAKE DATA for local development, read only by lib/db/seed.ts (`pnpm db:seed`).
// Every name, date of birth and phone number here is made up (555 numbers).
// The app never reads this file at runtime: pages read the database.
//
// Dates are relative to the day you seed, so the dashboards always have something
// today, upcoming and past.
import { addDays, dayKey, toMinutes, zoned } from "../dates";
import type { APPOINTMENT_STATUSES, ROLES } from "./schema";

type Status = (typeof APPOINTMENT_STATUSES)[number];
type Role = (typeof ROLES)[number];
type Hours = [from: string, to: string][];

export type SeedClinic = { slug: string; name: string; address: string; city: string; phone: string; services: string[]; timeZone: string };

export type SeedPractitioner = {
  slug: string;
  name: string;
  credentials: string;
  specialty: string;
  services: string[];
  bio: string;
  clinic: string | null;
  city: string;
  bookingMode: "instant" | "approval";
  timeZone: string;
  slotMinutes: number;
  /** Weekly hours, 0 = Sunday */
  hours: Partial<Record<number, Hours>>;
  /** `day` is days from today. Empty `hours` means closed. */
  exceptions: { day: number; hours: Hours; note: string }[];
};

export type SeedPatient = { slug: string; name: string; dob: string; phone: string };

export type SeedAppointment = {
  practitioner: string;
  patient: string;
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

/** Which fake person each seed login is. */
export const PATIENT_SLUG = "jordan";
export const PRACTITIONER_SLUG = "rivera";
export const STAFF_CLINIC_SLUG = "northside";

const TZ = "America/New_York";

export const clinics: SeedClinic[] = [
  {
    slug: "northside",
    name: "Northside Clinic",
    address: "212 River St",
    city: "Troy, NY",
    phone: "(518) 555-0142",
    services: ["Dermatology", "Family medicine", "Physical therapy"],
    timeZone: TZ,
  },
];

const weekdays = (hours: Hours) => ({ 1: hours, 2: hours, 3: hours, 4: hours, 5: hours });

export const practitioners: SeedPractitioner[] = [
  {
    slug: "rivera",
    name: "Dr. Sam Rivera",
    credentials: "MD",
    specialty: "Dermatology",
    services: ["Skin checks", "Acne", "Rashes and eczema", "Mole removal"],
    bio: "Board-certified dermatologist with 12 years of practice. Sees adults and teens for everyday skin concerns and yearly skin checks.",
    clinic: "northside",
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
    slug: "kim",
    name: "Dr. Jo Kim",
    credentials: "DO",
    specialty: "Family medicine",
    services: ["Annual physicals", "Sick visits", "Vaccines", "Chronic care"],
    bio: "Family doctor for all ages. Same-week sick visits are usually available.",
    clinic: "northside",
    city: "Troy, NY",
    bookingMode: "instant",
    timeZone: TZ,
    slotMinutes: 20,
    hours: weekdays([["08:00", "12:00"], ["13:00", "16:00"]]),
    exceptions: [],
  },
  {
    slug: "patel",
    name: "Priya Patel",
    credentials: "DPT",
    specialty: "Physical therapy",
    services: ["Back and neck pain", "Sports injuries", "Post-surgery rehab"],
    bio: "Physical therapist focused on getting runners and weekend athletes back to what they love.",
    clinic: "northside",
    city: "Troy, NY",
    bookingMode: "instant",
    timeZone: TZ,
    slotMinutes: 45,
    hours: { 1: [["10:00", "18:00"]], 3: [["10:00", "18:00"]], 5: [["10:00", "18:00"]] },
    exceptions: [],
  },
  {
    slug: "okafor",
    name: "Dr. Ava Okafor",
    credentials: "MD",
    specialty: "Orthopedics",
    services: ["Knee and hip pain", "Fractures", "Joint injections"],
    bio: "Orthopedic surgeon in solo practice. Reviews each request to make sure a visit is the right next step.",
    clinic: null,
    city: "Albany, NY",
    bookingMode: "approval",
    timeZone: TZ,
    slotMinutes: 30,
    hours: { 2: [["09:00", "15:00"]], 3: [["09:00", "15:00"]], 4: [["09:00", "15:00"]] },
    exceptions: [],
  },
  {
    slug: "nguyen",
    name: "Dr. Minh Nguyen",
    credentials: "MD",
    specialty: "Pediatrics",
    services: ["Well-child visits", "Sick visits", "Vaccines"],
    bio: "Pediatrician for newborns through age 18. Saturday mornings available.",
    clinic: null,
    city: "Cohoes, NY",
    bookingMode: "instant",
    timeZone: TZ,
    slotMinutes: 30,
    hours: { ...weekdays([["08:00", "12:00"]]), 6: [["08:00", "12:00"]] },
    exceptions: [],
  },
];

export const patients: SeedPatient[] = [
  { slug: "jordan", name: "Jordan Lee", dob: "1990-04-12", phone: "(518) 555-0110" },
  { slug: "jamie", name: "Jamie Doe", dob: "1985-09-30", phone: "(518) 555-0123" },
  { slug: "alex", name: "Alex Smith", dob: "1978-01-17", phone: "(518) 555-0187" },
  { slug: "bo", name: "Bo Chen", dob: "2001-06-05", phone: "(518) 555-0164" },
  { slug: "carmen", name: "Carmen Diaz", dob: "1995-11-21", phone: "(518) 555-0139" },
  { slug: "riley", name: "Riley Brooks", dob: "1962-03-08", phone: "(518) 555-0171" },
];

type Extra = Pick<SeedAppointment, "bookedBy" | "cancelledBy" | "cancelReason" | "declineNote">;

// [practitioner, patient, days from today, time, status, reason, extra]
const fixtures: [string, string, number, string, Status, string, Partial<Extra>?][] = [
  ["rivera", "jordan", 2, "10:30", "confirmed", "Rash that keeps coming back"],
  ["okafor", "jordan", 9, "09:00", "pending", "Knee pain when running"],
  ["kim", "jordan", 15, "08:40", "confirmed", "Annual physical"],
  ["kim", "jordan", -20, "09:00", "completed", "Sore throat"],
  ["patel", "jordan", -5, "10:45", "cancelled", "Lower back pain", { cancelledBy: "staff", cancelReason: "Priya is out sick that day. Sorry!" }],
  ["okafor", "jordan", -12, "13:00", "declined", "Shoulder pain", { declineNote: "Please see your primary care doctor first for a referral." }],
  ["rivera", "jamie", 0, "09:00", "confirmed", "Follow-up"],
  ["rivera", "alex", 0, "10:00", "confirmed", "New patient visit"],
  ["rivera", "bo", 0, "14:00", "confirmed", "Mole check", { bookedBy: "staff" }],
  ["rivera", "jamie", 2, "09:30", "pending", "Rash on my arm"],
  ["rivera", "carmen", 3, "14:00", "pending", "Acne follow-up"],
  ["rivera", "riley", -3, "11:00", "completed", "Skin check", { bookedBy: "staff" }],
  ["rivera", "carmen", -1, "15:00", "cancelled", "Itchy scalp", { cancelledBy: "patient" }],
  ["kim", "bo", 0, "09:20", "confirmed", "Flu symptoms"],
  ["kim", "carmen", 0, "10:00", "confirmed", "Blood pressure check"],
  ["kim", "riley", 1, "08:00", "confirmed", "Flu shot", { bookedBy: "staff" }],
  ["patel", "alex", 0, "11:30", "confirmed", "Knee rehab"],
];

const DAY = 24 * 60 * 60 * 1000;

/** The timeline the appointment detail page shows: booked, then confirmed/declined/cancelled. */
function history(a: SeedAppointment, p: SeedPractitioner, now: Date): SeedAppointment["history"] {
  const booked = new Date(Math.min(a.start.getTime() - 6 * DAY, now.getTime() - DAY));
  const h = [{ label: a.bookedBy === "staff" ? "Booked by front desk" : "Booked", at: booked }];
  if (p.bookingMode === "approval" && (a.status === "confirmed" || a.status === "completed")) h.push({ label: "Confirmed", at: booked });
  if (a.status === "declined") h.push({ label: "Declined", at: new Date(booked.getTime() + DAY) });
  if (a.status === "cancelled") h.push({ label: "Cancelled", at: new Date(booked.getTime() + DAY) });
  return h;
}

/** The fixture appointments, placed relative to `now`. */
export function appointments(now = new Date()): SeedAppointment[] {
  return fixtures.map(([practitioner, patient, days, time, status, reason, extra]) => {
    const p = practitioners.find((x) => x.slug === practitioner)!;
    const start = zoned(addDays(dayKey(now, p.timeZone), days), toMinutes(time), p.timeZone);
    const a: SeedAppointment = {
      practitioner, patient, status, reason, bookedBy: "patient", history: [], ...extra,
      start,
      end: new Date(start.getTime() + p.slotMinutes * 60_000),
    };
    a.history = history(a, p, now);
    return a;
  });
}
