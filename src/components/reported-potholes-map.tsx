"use client";

import { useEffect, useRef, useState } from "react";
import type { CircleMarker } from "leaflet";
import type { MapPothole } from "@/lib/map-pothole";
import { MapStatusMessages } from "./map/map-status";
import { fitToPoints, useMapTilerMap } from "./map/use-maptiler-map";

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

/** Map + list of records confirmed as reported to the city (login page). */
export function ReportedPotholesMap({
  potholes,
  mapKey,
}: {
  potholes: MapPothole[];
  mapKey: string | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef(new Map<string, CircleMarker>());
  const { handle, keyError, tileError } = useMapTilerMap(containerRef, mapKey);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!handle) return;
    const { L, map } = handle;
    const markers = markersRef.current;
    const layer = L.layerGroup().addTo(map);

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
        .addTo(layer);
      markers.set(p.id, marker);
    }
    fitToPoints(handle, potholes);

    return () => {
      layer.remove();
      markers.clear();
    };
  }, [handle, potholes]);

  function showOnMap(p: MapPothole) {
    setSelectedId(p.id);
    const marker = markersRef.current.get(p.id);
    if (!handle || !marker) return;
    handle.map.setView(marker.getLatLng(), Math.max(handle.map.getZoom(), 15));
    marker.openPopup();
    containerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  return (
    <div className="stack wide">
      <MapStatusMessages
        mapKey={mapKey}
        keyError={keyError}
        tileError={tileError}
        fallback="The list below still shows every reported pothole."
      />
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
