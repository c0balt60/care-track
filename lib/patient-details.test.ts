import { expect, test } from "vitest";
import { parsePatientDetails } from "@/lib/patient-details";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};
const good = { name: " Jordan Lee ", dob: "1990-05-14", phone: "+1 (518) 555-0142" };
const TODAY = "2026-10-31";

test("accepts and trims valid details", () => {
  expect(parsePatientDetails(form(good), TODAY)).toEqual({
    ok: true,
    data: { name: "Jordan Lee", dob: "1990-05-14", phone: "+1 (518) 555-0142" },
  });
});

test("rejects bad input", () => {
  expect(parsePatientDetails(form({ ...good, name: "  " }), TODAY).ok).toBe(false);
  expect(parsePatientDetails(form({ ...good, dob: "2026-02-31" }), TODAY).ok).toBe(false);
  expect(parsePatientDetails(form({ ...good, dob: "2027-01-01" }), TODAY).ok).toBe(false);
  expect(parsePatientDetails(form({ ...good, phone: "call me" }), TODAY).ok).toBe(false);
});
