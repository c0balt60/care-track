export type ClinicProfile = { name: string; phone: string; address: string; city: string; services: string[] };

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

/** Checks the /clinic profile form. Returns the cleaned values, or which field is wrong. */
export function parseClinicProfile(form: FormData):
  | { ok: true; data: ClinicProfile }
  | { ok: false; error: keyof typeof clinicProfileErrors } {
  const text = (k: string) => String(form.get(k) ?? "").trim();
  const [name, phone, address, city] = ["name", "phone", "address", "city"].map(text);
  const services = [...new Set(text("services").split(",").map((s) => s.trim()).filter(Boolean))];

  if (!name || name.length > 200) return { ok: false, error: "name" };
  if (!/^\+?[\d\s().-]{7,20}$/.test(phone)) return { ok: false, error: "phone" };
  if (!address || address.length > 200) return { ok: false, error: "address" };
  if (!city || city.length > 100) return { ok: false, error: "city" };
  if (services.length > 30 || services.some((s) => s.length > 100)) return { ok: false, error: "services" };

  return { ok: true, data: { name, phone, address, city, services } };
}
