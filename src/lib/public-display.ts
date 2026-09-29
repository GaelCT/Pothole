import "server-only";
import type { PublicPothole } from "./potholes.ts";
import { reportCategoryFor, type MapPothole } from "./map-pothole.ts";

/**
 * Server-side display helpers shared by the public pages. Formatting happens
 * here, in Bakersfield local time, so every visitor sees the same text and
 * the client never re-renders dates differently.
 */
const TIME_ZONE = "America/Los_Angeles";

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  dateStyle: "medium",
  timeStyle: "short",
});

const datePartsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** "Sep 20, 2026, 8:15 AM Pacific", or null for a missing/unparseable value. */
export function formatPacificDateTime(iso: string | null): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : `${dateTimeFormat.format(time)} Pacific`;
}

/** Pacific calendar date as YYYY-MM-DD (comparable as a string), or null. */
export function pacificDateKey(iso: string | null): string | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const parts = Object.fromEntries(
    datePartsFormat.formatToParts(time).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Only http(s) links are rendered; anything else is dropped, not rewritten. */
export function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The MapTiler key is public by design (it ships to the browser); restrict it
 * to this site's domains in the MapTiler dashboard. Read per request.
 */
export function getMapTilerKey(): string | null {
  return process.env.MAPTILER_KEY?.trim() || null;
}

export function toMapPothole(p: PublicPothole): MapPothole {
  const reportCategory = reportCategoryFor(p.reportStatus);
  const reported = reportCategory === "reported";
  return {
    id: p.id,
    latitude: p.latitude,
    longitude: p.longitude,
    locationDescription: p.locationDescription,
    laneDirection: p.laneDirection,
    observedLabel: formatPacificDateTime(p.observedAt) ?? p.observedAt,
    observedDate: pacificDateKey(p.observedAt),
    reportCategory,
    // City details are only meaningful once a report is confirmed.
    submittedLabel: reported ? formatPacificDateTime(p.submittedAt) : null,
    cityRequestId: reported ? p.cityRequestId : null,
    cityRequestUrl: reported ? safeHttpUrl(p.cityRequestUrl) : null,
    photoUrl: p.photoUrl,
    isFixture: p.isFixture,
  };
}
