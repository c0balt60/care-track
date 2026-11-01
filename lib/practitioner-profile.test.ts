import { expect, test } from "vitest";
import { parsePractitionerProfile } from "@/lib/practitioner-profile";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const good = { credentials: " MD ", specialty: "Dermatology", services: "Acne, , Skin checks, Acne", bio: " Hi. " };

test("accepts, trims, and dedupes services", () => {
  expect(parsePractitionerProfile(form(good))).toEqual({
    ok: true,
    data: { credentials: "MD", specialty: "Dermatology", services: ["Acne", "Skin checks"], bio: "Hi." },
  });
});

test("rejects bad input", () => {
  expect(parsePractitionerProfile(form({ ...good, credentials: " " })).ok).toBe(false);
  expect(parsePractitionerProfile(form({ ...good, specialty: "" })).ok).toBe(false);
  expect(parsePractitionerProfile(form({ ...good, services: "x".repeat(101) })).ok).toBe(false);
  expect(parsePractitionerProfile(form({ ...good, bio: "x".repeat(2001) })).ok).toBe(false);
});
