export type PatientDetails = { name: string; dob: string; phone: string };

/** Messages for /settings?error=. Only these keys are shown, so the URL can't inject text. */
export const patientDetailErrors = {
  name: "Enter your full name.",
  dob: "Enter a valid date of birth.",
  phone: "Enter a valid phone number.",
  "no-patient": "We couldn't find your patient record.",
};

/** Checks the /settings form fields. Returns the cleaned values, or which field is wrong. */
export function parsePatientDetails(form: FormData, today = new Date().toISOString().slice(0, 10)):
  | { ok: true; data: PatientDetails }
  | { ok: false; error: keyof typeof patientDetailErrors } {
  const name = String(form.get("name") ?? "").trim();
  const dob = String(form.get("dob") ?? "");
  const phone = String(form.get("phone") ?? "").trim();

  if (!name || name.length > 200) return { ok: false, error: "name" };
  // <input type="date"> sends YYYY-MM-DD; the round-trip rejects impossible dates like 2026-02-31.
  const t = Date.parse(dob);
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(dob) && !Number.isNaN(t) && new Date(t).toISOString().startsWith(dob);
  if (!valid || dob > today || dob < "1900-01-01") return { ok: false, error: "dob" };
  if (!/^\+?[\d\s().-]{7,20}$/.test(phone)) return { ok: false, error: "phone" };

  return { ok: true, data: { name, dob, phone } };
}
