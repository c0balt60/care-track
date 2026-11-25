"use client";

// MAP-2 (#52): coordinates are rounded to 2 decimals (~1 km) so a patient's location stays approximate.
// The server then names the area ("Toronto, ON") and the search page shows it under "Near".
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MapPinIcon } from "@/components/icons";

export function UseMyLocation() {
  const router = useRouter();
  const [locating, setLocating] = useState(false);
  // Stays true until the new search page (with the area name) has rendered.
  const [loading, startTransition] = useTransition();
  const [error, setError] = useState("");

  const fail = (denied: boolean) => {
    setLocating(false);
    setError(
      denied
        ? "Location access was blocked. Type a city or postal code instead."
        : "Couldn't get your location. Type a city or postal code instead.",
    );
  };

  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    const form = e.currentTarget.form!;
    setError("");
    if (!navigator.geolocation) return fail(false);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const params = new URLSearchParams();
        for (const [k, v] of new FormData(form)) {
          if (typeof v === "string" && v !== "") params.append(k, v);
        }
        params.delete("near");
        params.set("lat", String(Math.round(coords.latitude * 100) / 100));
        params.set("lng", String(Math.round(coords.longitude * 100) / 100));
        setLocating(false);
        startTransition(() => router.push("/search?" + params));
      },
      (err) => fail(err.code === err.PERMISSION_DENIED),
      { maximumAge: 600_000, timeout: 10_000 },
    );
  }

  const status = locating ? "Getting your location…" : loading ? "Finding your area…" : error;

  return (
    <div>
      <button type="button" className="btn btn-secondary" onClick={onClick} disabled={locating || loading} aria-busy={locating || loading}>
        <MapPinIcon />
        {locating || loading ? "Locating…" : "Use my location"}
      </button>
      {/* Always rendered so screen readers announce each change. */}
      <p role="status" className={`mt-1 text-sm ${error && !locating && !loading ? "text-red-700" : "text-muted"}`}>
        {status}
      </p>
    </div>
  );
}
