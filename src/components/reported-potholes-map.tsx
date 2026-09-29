"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { CircleMarker, Map as LeafletMap } from "leaflet";

/** Display-ready record. Dates are formatted on the server to avoid hydration drift. */
export type MapPothole = {
  id: string;
  latitude: number;
  longitude: number;
  locationDescription: string;
  laneDirection: string | null;
  observedLabel: string;
  submittedLabel: string | null;
  cityRequestId: string | null;
  /** Already checked on the server to be an http(s) URL. */
  cityRequestUrl: string | null;
  photoUrl: string;
  isFixture: boolean;
};

const BAKERSFIELD: [number, number] = [35.3733, -119.0187];

// Required by MapTiler's terms: MapTiler and OpenStreetMap attribution.
const ATTRIBUTION =
  '<a href="https://www.maptiler.com/copyright/" target="_blank" rel="noopener noreferrer">&copy; MapTiler</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">&copy; OpenStreetMap contributors</a>';

/**
 * Popup built with DOM APIs and textContent, never an HTML string, so record
 * text can never be interpreted as markup.
 */
function popupContent(p: MapPothole): HTMLElement {
  const root = document.createElement("div");
  root.className = "map-popup";
  const add = (tag: string, text: string, className?: string) => {
    const el = document.createElement(tag);
    el.textContent = text;
    if (className) el.className = className;
    root.append(el);
    return el;
  };

  if (p.isFixture) add("p", "DEV FIXTURE: not a real report", "badge fixture");
  add("strong", p.locationDescription);
  if (p.laneDirection) add("p", p.laneDirection);

  const img = document.createElement("img");
  img.src = p.photoUrl;
  img.alt = `Evidence photo: ${p.locationDescription}`;
  img.width = 200;
  img.height = 150;
  img.loading = "lazy";
  root.append(img);

  add("p", `Observed: ${p.observedLabel}`);
  if (p.submittedLabel) add("p", `Reported to the city: ${p.submittedLabel}`);

  if (p.cityRequestUrl) {
    const para = add("p", "City request: ");
    const link = document.createElement("a");
    link.href = p.cityRequestUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = p.cityRequestId ?? "view on the city site";
    para.append(link);
  } else if (p.cityRequestId) {
    add("p", `City request: ${p.cityRequestId}`);
  } else {
    add("p", "City request number: none was shown by the city.", "hint");
  }
  add("p", "Reported does not mean repaired.", "hint");
  return root;
}

export function ReportedPotholesMap({
  potholes,
  mapKey,
}: {
  potholes: MapPothole[];
  mapKey: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef(new Map<string, CircleMarker>());
  const [tileError, setTileError] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!mapKey || !containerRef.current) return;
    let cancelled = false;
    let map: LeafletMap | undefined;
    const markers = markersRef.current;

    // MapTiler answers a bad key with an "Invalid key" *image*, which the
    // browser treats as a successful tile load. Check the key explicitly so a
    // rejected key produces a visible error instead of a misleading map.
    fetch(`https://api.maptiler.com/maps/streets-v4/tiles.json?key=${encodeURIComponent(mapKey)}`)
      .then((res) => {
        if (!cancelled && !res.ok) {
          setKeyError(`MapTiler rejected the map key (HTTP ${res.status}).`);
        }
      })
      .catch(() => {
        if (!cancelled) setKeyError("Could not reach MapTiler to load the map.");
      });

    // Leaflet touches `window` on import, so load it only in the browser.
    void import("leaflet").then((L) => {
      if (cancelled || !containerRef.current) return;
      map = L.map(containerRef.current, {
        center: BAKERSFIELD,
        zoom: 12,
        scrollWheelZoom: false,
      });

      L.tileLayer(
        `https://api.maptiler.com/maps/streets-v4/{z}/{x}/{y}.png?key=${encodeURIComponent(mapKey)}`,
        {
          tileSize: 512,
          zoomOffset: -1,
          minZoom: 1,
          maxZoom: 19,
          attribution: ATTRIBUTION,
          crossOrigin: true,
        },
      )
        .on("tileerror", () => setTileError(true))
        .addTo(map);

      for (const p of potholes) {
        const marker = L.circleMarker([p.latitude, p.longitude], {
          radius: 9,
          weight: 2,
          color: "#7a1f00",
          fillColor: "#e8590c",
          fillOpacity: 0.9,
        })
          .bindTooltip(`Reported to city: ${p.locationDescription}`)
          .bindPopup(() => popupContent(p), { maxWidth: 240 })
          .on("click", () => setSelectedId(p.id))
          .addTo(map);
        markers.set(p.id, marker);
      }

      if (potholes.length > 1) {
        map.fitBounds(
          L.latLngBounds(potholes.map((p) => [p.latitude, p.longitude] as [number, number])),
          { padding: [40, 40], maxZoom: 15 },
        );
      } else if (potholes.length === 1) {
        map.setView([potholes[0].latitude, potholes[0].longitude], 15);
      }
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      markers.clear();
    };
  }, [mapKey, potholes]);

  function showOnMap(p: MapPothole) {
    setSelectedId(p.id);
    const map = mapRef.current;
    const marker = markersRef.current.get(p.id);
    if (!map || !marker) return;
    map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15));
    marker.openPopup();
    containerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return (
    <div className="stack wide">
      {!mapKey && (
        <p role="alert" className="map-error">
          Map unavailable: <code>MAPTILER_KEY</code> is not set in <code>.env.local</code>. The
          list below still shows every reported pothole.
        </p>
      )}
      {keyError && (
        <p role="alert" className="map-error">
          Map unavailable: {keyError} Check <code>MAPTILER_KEY</code> in <code>.env.local</code>{" "}
          and that the key allows this site&apos;s address. The list below still shows every
          reported pothole.
        </p>
      )}
      {tileError && !keyError && (
        <p role="alert" className="map-error">
          Some map tiles failed to load. Check that the MapTiler key is valid and allows this
          site&apos;s address.
        </p>
      )}
      {mapKey && (
        <div
          ref={containerRef}
          className="map"
          hidden={keyError !== null}
          role="region"
          aria-label="Map of potholes reported to the city"
        />
      )}

      {potholes.length === 0 ? (
        <p>No potholes have been reported to the city yet.</p>
      ) : (
        <ul className="map-list" aria-label="Potholes reported to the city">
          {potholes.map((p) => (
            <li key={p.id} className={p.id === selectedId ? "selected" : undefined}>
              <div>
                {p.isFixture && <span className="badge fixture">DEV FIXTURE</span>}{" "}
                <strong>{p.locationDescription}</strong>
                <div className="hint">
                  Reported {p.submittedLabel ?? "(date not recorded)"}
                  {p.cityRequestId ? ` · City request ${p.cityRequestId}` : ""}
                </div>
              </div>
              {mapKey && !keyError && (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => showOnMap(p)}
                  aria-pressed={p.id === selectedId}
                >
                  Show on map
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
