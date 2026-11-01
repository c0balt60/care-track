export type PractitionerProfile = { credentials: string; specialty: string; services: string[]; bio: string };

/** Messages for /settings?error=. Only these keys are shown, so the URL can't inject text. */
export const practitionerProfileErrors = {
  credentials: "Enter your credentials.",
  specialty: "Enter your specialty.",
  services: "List up to 20 services, each under 100 characters.",
  bio: "Keep your bio under 2,000 characters.",
  "no-practitioner": "We couldn't find your practitioner profile.",
};

/** Checks the /settings public profile fields. Returns the cleaned values, or which field is wrong. */
export function parsePractitionerProfile(form: FormData):
  | { ok: true; data: PractitionerProfile }
  | { ok: false; error: keyof typeof practitionerProfileErrors } {
  const credentials = String(form.get("credentials") ?? "").trim();
  const specialty = String(form.get("specialty") ?? "").trim();
  const services = [...new Set(String(form.get("services") ?? "").split(",").map((s) => s.trim()).filter(Boolean))];
  const bio = String(form.get("bio") ?? "").trim();

  if (!credentials || credentials.length > 100) return { ok: false, error: "credentials" };
  if (!specialty || specialty.length > 100) return { ok: false, error: "specialty" };
  if (services.length > 20 || services.some((s) => s.length > 100)) return { ok: false, error: "services" };
  if (bio.length > 2000) return { ok: false, error: "bio" };

  return { ok: true, data: { credentials, specialty, services, bio } };
}
