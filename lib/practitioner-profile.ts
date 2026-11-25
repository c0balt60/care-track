import { z } from "zod";
import { commaList, optionalText, parse, requiredText, type Parsed } from "./validation";

/** Messages for /settings?error=. Only these keys are shown, so the URL can't inject text. */
export const practitionerProfileErrors = {
  credentials: "Enter your credentials.",
  specialty: "Enter your specialty.",
  services: "List up to 20 services, each under 100 characters.",
  bio: "Keep your bio under 2,000 characters.",
  "no-practitioner": "We couldn't find your practitioner profile.",
};

const practitionerProfile = z.object({
  credentials: requiredText(100, "credentials"),
  specialty: requiredText(100, "specialty"),
  services: commaList(20, "services"),
  bio: optionalText(2000, "bio"),
});
export type PractitionerProfile = z.infer<typeof practitionerProfile>;

/** Checks the /settings public profile fields. Returns the cleaned values, or which field is wrong. */
export const parsePractitionerProfile = (form: FormData): Parsed<PractitionerProfile, keyof typeof practitionerProfileErrors> =>
  parse(practitionerProfile, form);
