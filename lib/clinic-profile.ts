import { z } from "zod";
import { commaList, parse, phone, requiredText, type Parsed } from "./validation";

/** Messages for /clinic?error=. Only these keys are shown, so the URL can't inject text. */
export const clinicProfileErrors = {
  name: "Enter the clinic name.",
  phone: "Enter a valid phone number.",
  address: "Enter the street address.",
  city: "Enter the city.",
  services: "List up to 30 services, each under 100 characters.",
  "no-clinic": "We couldn't find your clinic.",
  "not-on-team": "That practitioner isn't on your team.",
};

const clinicProfile = z.object({
  name: requiredText(200, "name"),
  phone: phone(),
  address: requiredText(200, "address"),
  city: requiredText(100, "city"),
  services: commaList(30, "services"),
});
export type ClinicProfile = z.infer<typeof clinicProfile>;

/** Checks the /clinic profile form. Returns the cleaned values, or which field is wrong. */
export const parseClinicProfile = (form: FormData): Parsed<ClinicProfile, keyof typeof clinicProfileErrors> =>
  parse(clinicProfile, form);
