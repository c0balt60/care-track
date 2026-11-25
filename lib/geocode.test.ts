import { beforeEach, describe, expect, it, vi } from "vitest";

// `server-only` throws on import outside a React Server environment, and tests aren't one.
vi.mock("server-only", () => ({}));
const { geocode, resolveLocation } = await import("./geocode");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
const reply = (body: unknown, status = 200) => fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

beforeEach(() => fetchMock.mockReset());

// Lookups are throttled to 1 per second, so tests with several lookups take a few seconds.
describe("geocode", { timeout: 10_000 }, () => {
  it("asks Nominatim for Canada only, rounds to ~1 km, and caches by normalized text", async () => {
    reply([{ lat: "43.645123", lon: "-79.394567" }]);
    expect(await geocode("M5V 3L9")).toEqual({ lat: 43.65, lng: -79.39 });
    expect(await geocode("  m5v   3l9 ")).toEqual({ lat: 43.65, lng: -79.39 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("countrycodes=ca");
    expect(init.headers["User-Agent"]).toMatch(/CareTrack/);
  });

  it("explains unknown places", async () => {
    reply([]);
    expect(await resolveLocation("Nowhereville")).toEqual({ point: null, error: expect.stringContaining("couldn't find") });
  });

  it("reports outages and doesn't cache them", async () => {
    reply({}, 503);
    expect((await resolveLocation("Ottawa")).error).toMatch(/unavailable/);
    reply([{ lat: "45.42", lon: "-75.69" }]);
    expect(await resolveLocation("Ottawa")).toEqual({ point: { lat: 45.42, lng: -75.69 } });
  });
});

describe("resolveLocation from browser coordinates", { timeout: 10_000 }, () => {
  it("uses rounded lat/lng when Near is empty and names the place", async () => {
    reply({ address: { city: "Toronto", state: "Ontario", "ISO3166-2-lvl4": "CA-ON" } });
    expect(await resolveLocation("", "43.653226", "-79.383184")).toEqual({ point: { lat: 43.65, lng: -79.38 }, label: "Toronto, ON" });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/reverse?lat=43.65&lon=-79.38");
  });

  it("still uses the coordinates when the place can't be named", async () => {
    reply({}, 503);
    expect(await resolveLocation("", "45.5", "-73.57")).toEqual({ point: { lat: 45.5, lng: -73.57 }, label: "your location" });
  });

  it("ignores missing or out-of-range coordinates", async () => {
    expect(await resolveLocation("", "abc", "1")).toEqual({ point: null });
    expect(await resolveLocation("", "91", "0")).toEqual({ point: null });
    expect(await resolveLocation("")).toEqual({ point: null });
  });

  it("prefers typed text over coordinates", async () => {
    expect(await resolveLocation("m5v 3l9", "1", "1")).toEqual({ point: { lat: 43.65, lng: -79.39 } }); // cached above
  });
});
