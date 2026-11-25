import { describe, expect, it } from "vitest";
import { haversineKm, travelMinutes } from "./geo";

describe("haversineKm", () => {
  it("is 0 for the same point", () => {
    expect(haversineKm({ lat: 43.65, lng: -79.38 }, { lat: 43.65, lng: -79.38 })).toBe(0);
  });

  it("matches known distances", () => {
    // Toronto to Ottawa is about 352 km in a straight line.
    expect(haversineKm({ lat: 43.6532, lng: -79.3832 }, { lat: 45.4215, lng: -75.6972 })).toBeCloseTo(352, -1);
    // One degree of latitude is about 111.2 km.
    expect(haversineKm({ lat: 43, lng: -79 }, { lat: 44, lng: -79 })).toBeCloseTo(111.2, 1);
  });
});

describe("travelMinutes", () => {
  it("assumes 30 km/h and rounds up", () => {
    expect(travelMinutes(10)).toBe(20);
    expect(travelMinutes(0.1)).toBe(1);
    expect(travelMinutes(0)).toBe(0);
  });
});
