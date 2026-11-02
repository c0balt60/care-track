import { sql } from "drizzle-orm";
import {
    boolean,
    check,
    date, 
    index, 
    integer,
    pgTable,
    primaryKey,
    smallint,
    text, 
    time, 
    timestamp,
    uniqueIndex,
    uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const  createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
    timestamp("updated_at", { withTimezone: true})
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

//Keep these in sync with the types in lib/mock-data.ts
export const ROLES = ["patient", "practitioner", "staff"] as const;
export const USER_ROLES = [...ROLES, "admin"] as const;
export const APPOINTMENT_STATUSES = ["pending", "confirmed", "declined", "cancelled", "completed"] as const;
export const BOOKING_MODES = ["instant", "approval"] as const;
export const BOOKED_BY = ["patient", "staff"] as const;
export const APPOINTMENT_EVENT_TYPES = ["booked", "confirmed", "declined", "cancelled", "completed"] as const;
export const PAYMENT_STATUSES = ["pending", "succeeded", "failed", "refunded"] as const;

/** Builds `col IN ('a', 'b')` for a check constraint. */
const oneOf = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(", ")})`);
 
// ---------- Accounts ----------

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull(),
    // Better Auth fields. Property names must stay camelCase: Better Auth looks them up by key.
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    check("users_role_check", oneOf("role", USER_ROLES)),
  ],
);

// The three tables below belong to Better Auth (lib/better-auth.ts). Column
// names follow its core schema; don't rename properties without checking its docs.

/** One row per signed-in browser. The cookie holds `token`; everything else stays here. */
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("sessions_token_unique").on(t.token), index("sessions_user_idx").on(t.userId)],
);

/**
 * How a user signs in. Email + password is providerId "credential", with the
 * scrypt hash in `password`. OAuth providers would add their own rows.
 */
export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

/** Short-lived tokens for email verification and password resets. */
export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);
 
// ---------- Clinics ----------
 
export const clinics = pgTable("clinics", {
  id: id(),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  phone: text("phone").notNull(),
  services: text("services").array().notNull().default(sql`'{}'::text[]`),
  timeZone: text("time_zone").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
 
export const clinicStaff = pgTable(
  "clinic_staff",
  {
    clinicId: uuid("clinic_id")
      .notNull()
      .references(() => clinics.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.clinicId, t.userId] }), index("clinic_staff_user_idx").on(t.userId)],
);
 
// ---------- People ----------
 
export const practitioners = pgTable(
  "practitioners",
  {
    id: id(),
    /** Null until the practitioner has an account. */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    /** Null for solo practice. */
    clinicId: uuid("clinic_id").references(() => clinics.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    credentials: text("credentials").notNull(),
    specialty: text("specialty").notNull(),
    services: text("services").array().notNull().default(sql`'{}'::text[]`),
    bio: text("bio").notNull().default(""),
    city: text("city").notNull(),
    bookingMode: text("booking_mode", { enum: BOOKING_MODES }).notNull().default("instant"),
    timeZone: text("time_zone").notNull(),
    slotMinutes: integer("slot_minutes").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("practitioners_user_unique").on(t.userId),
    index("practitioners_clinic_idx").on(t.clinicId),
    check("practitioners_booking_mode_check", oneOf("booking_mode", BOOKING_MODES)),
    check("practitioners_slot_minutes_check", sql`${t.slotMinutes} > 0 AND ${t.slotMinutes} <= 480`),
  ],
);
 
export const patients = pgTable(
  "patients",
  {
    id: id(),
    /** Null when the front desk created the patient and they have no account (hasAccount = false). */
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    dob: date("dob"),
    phone: text("phone"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("patients_user_unique").on(t.userId)],
);
 
// ---------- Availability ----------
 
/** Weekly hours. One row per range, so a split day (9–12, 1–5) is two rows. */
export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: id(),
    practitionerId: uuid("practitioner_id")
      .notNull()
      .references(() => practitioners.id, { onDelete: "cascade" }),
    /** 0 = Sunday, matching JS getDay(). */
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("availability_rules_practitioner_idx").on(t.practitionerId, t.weekday),
    check("availability_rules_weekday_check", sql`${t.weekday} BETWEEN 0 AND 6`),
    check("availability_rules_range_check", sql`${t.endTime} > ${t.startTime}`),
  ],
);
 
/**
 * Overrides the weekly hours for one date. A row with no times means closed
 * that day; otherwise each row is one open range, like availability_rules.
 */
export const availabilityExceptions = pgTable(
  "availability_exceptions",
  {
    id: id(),
    practitionerId: uuid("practitioner_id")
      .notNull()
      .references(() => practitioners.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    startTime: time("start_time"),
    endTime: time("end_time"),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("availability_exceptions_practitioner_idx").on(t.practitionerId, t.date),
    check(
      "availability_exceptions_range_check",
      sql`(${t.startTime} IS NULL AND ${t.endTime} IS NULL) OR (${t.startTime} IS NOT NULL AND ${t.endTime} IS NOT NULL AND ${t.endTime} > ${t.startTime})`,
    ),
  ],
);
 
// ---------- Appointments ----------
 
export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    practitionerId: uuid("practitioner_id")
      .notNull()
      .references(() => practitioners.id, { onDelete: "restrict" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "restrict" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: APPOINTMENT_STATUSES }).notNull().default("pending"),
    reason: text("reason").notNull().default(""),
    bookedBy: text("booked_by", { enum: BOOKED_BY }).notNull(),
    cancelledBy: text("cancelled_by", { enum: ROLES }),
    cancelReason: text("cancel_reason"),
    declineNote: text("decline_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("appointments_practitioner_start_idx").on(t.practitionerId, t.startsAt),
    index("appointments_patient_start_idx").on(t.patientId, t.startsAt),
    // One live booking per slot. Declined/cancelled ones free the slot up again.
    uniqueIndex("appointments_active_slot_unique")
      .on(t.practitionerId, t.startsAt)
      .where(sql`status IN ('pending', 'confirmed')`),
    check("appointments_status_check", oneOf("status", APPOINTMENT_STATUSES)),
    check("appointments_booked_by_check", oneOf("booked_by", BOOKED_BY)),
    check("appointments_cancelled_by_check", sql`cancelled_by IS NULL OR ${oneOf("cancelled_by", ROLES)}`),
    check("appointments_time_check", sql`${t.endsAt} > ${t.startsAt}`),
    check(
      "appointments_cancel_fields_check",
      sql`status = 'cancelled' OR (cancelled_by IS NULL AND cancel_reason IS NULL)`,
    ),
    check("appointments_decline_fields_check", sql`status = 'declined' OR decline_note IS NULL`),
  ],
);
 
/** The appointment's history timeline. Append-only. */
export const appointmentEvents = pgTable(
  "appointment_events",
  {
    id: id(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    type: text("type", { enum: APPOINTMENT_EVENT_TYPES }).notNull(),
    /** Null for system events. */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorRole: text("actor_role", { enum: ROLES }),
    note: text("note"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appointment_events_appointment_idx").on(t.appointmentId, t.at),
    check("appointment_events_type_check", oneOf("type", APPOINTMENT_EVENT_TYPES)),
    check("appointment_events_actor_role_check", sql`actor_role IS NULL OR ${oneOf("actor_role", ROLES)}`),
  ],
);
 
// ---------- Payments ----------
 
export const payments = pgTable(
  "payments",
  {
    id: id(),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    status: text("status", { enum: PAYMENT_STATUSES }).notNull().default("pending"),
    provider: text("provider"),
    providerRef: text("provider_ref"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("payments_appointment_idx").on(t.appointmentId),
    uniqueIndex("payments_provider_ref_unique").on(t.provider, t.providerRef),
    check("payments_status_check", oneOf("status", PAYMENT_STATUSES)),
    check("payments_amount_check", sql`${t.amountCents} >= 0`),
    check("payments_currency_check", sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);