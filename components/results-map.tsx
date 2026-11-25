"use client";
// Leaflet touches `window` on import, so it only loads in the browser (MAP-4 #54).
// `ssr: false` must live in a client component in Next 16 (docs: guides/lazy-loading).
import dynamic from "next/dynamic";

export const ResultsMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-2xl bg-line sm:h-80" />,
});
