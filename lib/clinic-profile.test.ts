import { expect, test } from "vitest";
import { parseClinicProfile } from "@/lib/clinic-profile";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const good = { name: " Northside ", phone: "(518) 555-0100", address: "1 Main St", city: "Troy, NY", services: "Skin, , Skin, Eyes" };

test("accepts, trims, and dedupes services", () => {
  expect(parseClinicProfile(form(good))).toEqual({
    ok: true,
    data: { name: "Northside", phone: "(518) 555-0100", address: "1 Main St", city: "Troy, NY", services: ["Skin", "Eyes"] },
  });
});

test("rejects bad input", () => {
  expect(parseClinicProfile(form({ ...good, name: " " })).ok).toBe(false);
  expect(parseClinicProfile(form({ ...good, phone: "call me" })).ok).toBe(false);
  expect(parseClinicProfile(form({ ...good, address: "" })).ok).toBe(false);
  expect(parseClinicProfile(form({ ...good, city: "" })).ok).toBe(false);
  expect(parseClinicProfile(form({ ...good, services: "x".repeat(101) })).ok).toBe(false);
});
