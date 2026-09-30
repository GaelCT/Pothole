import "server-only";
import { randomUUID } from "node:crypto";
import type { PotholeRow, ReportStatus, ReviewStatus } from "./db-core.ts";
import { getDb } from "./db.ts";
import { getConfig } from "./config.ts";
import { deletePhoto, writePhoto } from "./photo-files.ts";
import { distanceMeters, publicBlockers } from "./review-rules.ts";

/**
 * The single definition of "visible to the public". Everything public (the
 * list API, photo access, and the maps) must go through this rule. It is the
 * SQL form of publicBlockers() in review-rules.ts; keep the two in step.
 *
 * - verified, not a duplicate, pin confirmed by the reviewer
 * - explicitly published
 * - explicitly NOT a private city request (NULL = undecided = hidden)
 * - a reviewed, metadata-stripped photo copy exists
 * - in production, never a development fixture
 */
function publicWhere(): string {
  const base = `review_status = 'verified'
    AND duplicate_of IS NULL
    AND location_verified = 1
    AND publish_on_map = 1
    AND keep_city_request_private = 0
    AND redacted_photo_path IS NOT NULL
    AND photo_reviewed = 1`;
  return getConfig().isProduction ? `${base} AND is_fixture = 0` : base;
}

export function isPubliclyVisible(row: PotholeRow): boolean {
  return publicBlockers(row, getConfig().isProduction).length === 0;
}

/** Fields safe to show anonymous visitors. No paths, snapshots, or receipts. */
export type PublicPothole = {
  id: string;
  latitude: number;
  longitude: number;
  locationDescription: string;
  laneDirection: string | null;
  observedAt: string;
  reportStatus: ReportStatus;
  submittedAt: string | null;
  /** Only what the city actually displayed; null otherwise. Never invented. */
  cityRequestId: string | null;
  cityRequestUrl: string | null;
  photoUrl: string;
  isFixture: boolean;
};

function toPublic(row: PotholeRow): PublicPothole {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    locationDescription: row.location_description,
    laneDirection: row.lane_direction,
    observedAt: row.observed_at,
    reportStatus: row.report_status,
    submittedAt: row.submitted_at,
    cityRequestId: row.city_request_id,
    cityRequestUrl: row.city_request_url,
    photoUrl: `/api/photos/${row.id}`,
    isFixture: row.is_fixture === 1,
  };
}

export function listPublicPotholes(): PublicPothole[] {
  const rows = getDb()
    .prepare(`SELECT * FROM potholes WHERE ${publicWhere()} ORDER BY observed_at DESC`)
    .all() as PotholeRow[];
  return rows.map(toPublic);
}

/**
 * Public records the operator has confirmed as submitted to the city.
 * "Outcome unknown" is not included: an unconfirmed attempt is not a report.
 */
export function listReportedPublicPotholes(): PublicPothole[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM potholes
       WHERE ${publicWhere()} AND report_status = 'submitted'
       ORDER BY submitted_at DESC`,
    )
    .all() as PotholeRow[];
  return rows.map(toPublic);
}

export type AdminPothole = {
  id: string;
  latitude: number;
  longitude: number;
  locationDescription: string;
  laneDirection: string | null;
  observedAt: string;
  reviewStatus: ReviewStatus;
  duplicateOf: string | null;
  locationVerified: boolean;
  cityServiceVerified: boolean;
  publishOnMap: boolean;
  keepCityRequestPrivate: boolean | null;
  reportStatus: ReportStatus;
  isFixture: boolean;
  isPublic: boolean;
  /** Admin-only URL of the original upload. */
  photoUrl: string;
  hasReviewedPhoto: boolean;
  createdAt: string;
  updatedAt: string;
};

function toAdmin(row: PotholeRow): AdminPothole {
  return {
    id: row.id,
    latitude: row.latitude,
    longitude: row.longitude,
    locationDescription: row.location_description,
    laneDirection: row.lane_direction,
    observedAt: row.observed_at,
    reviewStatus: row.review_status,
    duplicateOf: row.duplicate_of,
    locationVerified: row.location_verified === 1,
    cityServiceVerified: row.city_service_verified === 1,
    publishOnMap: row.publish_on_map === 1,
    keepCityRequestPrivate:
      row.keep_city_request_private === null ? null : row.keep_city_request_private === 1,
    reportStatus: row.report_status,
    isFixture: row.is_fixture === 1,
    isPublic: isPubliclyVisible(row),
    photoUrl: `/api/photos/${row.id}?variant=original`,
    hasReviewedPhoto: row.redacted_photo_path !== null && row.photo_reviewed === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type NearbyPothole = {
  id: string;
  latitude: number;
  longitude: number;
  locationDescription: string;
  reviewStatus: ReviewStatus;
  duplicateOf: string | null;
  distanceMeters: number;
  photoUrl: string;
  isFixture: boolean;
};

/**
 * Other records within `radiusMeters`, nearest first, for duplicate review.
 * Shown to the reviewer only; nothing is merged automatically, because two
 * nearby potholes can be distinct.
 */
export function listNearbyPotholes(row: PotholeRow, radiusMeters = 150): NearbyPothole[] {
  // Coarse bounding box in SQL, exact distance in JS.
  const dLat = radiusMeters / 111_000;
  const dLon = radiusMeters / (111_000 * Math.max(0.1, Math.cos((row.latitude * Math.PI) / 180)));
  const candidates = getDb()
    .prepare(
      `SELECT * FROM potholes
       WHERE id <> ? AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?`,
    )
    .all(
      row.id,
      row.latitude - dLat,
      row.latitude + dLat,
      row.longitude - dLon,
      row.longitude + dLon,
    ) as PotholeRow[];
  return candidates
    .map((c) => ({ c, d: distanceMeters(row, c) }))
    .filter(({ d }) => d <= radiusMeters)
    .sort((a, b) => a.d - b.d)
    .map(({ c, d }) => ({
      id: c.id,
      latitude: c.latitude,
      longitude: c.longitude,
      locationDescription: c.location_description,
      reviewStatus: c.review_status,
      duplicateOf: c.duplicate_of,
      distanceMeters: Math.round(d),
      photoUrl: `/api/photos/${c.id}?variant=original`,
      isFixture: c.is_fixture === 1,
    }));
}

export function listDuplicatesOf(id: string): { id: string; locationDescription: string }[] {
  return (
    getDb()
      .prepare("SELECT id, location_description FROM potholes WHERE duplicate_of = ? ORDER BY created_at")
      .all(id) as { id: string; location_description: string }[]
  ).map((r) => ({ id: r.id, locationDescription: r.location_description }));
}

/** Admin only. Callers must have authorized the request. */
export function listAllPotholesForAdmin(): AdminPothole[] {
  const rows = getDb()
    .prepare("SELECT * FROM potholes ORDER BY created_at DESC")
    .all() as PotholeRow[];
  return rows.map(toAdmin);
}

export function getPotholeRow(id: string): PotholeRow | undefined {
  return getDb().prepare("SELECT * FROM potholes WHERE id = ?").get(id) as
    | PotholeRow
    | undefined;
}

export type NewPothole = {
  latitude: number;
  longitude: number;
  locationDescription: string;
  laneDirection: string | null;
  observedAt: string;
  photoBytes: Uint8Array;
};

/**
 * Create a record in the review queue. New records always start unreviewed,
 * unpublished, and with the privacy decision unmade; Stage 4 review is the
 * only way to change that.
 */
export function createPothole(input: NewPothole): string {
  const { dataDir } = getConfig();
  const id = randomUUID();
  const photoPath = writePhoto(dataDir, input.photoBytes, id);
  const now = new Date().toISOString();
  try {
    getDb()
      .prepare(
        `INSERT INTO potholes (
           id, latitude, longitude, location_description, lane_direction,
           observed_at, photo_path, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.latitude,
        input.longitude,
        input.locationDescription,
        input.laneDirection,
        input.observedAt,
        photoPath,
        now,
        now,
      );
  } catch (err) {
    // Do not leave an orphaned photo behind a failed insert.
    deletePhoto(dataDir, photoPath);
    throw err;
  }
  return id;
}
