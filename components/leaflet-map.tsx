"use client";
// Results map for /search (MAP-4 #54): OpenStreetMap tiles, no API key. Only loaded via
// ResultsMap. The list next to it is the real UI; the map is extra, so everything here
// is also reachable from the cards (keyboard and screen readers use the list).
import "leaflet/dist/leaflet.css";
import { useEffect, useState } from "react";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";
import type { LatLngTuple } from "leaflet";
import type { Point } from "@/lib/geocode";

export type MapPin = { id: string; name: string; point: Point };

// Hex, not CSS vars: Leaflet writes these as SVG attributes, which don't resolve var().
const TEAL = "#0f766e"; // teal-700 (accent)
const ACTIVE = "#c2410c"; // orange-700
const YOU = "#1d4ed8"; // blue-700

export default function LeafletMap({ pins, you, radiusKm }: { pins: MapPin[]; you?: Point | null; radiusKm?: number }) {
  const [active, setActive] = useState<string | null>(null);

  // Practitioners at the same clinic share a point: one pin per place.
  const places = Object.values(
    pins.reduce<Record<string, { key: string; point: Point; pins: MapPin[] }>>((acc, p) => {
      const key = `${p.point.lat},${p.point.lng}`;
      (acc[key] ??= { key, point: p.point, pins: [] }).pins.push(p);
      return acc;
    }, {}),
  );
  const at = (p: Point): LatLngTuple => [p.lat, p.lng];
  const bounds = [...places.map((pl) => at(pl.point)), ...(you ? [at(you)] : [])];

  // Card hover/focus highlights its pin. Cards are server-rendered, so listen on the document.
  useEffect(() => {
    const onEnter = (e: Event) => {
      const card = (e.target as Element).closest?.("[data-result-id]");
      setActive(card?.getAttribute("data-result-id") ?? null);
    };
    document.addEventListener("mouseover", onEnter);
    document.addEventListener("focusin", onEnter);
    return () => {
      document.removeEventListener("mouseover", onEnter);
      document.removeEventListener("focusin", onEnter);
    };
  }, []);

  // Pin click highlights its card(s) and scrolls to the first one.
  const showCards = (ids: string[]) => {
    document.querySelectorAll("[data-result-id][data-active]").forEach((el) => el.removeAttribute("data-active"));
    const cards = ids.map((id) => document.getElementById(`result-${id}`)).filter((el) => el !== null);
    cards.forEach((el) => el.setAttribute("data-active", ""));
    cards[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
    cards[0]?.focus({ preventScroll: true });
  };

  return (
    <MapContainer
      // Re-mount when the results change so the view refits to the new pins.
      key={bounds.join("|") + radiusKm}
      bounds={bounds.length > 1 ? bounds : undefined}
      center={bounds.length === 1 ? bounds[0] : undefined}
      zoom={bounds.length === 1 ? 13 : undefined}
      boundsOptions={{ padding: [32, 32] }}
      scrollWheelZoom={false}
      className="z-0 h-72 rounded-2xl sm:h-80"
      aria-label="Map of results"
    >
      {/* Tile host must stay in the CSP img-src in next.config.ts, or the tiles are blocked. */}
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      {you && radiusKm && (
        <Circle center={at(you)} radius={radiusKm * 1000} pathOptions={{ color: YOU, weight: 1, fillOpacity: 0.05 }} />
      )}
      {you && (
        <CircleMarker center={at(you)} radius={7} pathOptions={{ color: "#fff", weight: 2, fillColor: YOU, fillOpacity: 1 }}>
          <Tooltip>You (approximate)</Tooltip>
        </CircleMarker>
      )}
      {places.map((pl) => {
        const on = pl.pins.some((p) => p.id === active);
        return (
          <CircleMarker
            key={pl.key}
            center={at(pl.point)}
            radius={on ? 11 : 8}
            pathOptions={{ color: "#fff", weight: 2, fillColor: on ? ACTIVE : TEAL, fillOpacity: 1 }}
            eventHandlers={{ click: () => showCards(pl.pins.map((p) => p.id)) }}
          >
            <Tooltip>{pl.pins.map((p) => p.name).join(", ")}</Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
