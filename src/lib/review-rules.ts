/**
 * Review, publication, and approval rules. Pure functions, no I/O, no
 * server-only imports: the server actions, the review page, and the seed
 * script all apply exactly the same rules.
 */
import type { PotholeRow, ReportStatus } from "./db-core.ts";

// ---------------------------------------------------------------------------
// Editing lock

/**
 * Once filing has started, the record describes what was (or may have been)
 * sent to the city, so it can no longer be edited here.
 */
const LOCKED_REPORT_STATUSES: readonly ReportStatus[] = ["filing", "submitted", "outcome_unknown"];

export function editLockReason(row: Pick<PotholeRow, "report_status">): string | null {
  return LOCKED_REPORT_STATUSES.includes(row.report_status)
    ? "This record is locked because city filing has started. It can no longer be edited."
    : null;
}

// ---------------------------------------------------------------------------
// Redaction boxes

/** A solid black rectangle, in pixels of the auto-oriented original photo. */
export type RedactionBox = { x: number; y: number; width: number; height: number };

export const MAX_REDACTION_BOXES = 50;

/** Validate untrusted boxes against the photo size. Returns the boxes or an error. */
export function parseRedactionBoxes(
  raw: unknown,
  imageWidth: number,
  imageHeight: number,
): { ok: true; boxes: RedactionBox[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Redaction boxes must be a list." };
  if (raw.length > MAX_REDACTION_BOXES) {
    return { ok: false, error: `At most ${MAX_REDACTION_BOXES} boxes are allowed.` };
  }
  const boxes: RedactionBox[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      return { ok: false, error: "Each redaction box must have x, y, width and height." };
    }
    const { x, y, width, height } = item as Record<string, unknown>;
    const values = [x, y, width, height];
    if (!values.every((v) => typeof v === "number" && Number.isInteger(v))) {
      return { ok: false, error: "Redaction box values must be whole pixels." };
    }
    const box = { x, y, width, height } as RedactionBox;
    if (box.x < 0 || box.y < 0 || box.width < 1 || box.height < 1) {
      return { ok: false, error: "Redaction boxes must have a positive size inside the photo." };
    }
    if (box.x + box.width > imageWidth || box.y + box.height > imageHeight) {
      return { ok: false, error: "A redaction box extends outside the photo." };
    }
    boxes.push(box);
  }
  return { ok: true, boxes };
}

// ---------------------------------------------------------------------------
// Public visibility (mirrors publicWhere() in potholes.ts; keep them in step)

export function publicBlockers(row: PotholeRow, isProduction: boolean): string[] {
  const reasons: string[] = [];
  if (row.review_status !== "verified") reasons.push("The record is not verified.");
  if (row.duplicate_of !== null) reasons.push("The record is a duplicate; only its main record is shown.");
  if (row.location_verified !== 1) reasons.push("The pin location is not confirmed.");
  if (row.publish_on_map !== 1) reasons.push("“Publish on map” is off.");
  if (row.keep_city_request_private === null) {
    reasons.push("The privacy decision has not been made.");
  } else if (row.keep_city_request_private === 1) {
    reasons.push("The city request is private, so the record stays off the public map.");
  }
  if (row.redacted_photo_path === null) reasons.push("No reviewed photo copy has been saved.");
  if (row.photo_reviewed !== 1) reasons.push("The photo review has not been confirmed.");
  if (isProduction && row.is_fixture === 1) reasons.push("Development fixtures are never public in production.");
  return reasons;
}

// ---------------------------------------------------------------------------
// Report approval

export function approvalBlockers(row: PotholeRow, isProduction: boolean): string[] {
  const reasons: string[] = [];
  const lock = editLockReason(row);
  if (lock) reasons.push(lock);
  if (row.review_status === "duplicate") {
    reasons.push("Duplicates cannot be reported; the main record carries the report.");
  } else if (row.review_status !== "verified") {
    reasons.push("Mark the record verified.");
  }
  if (row.location_verified !== 1) reasons.push("Confirm the pin marks the pothole itself.");
  if (row.city_service_verified !== 1) {
    reasons.push("Confirm the road is maintained by the City of Bakersfield.");
  }
  if (row.keep_city_request_private === null) {
    reasons.push("Decide whether the city request should be kept private.");
  }
  if (row.redacted_photo_path === null) reasons.push("Save the reviewed photo copy.");
  if (row.photo_reviewed !== 1) {
    reasons.push("Confirm no identifiable faces or license plates remain in the photo.");
  }
  if (isProduction && row.is_fixture === 1) {
    reasons.push("Development fixtures can never be approved in production.");
  }
  return reasons;
}

// ---------------------------------------------------------------------------
// Report description (build plan section 6). Deterministic; no LLM.

const observedFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const withoutTrailingPeriod = (text: string) => text.trim().replace(/[.\s]+$/, "");

export function buildReportDescription(input: {
  observedAt: string;
  locationDescription: string;
  laneDirection: string | null;
  latitude: number;
  longitude: number;
}): string {
  const time = Date.parse(input.observedAt);
  if (Number.isNaN(time)) throw new Error(`Invalid observation time: ${input.observedAt}`);
  const sentences = [
    `Pothole observed on ${observedFormat.format(time)} at ${withoutTrailingPeriod(input.locationDescription)}.`,
  ];
  // Lane information only when the reviewer supplied it; never guessed.
  if (input.laneDirection && input.laneDirection.trim()) {
    sentences.push(`${withoutTrailingPeriod(input.laneDirection)}.`);
  }
  sentences.push(`Location: ${input.latitude}, ${input.longitude}.`);
  sentences.push("Photo attached.");
  sentences.push("Please inspect the roadway condition.");
  return sentences.join(" ");
}

// ---------------------------------------------------------------------------
// Approval snapshot

/**
 * Exactly what was approved for filing. The city's report-type option has not
 * been confirmed (Stage 1, U1), so it is recorded as null and the operator
 * picks the pothole category on the live form.
 */
export type ReportSnapshot = {
  version: 1;
  potholeId: string;
  reportType: null;
  latitude: number;
  longitude: number;
  locationDescription: string;
  laneDirection: string | null;
  observedAt: string;
  details: string;
  photoFile: string;
  photoSha256: string;
  keepCityRequestPrivate: boolean;
  isFixture: boolean;
};

export function buildSnapshot(row: PotholeRow, photoSha256: string): ReportSnapshot {
  if (row.redacted_photo_path === null) throw new Error("No reviewed photo copy to approve.");
  if (row.keep_city_request_private === null) throw new Error("Privacy decision missing.");
  return {
    version: 1,
    potholeId: row.id,
    reportType: null,
    latitude: row.latitude,
    longitude: row.longitude,
    locationDescription: row.location_description,
    laneDirection: row.lane_direction,
    observedAt: row.observed_at,
    details: buildReportDescription({
      observedAt: row.observed_at,
      locationDescription: row.location_description,
      laneDirection: row.lane_direction,
      latitude: row.latitude,
      longitude: row.longitude,
    }),
    photoFile: row.redacted_photo_path,
    photoSha256,
    keepCityRequestPrivate: row.keep_city_request_private === 1,
    isFixture: row.is_fixture === 1,
  };
}

export function parseSnapshot(json: string | null): ReportSnapshot | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<ReportSnapshot>;
    return value.version === 1 ? (value as ReportSnapshot) : null;
  } catch {
    return null;
  }
}

/**
 * Does the approval still describe the current record and photo bytes?
 * Compares the source fields (not the formatted text) plus the photo hash.
 */
export function snapshotMatches(
  snapshot: ReportSnapshot,
  row: PotholeRow,
  currentPhotoSha256: string | null,
): boolean {
  return (
    snapshot.potholeId === row.id &&
    snapshot.latitude === row.latitude &&
    snapshot.longitude === row.longitude &&
    snapshot.locationDescription === row.location_description &&
    snapshot.laneDirection === row.lane_direction &&
    snapshot.observedAt === row.observed_at &&
    snapshot.photoFile === row.redacted_photo_path &&
    currentPhotoSha256 !== null &&
    snapshot.photoSha256 === currentPhotoSha256 &&
    row.keep_city_request_private !== null &&
    snapshot.keepCityRequestPrivate === (row.keep_city_request_private === 1)
  );
}

// ---------------------------------------------------------------------------
// Distance (for showing nearby records during duplicate review)

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
