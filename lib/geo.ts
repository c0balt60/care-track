// Distance and estimated travel time for search (MAP-3 #53). Pure math, no network.
import type { Point } from "./geocode";

/** Straight-line ("as the crow flies") distance in km, using the haversine formula. */
export function haversineKm(a: Point, b: Point): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h)); // 6371 km = Earth's mean radius
}

/** Assumed average city driving speed. Real drive times come from the Google Maps link (MAP-4). */
export const AVG_KMH = 30;

/** Estimated minutes to drive `km`, rounded up to a whole minute. Always shown as an estimate. */
export const travelMinutes = (km: number) => Math.ceil((km / AVG_KMH) * 60);
