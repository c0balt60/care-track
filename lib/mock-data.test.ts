import { describe, expect, it } from "vitest";
import { practitioners, practitionerLocation } from "./mock-data";

describe("practitionerLocation", () => {
  it("resolves every seeded practitioner to coordinates", () => {
    for (const p of practitioners) expect(practitionerLocation(p), p.id).not.toBeNull();
  });

  it("uses the clinic's coordinates over the practitioner's own", () => {
    const p = practitioners.find((x) => x.clinicId === "northside")!;
    expect(practitionerLocation({ ...p, lat: 0, lng: 0 })).toEqual({ lat: 43.6532, lng: -79.3832 });
  });

  it("returns null for a solo practitioner without coordinates", () => {
    const p = practitioners.find((x) => x.clinicId === null)!;
    expect(practitionerLocation({ ...p, lat: undefined, lng: undefined })).toBeNull();
  });
});
