import { describe, expect, it } from "vitest";
import type { ReadyViewer } from "./auth";
import { allowedActions, can, cancelReasonRequired, involves, type RulesAppointment } from "./appointment-rules";

const NOW = new Date("2030-01-07T12:00:00Z");
const TOMORROW = new Date("2030-01-08T12:00:00Z");
const account = { userId: "u", name: "n", email: "e@test" };

const patient: ReadyViewer = { ...account, role: "patient", patientId: "pat-1" };
const otherPatient: ReadyViewer = { ...account, role: "patient", patientId: "pat-2" };
const practitioner: ReadyViewer = { ...account, role: "practitioner", practitionerId: "prac-1" };
const otherPractitioner: ReadyViewer = { ...account, role: "practitioner", practitionerId: "prac-2" };
const staff: ReadyViewer = { ...account, role: "staff", clinicId: "clinic-1" };
const otherStaff: ReadyViewer = { ...account, role: "staff", clinicId: "clinic-2" };
const admin: ReadyViewer = { ...account, role: "admin" };

const appt = (over: Partial<RulesAppointment> = {}): RulesAppointment => ({
  status: "confirmed",
  startsAt: TOMORROW,
  patientId: "pat-1",
  practitionerId: "prac-1",
  clinicId: "clinic-1",
  ...over,
});

describe("involves", () => {
  it("lets in the patient, the practitioner, and staff at the practitioner's clinic", () => {
    expect(involves(patient, appt())).toBe(true);
    expect(involves(practitioner, appt())).toBe(true);
    expect(involves(staff, appt())).toBe(true);
  });

  it("keeps out everyone else", () => {
    expect(involves(otherPatient, appt())).toBe(false);
    expect(involves(otherPractitioner, appt())).toBe(false);
    expect(involves(otherStaff, appt())).toBe(false);
    expect(involves(admin, appt())).toBe(false);
  });

  it("keeps out all staff when the practitioner has no clinic", () => {
    expect(involves(staff, appt({ clinicId: null }))).toBe(false);
  });
});

describe("allowedActions", () => {
  describe("pending request", () => {
    const a = appt({ status: "pending" });

    it("the practitioner and their clinic's staff can approve or decline", () => {
      expect(allowedActions(practitioner, a, NOW)).toEqual(["approve", "decline"]);
      expect(allowedActions(staff, a, NOW)).toEqual(["approve", "decline"]);
    });

    it("the patient can only withdraw it", () => {
      expect(allowedActions(patient, a, NOW)).toEqual(["cancel"]);
    });
  });

  describe("confirmed appointment", () => {
    const a = appt({ status: "confirmed" });

    it("the patient can reschedule or cancel", () => {
      expect(allowedActions(patient, a, NOW)).toEqual(["reschedule", "cancel"]);
    });

    it("the practitioner and staff can cancel but not reschedule", () => {
      expect(allowedActions(practitioner, a, NOW)).toEqual(["cancel"]);
      expect(allowedActions(staff, a, NOW)).toEqual(["cancel"]);
    });

    it("can't be approved again", () => {
      expect(can(practitioner, a, "approve", NOW)).toBe(false);
    });
  });

  it.each(["declined", "cancelled", "completed"] as const)("a %s appointment is final", (status) => {
    for (const v of [patient, practitioner, staff]) expect(allowedActions(v, appt({ status }), NOW)).toEqual([]);
  });

  it("nothing is allowed once the appointment has started", () => {
    for (const status of ["pending", "confirmed"] as const) {
      for (const v of [patient, practitioner, staff]) {
        expect(allowedActions(v, appt({ status, startsAt: NOW }), NOW)).toEqual([]);
        expect(allowedActions(v, appt({ status, startsAt: new Date(NOW.getTime() - 60_000) }), NOW)).toEqual([]);
      }
    }
  });

  it("a patient can still cancel a minute before the start (no cutoff yet)", () => {
    const soon = appt({ startsAt: new Date(NOW.getTime() + 60_000) });
    expect(can(patient, soon, "cancel", NOW)).toBe(true);
  });

  it("outsiders get nothing, whatever the status", () => {
    for (const status of ["pending", "confirmed"] as const) {
      for (const v of [otherPatient, otherPractitioner, otherStaff, admin]) {
        expect(allowedActions(v, appt({ status }), NOW)).toEqual([]);
      }
    }
  });
});

describe("cancelReasonRequired", () => {
  it("is required from the clinic side, optional for patients", () => {
    expect(cancelReasonRequired(practitioner)).toBe(true);
    expect(cancelReasonRequired(staff)).toBe(true);
    expect(cancelReasonRequired(patient)).toBe(false);
  });
});
