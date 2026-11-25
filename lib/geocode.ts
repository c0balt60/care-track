// Where the patient is searching from (MAP-2 #52): a typed city/postal code geocoded with
// OpenStreetMap Nominatim, or the browser's rounded coordinates. Always approximate, never stored.
import "server-only";
import { logger } from "./logger";

export type Point = { lat: number; lng: number };

/** 2 decimals is about 1 km: enough for distance, not enough to pinpoint a home. */
export const roundCoord = (x: number) => Math.round(x * 100) / 100;

// Nominatim's usage policy requires an identifying User-Agent.
const USER_AGENT = process.env.NOMINATIM_USER_AGENT || "CareTrack/1.0 (+https://github.com/c0balt60/care-track)";

// ponytail: per-process cache and throttle; each Vercel instance keeps its own. Move to a DB table if traffic grows.
const cache = new Map<string, Promise<unknown>>();
let queue: Promise<unknown> = Promise.resolve();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** One cached, throttled Nominatim call. Nominatim allows 1 request per second, so each call waits for the previous one plus 1 s. */
function nominatim<T>(key: string, path: "search" | "reverse", params: Record<string, string>, parse: (body: never) => T): Promise<T> {
  let hit = cache.get(key) as Promise<T> | undefined;
  if (!hit) {
    hit = queue.then(async () => {
      const url = new URL(`https://nominatim.openstreetmap.org/${path}`);
      url.search = new URLSearchParams({ ...params, format: "jsonv2" }).toString();
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`Nominatim responded ${res.status}`);
      return parse((await res.json()) as never);
    });
    queue = hit.catch(() => {}).then(() => sleep(1000));
    hit.catch(() => cache.delete(key)); // don't cache outages
    cache.set(key, hit);
  }
  return hit;
}

/** Canada only for now. Resolves to null for places Nominatim doesn't know; throws if the lookup fails. */
export function geocode(query: string): Promise<Point | null> {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!q) return Promise.resolve(null);
  return nominatim(`search:${q}`, "search", { q, limit: "1", countrycodes: "ca" }, ([place]: { lat: string; lon: string }[]) =>
    place ? { lat: roundCoord(Number(place.lat)), lng: roundCoord(Number(place.lon)) } : null,
  );
}

type Address = { city?: string; town?: string; village?: string; municipality?: string; county?: string; state?: string; postcode?: string; "ISO3166-2-lvl4"?: string };

/** A human label for a point, e.g. "Toronto, ON", so patients can see where they're searching from. Null if unknown. */
export function placeName({ lat, lng }: Point): Promise<string | null> {
  return nominatim(`reverse:${lat},${lng}`, "reverse", { lat: String(lat), lon: String(lng), zoom: "10" }, ({ address: a }: { address?: Address }) => {
    if (!a) return null;
    const place = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county;
    const region = a["ISO3166-2-lvl4"]?.split("-")[1] ?? a.state; // "CA-ON" -> "ON"
    if (place) return region ? `${place}, ${region}` : place;
    return a.postcode ?? null;
  });
}

/**
 * The search's starting point. Typed text wins, so editing "Near" replaces an earlier
 * "Use my location"; otherwise valid `lat`/`lng` from the URL are used, rounded again in case
 * someone hand-edited the URL with more precision, and named ("Toronto, ON") for display.
 */
export async function resolveLocation(
  near: string,
  lat?: string,
  lng?: string,
): Promise<{ point: Point | null; label?: string; error?: string }> {
  if (near) {
    try {
      const point = await geocode(near);
      if (point) return { point };
      return { point: null, error: `We couldn't find “${near}” in Canada. Try a city or a postal code like M5V 3L9.` };
    } catch (err) {
      logger.warn({ err }, "geocoding failed"); // the query itself isn't logged: it's patient location
      return { point: null, error: "Location search is unavailable right now. Try again in a moment." };
    }
  }
  const la = Number(lat);
  const ln = Number(lng);
  if (!lat || !lng || !(Math.abs(la) <= 90) || !(Math.abs(ln) <= 180)) return { point: null };
  const point = { lat: roundCoord(la), lng: roundCoord(ln) };
  // The label is only for display: if the lookup fails, the coordinates still work.
  const label = await placeName(point).catch((err) => (logger.warn({ err }, "reverse geocoding failed"), null));
  return { point, label: label ?? "your location" };
}
