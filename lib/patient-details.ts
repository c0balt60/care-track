import { z } from "zod";
import { dayKey, parse, phone, requiredText, type Parsed } from "./validation";

/** Messages for /settings?error=. Only these keys are shown, so the URL can't inject text. */
export const patientDetailErrors = {
  name: "Enter your full name.",
  dob: "Enter a valid date of birth.",
  phone: "Enter a valid phone number.",
  "no-patient": "We couldn't find your patient record.",
};

/** A date of birth: a real date, not in the future, not before 1900. Also used by sign-up. */
export const dob = (today: string, error = "dob") =>
  dayKey(error).refine((d) => d <= today && d >= "1900-01-01", { error });

const patientDetails = (today: string) =>
  z.object({ name: requiredText(200, "name"), dob: dob(today), phone: phone() });
export type PatientDetails = z.infer<ReturnType<typeof patientDetails>>;

/** Checks the /settings form fields. Returns the cleaned values, or which field is wrong. */
export const parsePatientDetails = (
  form: FormData,
  today = new Date().toISOString().slice(0, 10),
): Parsed<PatientDetails, keyof typeof patientDetailErrors> => parse(patientDetails(today), form);
