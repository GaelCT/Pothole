"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { Marker } from "leaflet";
import { saveDetailsAction, type ActionState } from "./actions";
import { FormStatus } from "./form-status";
import { MapStatusMessages } from "@/components/map/map-status";
import { useMapTilerMap } from "@/components/map/use-maptiler-map";

export type NearbyPin = {
  id: string;
  latitude: number;
  longitude: number;
  label: string;
};

// Leaflet decimal degrees can carry 15+ digits; ~0.1 m precision is plenty.
const round6 = (n: number) => String(Math.round(n * 1e6) / 1e6);

/**
 * Street description, lane, and pin position. The pin can be dragged or the
 * map clicked; the latitude/longitude fields are the keyboard alternative and
 * the source of truth that gets submitted.
 */
export function DetailsForm({
  potholeId,
  initial,
  nearby,
  mapKey,
  locked,
}: {
  potholeId: string;
  initial: { latitude: number; longitude: number; locationDescription: string; laneDirection: string | null };
  nearby: NearbyPin[];
  mapKey: string | null;
  locked: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveDetailsAction.bind(null, potholeId),
    undefined,
  );
  const [lat, setLat] = useState(String(initial.latitude));
  const [lon, setLon] = useState(String(initial.longitude));
  const containerRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<Marker | null>(null);
  const { handle, keyError, tileError } = useMapTilerMap(containerRef, mapKey);

  // Create the draggable pin and the nearby-record markers once the map exists.
  useEffect(() => {
    if (!handle) return;
    const { L, map } = handle;
    const start: [number, number] = [initial.latitude, initial.longitude];
    map.setView(start, 18);

    const others = L.layerGroup().addTo(map);
    for (const n of nearby) {
      L.circleMarker([n.latitude, n.longitude], {
        radius: 7,
        weight: 2,
        color: "#444444",
        fillColor: "#bbbbbb",
        fillOpacity: 0.9,
      })
        .bindTooltip(`Nearby record: ${n.label}`)
        .addTo(others);
    }

    const marker = L.marker(start, {
      draggable: !locked,
      keyboard: false,
      title: "This record's pin",
      icon: L.divIcon({ className: "pin-icon", iconSize: [22, 22], iconAnchor: [11, 11] }),
    }).addTo(map);
    const sync = () => {
      const p = marker.getLatLng();
      setLat(round6(p.lat));
      setLon(round6(p.lng));
    };
    marker.on("dragend", sync);
    const onClick = (e: { latlng: { lat: number; lng: number } }) => {
      if (locked) return;
      marker.setLatLng(e.latlng);
      sync();
    };
    map.on("click", onClick);
    markerRef.current = marker;
    return () => {
      map.off("click", onClick);
      marker.remove();
      others.remove();
      markerRef.current = null;
    };
    // initial position only; typed coordinates move the pin below
  }, [handle, nearby, locked, initial.latitude, initial.longitude]);

  // Typed coordinates move the pin, so both inputs stay in agreement.
  useEffect(() => {
    const la = Number(lat);
    const lo = Number(lon);
    if (markerRef.current && lat.trim() && lon.trim() && Number.isFinite(la) && Number.isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) {
      markerRef.current.setLatLng([la, lo]);
    }
  }, [lat, lon]);

  const mapUsable = mapKey !== null && keyError === null;

  return (
    <form action={formAction} className="stack wide">
      <MapStatusMessages
        mapKey={mapKey}
        keyError={keyError}
        tileError={tileError}
        fallback="Type the coordinates instead."
      />
      {mapKey && (
        <div
          ref={containerRef}
          className="map review-map"
          hidden={!mapUsable}
          role="region"
          aria-label="Pin editor. Drag the blue pin or click the map to move it. Grey dots are nearby records. The latitude and longitude fields below are the keyboard alternative."
        />
      )}
      <p className="hint">
        Put the pin on the pothole itself, not where the car was. Moving the pin clears the
        &ldquo;location confirmed&rdquo; decision so you confirm it again.
      </p>

      <fieldset disabled={locked} className="stack wide plain">
        <div className="row">
          <div className="field">
            <label htmlFor="latitude">Latitude</label>
            <input id="latitude" name="latitude" inputMode="decimal" required value={lat} onChange={(e) => setLat(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="longitude">Longitude</label>
            <input id="longitude" name="longitude" inputMode="decimal" required value={lon} onChange={(e) => setLon(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="location_description">Street description</label>
          <input
            id="location_description"
            name="location_description"
            maxLength={500}
            required
            defaultValue={initial.locationDescription}
            placeholder="Street and nearest intersection"
          />
        </div>
        <div className="field">
          <label htmlFor="lane_direction">
            Lane or direction <span className="hint">(optional, only if actually known)</span>
          </label>
          <input id="lane_direction" name="lane_direction" maxLength={200} defaultValue={initial.laneDirection ?? ""} />
        </div>
        <FormStatus state={state} />
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </button>
      </fieldset>
    </form>
  );
}
