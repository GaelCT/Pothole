"use client";

/**
 * Shared Leaflet + MapTiler setup for every map on the site: one tile style,
 * one attribution, one key check. Client-only; no server imports.
 */
import "leaflet/dist/leaflet.css";
import { useEffect, useState, type RefObject } from "react";
import type { Map as LeafletMap } from "leaflet";

export type Leaflet = typeof import("leaflet");
export type LeafletHandle = { L: Leaflet; map: LeafletMap };

export const BAKERSFIELD_CENTER: [number, number] = [35.3733, -119.0187];

const MAPTILER_MAP = "https://api.maptiler.com/maps/streets-v4";

// Required by MapTiler's terms: MapTiler and OpenStreetMap attribution.
const ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">&copy; MapTiler</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap contributors</a>';

/**
 * MapTiler answers a bad key with an "Invalid key" *image*, which the browser
 * treats as a successful tile load. Check the key explicitly so a rejected key
 * produces a visible error instead of a misleading map. Resolves to an error
 * message, or null when the key was accepted (or the check was aborted).
 */
async function checkMapTilerKey(key: string, signal: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`${MAPTILER_MAP}/tiles.json?key=${encodeURIComponent(key)}`, {
      signal,
    });
    return res.ok ? null : `MapTiler rejected the map key (HTTP ${res.status}).`;
  } catch {
    return signal.aborted ? null : "Could not reach MapTiler to load the map.";
  }
}

/**
 * Creates a Bakersfield-centered Leaflet map with MapTiler tiles inside
 * `containerRef` once the browser has loaded Leaflet. Returns null for the
 * handle until the map exists; callers add their own layers in an effect that
 * depends on the handle.
 */
export function useMapTilerMap(
  containerRef: RefObject<HTMLDivElement | null>,
  mapKey: string | null,
): { handle: LeafletHandle | null; keyError: string | null; tileError: boolean } {
  const [handle, setHandle] = useState<LeafletHandle | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    if (!mapKey || !containerRef.current) return;
    let cancelled = false;
    let map: LeafletMap | undefined;
    const controller = new AbortController();

    void checkMapTilerKey(mapKey, controller.signal).then((error) => {
      if (!cancelled && error) setKeyError(error);
    });

    // Leaflet touches `window` on import, so load it only in the browser.
    void import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      map = L.map(containerRef.current, {
        center: BAKERSFIELD_CENTER,
        zoom: 12,
        scrollWheelZoom: false,
      });
      L.tileLayer(`${MAPTILER_MAP}/{z}/{x}/{y}.png?key=${encodeURIComponent(mapKey)}`, {
        tileSize: 512,
        zoomOffset: -1,
        minZoom: 1,
        maxZoom: 19,
        attribution: ATTRIBUTION,
        crossOrigin: true,
      })
        .on("tileerror", () => setTileError(true))
        .addTo(map);
      setHandle({ L, map });
    });

    return () => {
      cancelled = true;
      controller.abort();
      map?.remove();
      setHandle(null);
    };
  }, [containerRef, mapKey]);

  return { handle, keyError, tileError };
}

/** Fit the view to the given points (or center on a single one). */
export function fitToPoints(
  { L, map }: LeafletHandle,
  points: ReadonlyArray<{ latitude: number; longitude: number }>,
): void {
  if (points.length > 1) {
    map.fitBounds(L.latLngBounds(points.map((p) => [p.latitude, p.longitude] as [number, number])), {
      padding: [40, 40],
      maxZoom: 15,
    });
  } else if (points.length === 1) {
    map.setView([points[0].latitude, points[0].longitude], 15);
  }
}
