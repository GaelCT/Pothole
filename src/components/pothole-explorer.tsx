"use client";

import { useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import type { CircleMarker, CircleMarkerOptions } from "leaflet";
import {
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  type MapPothole,
  type ReportCategory,
} from "@/lib/map-pothole";
import { MapStatusMessages } from "./map/map-status";
import { fitToPoints, useMapTilerMap } from "./map/use-maptiler-map";

/**
 * Marker style per reporting category. Color is never the only cue: the ring
 * style differs too (solid filled, dashed half-filled, hollow), and the legend
 * and tooltips carry text labels. Swatches in globals.css mirror these.
 */
const MARKER_STYLES: Record<ReportCategory, CircleMarkerOptions> = {
  reported: { radius: 9, weight: 2, color: "#06305c", fillColor: "#0b5cad", fillOpacity: 1 },
  unconfirmed: {
    radius: 9,
    weight: 3,
    color: "#6b4400",
    fillColor: "#f2b705",
    fillOpacity: 0.85,
    dashArray: "4 3",
  },
  not_reported: { radius: 8, weight: 4, color: "#b3261e", fillColor: "#ffffff", fillOpacity: 1 },
};

type StatusFilter = "all" | ReportCategory;

function plural(n: number) {
  return n === 1 ? "pothole" : "potholes";
}

export function PotholeExplorer({
  potholes,
  mapKey,
}: {
  potholes: MapPothole[];
  mapKey: string | null;
}) {
  const ids = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef(new Map<string, CircleMarker>());
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusDetailOnSelect = useRef(false);
  const { handle, keyError, tileError } = useMapTilerMap(containerRef, mapKey);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rangeInvalid = from !== "" && to !== "" && from > to;
  const filtered = useMemo(() => {
    if (rangeInvalid) return [];
    return potholes.filter((p) => {
      if (status !== "all" && p.reportCategory !== status) return false;
      if (from || to) {
        // A record without a parseable date cannot satisfy a date filter.
        if (!p.observedDate) return false;
        if (from && p.observedDate < from) return false;
        if (to && p.observedDate > to) return false;
      }
      return true;
    });
  }, [potholes, status, from, to, rangeInvalid]);

  // A selection hidden by the filters is simply not shown.
  const selected = filtered.find((p) => p.id === selectedId) ?? null;
  const mapUsable = mapKey !== null && keyError === null;

  // Initial view: all published records, not just the filtered ones, so
  // changing filters does not jump the map around.
  useEffect(() => {
    if (handle) fitToPoints(handle, potholes);
  }, [handle, potholes]);

  // One marker per filtered record, at its exact stored coordinates.
  useEffect(() => {
    if (!handle) return;
    const { L, map } = handle;
    const markers = markersRef.current;
    const layer = L.layerGroup().addTo(map);
    for (const p of filtered) {
      const label = REPORT_CATEGORY_LABELS[p.reportCategory];
      const marker = L.circleMarker([p.latitude, p.longitude], MARKER_STYLES[p.reportCategory])
        .bindTooltip(`${label}: ${p.locationDescription}`)
        .on("click", () => {
          focusDetailOnSelect.current = true;
          setSelectedId(p.id);
        })
        .addTo(layer);
      markers.set(p.id, marker);
    }
    return () => {
      layer.remove();
      markers.clear();
    };
  }, [handle, filtered]);

  // Highlight the selected pin with a black halo (a non-color cue).
  useEffect(() => {
    if (!handle || !selected) return;
    const halo = handle.L.circleMarker([selected.latitude, selected.longitude], {
      radius: 15,
      weight: 3,
      color: "#000000",
      fill: false,
      interactive: false,
    }).addTo(handle.map);
    markersRef.current.get(selected.id)?.bringToFront();
    return () => {
      halo.remove();
    };
  }, [handle, selected]);

  // Move focus to the detail panel after a user selection so keyboard and
  // screen-reader users land on the details they asked for.
  useEffect(() => {
    if (selected && focusDetailOnSelect.current) {
      focusDetailOnSelect.current = false;
      detailHeadingRef.current?.focus();
    }
  }, [selected]);

  function selectFromList(p: MapPothole) {
    focusDetailOnSelect.current = true;
    setSelectedId(p.id);
    if (handle) {
      handle.map.setView([p.latitude, p.longitude], Math.max(handle.map.getZoom(), 15));
    }
  }

  function clearFilters() {
    setStatus("all");
    setFrom("");
    setTo("");
  }

  const filtersActive = status !== "all" || from !== "" || to !== "";

  return (
    <div className="explorer">
      <div className="explorer-side">
        <form className="filters" onSubmit={(e) => e.preventDefault()}>
          <fieldset>
            <legend>Filter potholes</legend>
            <div className="field">
              <label htmlFor={`${ids}-status`}>Reporting status</label>
              <select
                id={`${ids}-status`}
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
              >
                <option value="all">All statuses</option>
                {REPORT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {REPORT_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <div className="field">
                <label htmlFor={`${ids}-from`}>Observed from</label>
                <input
                  id={`${ids}-from`}
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-describedby={`${ids}-date-hint`}
                />
              </div>
              <div className="field">
                <label htmlFor={`${ids}-to`}>Observed to</label>
                <input
                  id={`${ids}-to`}
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  aria-describedby={`${ids}-date-hint`}
                />
              </div>
            </div>
            <p id={`${ids}-date-hint`} className="hint">
              Pacific time dates. Both dates are included.
            </p>
            {rangeInvalid && (
              <p role="alert" className="error">
                The &ldquo;from&rdquo; date is after the &ldquo;to&rdquo; date, so nothing can
                match.
              </p>
            )}
            <button
              type="button"
              className="secondary"
              onClick={clearFilters}
              disabled={!filtersActive}
            >
              Clear filters
            </button>
          </fieldset>
        </form>

        <h2 id={`${ids}-list-heading`} className="list-heading">
          Potholes
        </h2>
        <p role="status" aria-live="polite" className="result-count">
          Showing {filtered.length} of {potholes.length} {plural(potholes.length)}
        </p>

        {potholes.length === 0 ? (
          <p>No potholes have been published yet.</p>
        ) : filtered.length === 0 ? (
          <p>No potholes match these filters.</p>
        ) : (
          <ul className="explorer-list" aria-labelledby={`${ids}-list-heading`}>
            {filtered.map((p) => {
              const isSelected = p.id === selected?.id;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={isSelected ? "list-item selected" : "list-item"}
                    aria-pressed={isSelected}
                    onClick={() => selectFromList(p)}
                  >
                    <span className="list-item-title">
                      {p.isFixture && <span className="badge fixture">DEV FIXTURE</span>}{" "}
                      {p.locationDescription}
                    </span>
                    <span className="list-item-meta">
                      <span className={`swatch swatch-${p.reportCategory}`} aria-hidden="true" />
                      {REPORT_CATEGORY_LABELS[p.reportCategory]}
                    </span>
                    <span className="list-item-meta">Observed {p.observedLabel}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="explorer-main">
        <MapStatusMessages
          mapKey={mapKey}
          keyError={keyError}
          tileError={tileError}
          fallback="The filters, list, and details still work without it."
        />
        {mapKey && (
          <div
            ref={containerRef}
            className="map explorer-map"
            hidden={!mapUsable}
            role="region"
            aria-label="Map of published potholes. The list of potholes is the text alternative."
          />
        )}
        <ul className="map-legend" aria-label="Marker legend">
          {REPORT_CATEGORIES.map((c) => (
            <li key={c}>
              <span className={`swatch swatch-${c}`} aria-hidden="true" />
              {REPORT_CATEGORY_LABELS[c]}
            </li>
          ))}
          <li>
            <span className="swatch swatch-selected" aria-hidden="true" />
            Selected (black ring)
          </li>
        </ul>

        <section className="detail-panel" aria-labelledby={`${ids}-detail-heading`}>
          {selected ? (
            <PotholeDetail
              pothole={selected}
              headingId={`${ids}-detail-heading`}
              headingRef={detailHeadingRef}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <>
              <h2 id={`${ids}-detail-heading`}>Pothole details</h2>
              <p className="hint">
                Select a pothole from the list{mapUsable ? " or the map" : ""} to see its photo and
                status.
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function PotholeDetail({
  pothole: p,
  headingId,
  headingRef,
  onClose,
}: {
  pothole: MapPothole;
  headingId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
}) {
  return (
    <>
      <div className="detail-header">
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>
          {p.locationDescription}
        </h2>
        <button type="button" className="secondary" onClick={onClose}>
          Close details
        </button>
      </div>
      {p.isFixture && (
        <p>
          <span className="badge fixture">DEV FIXTURE: not a real report</span>
        </p>
      )}

      {/* Plain <img>: the photo route is access-checked and must not be
          fetched or cached by the image optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={p.id}
        className="detail-photo"
        src={p.photoUrl}
        alt={`Evidence photo: ${p.locationDescription}`}
        width={400}
        height={300}
      />

      <dl className="detail-list">
        {p.laneDirection && (
          <>
            <dt>Lane / direction</dt>
            <dd>{p.laneDirection}</dd>
          </>
        )}
        <dt>Observed</dt>
        <dd>{p.observedLabel}</dd>
        <dt>Coordinates</dt>
        <dd className="mono">
          {p.latitude}, {p.longitude}
        </dd>
        <dt>Review status</dt>
        <dd>Verified by reviewer</dd>
        <dt>City reporting status</dt>
        <dd>
          <span className={`swatch swatch-${p.reportCategory}`} aria-hidden="true" />
          {REPORT_CATEGORY_LABELS[p.reportCategory]}
          {p.reportCategory === "reported" && (
            <>
              <br />
              Submitted: {p.submittedLabel ?? "date not recorded"}
              <br />
              City request:{" "}
              {p.cityRequestUrl ? (
                <a href={p.cityRequestUrl} target="_blank" rel="noopener noreferrer">
                  {p.cityRequestId ?? "view on the city site"}
                </a>
              ) : p.cityRequestId ? (
                p.cityRequestId
              ) : (
                "none was shown by the city."
              )}
            </>
          )}
          {p.reportCategory === "unconfirmed" && (
            <span className="hint detail-note">
              A report was attempted, but the city&apos;s receipt has not been confirmed. It is not
              counted as reported.
            </span>
          )}
        </dd>
      </dl>
      <p className="hint">
        Reported does not mean repaired. This site does not track the city&apos;s repair work.
      </p>
    </>
  );
}
