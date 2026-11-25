import { describe, expect, it } from "vitest";
import { directionsUrl, haversineKm, travelMinutes } from "./geo";

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

describe("directionsUrl", () => {
  const base = "https://www.google.com/maps/dir/?api=1&destination=";
  it("prefers the street address", () => {
    expect(directionsUrl({ address: "1 Main St", city: "Leeds", point: { lat: 1, lng: 2 } })).toBe(`${base}1+Main+St%2C+Leeds`);
  });
  it("uses coordinates without an address", () => {
    expect(directionsUrl({ city: "Leeds", point: { lat: 1.5, lng: 2 } })).toBe(`${base}1.5%2C2`);
  });
  it("falls back to the city", () => {
    expect(directionsUrl({ city: "Leeds" })).toBe(`${base}Leeds`);
  });
});
