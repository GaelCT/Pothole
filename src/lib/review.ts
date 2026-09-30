import "server-only";
import type { PotholeRow, ReviewStatus } from "./db-core.ts";
import { getDb } from "./db.ts";
import { getConfig } from "./config.ts";
import { deletePhoto, readPhoto, writePhoto } from "./photo-files.ts";
import { orientedSize, renderRedactedCopy, sha256Hex } from "./photo-processing.ts";
import {
  approvalBlockers,
  buildSnapshot,
  editLockReason,
  parseRedactionBoxes,
} from "./review-rules.ts";

/**
 * Every Stage 4 write goes through this module. Rules:
 * - locked records (filing started) are never changed
 * - any change to what would be filed clears the approval
 * - checks are repeated inside the write transaction, so two tabs cannot
 *   race past them
 * Callers (server actions) must have authorized the admin first.
 */

export type ReviewResult = { ok: true; message: string } | { ok: false; error: string };

const ok = (message: string): ReviewResult => ({ ok: true, message });
const fail = (error: string): ReviewResult => ({ ok: false, error });

class ReviewError extends Error {}

function loadForWrite(id: string): PotholeRow {
  const row = getDb().prepare("SELECT * FROM potholes WHERE id = ?").get(id) as PotholeRow | undefined;
  if (!row) throw new ReviewError("That record does not exist.");
  const lock = editLockReason(row);
  if (lock) throw new ReviewError(lock);
  return row;
}

const CLEAR_APPROVAL = `
  approved_snapshot = NULL,
  approved_at = NULL,
  report_status = CASE WHEN report_status = 'approved_for_filing' THEN 'not_sent' ELSE report_status END`;

const approvalNote = (row: PotholeRow) =>
  row.approved_snapshot ? " The earlier approval was cleared; approve the draft again." : "";

/** Run a synchronous write transaction, turning ReviewError into a result. */
function write(fn: () => string): ReviewResult {
  try {
    return ok(getDb().transaction(fn)());
  } catch (err) {
    if (err instanceof ReviewError) return fail(err.message);
    throw err;
  }
}

// ---------------------------------------------------------------------------

export type DetailsInput = {
  latitude: number;
  longitude: number;
  locationDescription: string;
  laneDirection: string | null;
};

export function updateDetails(id: string, input: DetailsInput): ReviewResult {
  return write(() => {
    const row = loadForWrite(id);
    const moved = row.latitude !== input.latitude || row.longitude !== input.longitude;
    const changed =
      moved ||
      row.location_description !== input.locationDescription ||
      row.lane_direction !== input.laneDirection;
    if (!changed) return "No changes to save.";
    getDb()
      .prepare(
        `UPDATE potholes SET
           latitude = ?, longitude = ?, location_description = ?, lane_direction = ?,
           location_verified = CASE WHEN ? THEN 0 ELSE location_verified END,
           ${CLEAR_APPROVAL}, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.latitude,
        input.longitude,
        input.locationDescription,
        input.laneDirection,
        moved ? 1 : 0,
        new Date().toISOString(),
        id,
      );
    return (
      "Details saved." +
      (moved ? " The pin moved, so confirm the location again." : "") +
      approvalNote(row)
    );
  });
}

// ---------------------------------------------------------------------------

export type DecisionsInput = {
  reviewStatus: Exclude<ReviewStatus, "duplicate">;
  locationVerified: boolean;
  cityServiceVerified: boolean;
  publishOnMap: boolean;
  keepCityRequestPrivate: boolean | null;
};

export function updateDecisions(id: string, input: DecisionsInput): ReviewResult {
  return write(() => {
    const row = loadForWrite(id);
    if (row.review_status === "duplicate") {
      throw new ReviewError("Unlink this duplicate before changing its review decisions.");
    }
    const b = (v: boolean) => (v ? 1 : 0);
    const priv = input.keepCityRequestPrivate === null ? null : b(input.keepCityRequestPrivate);
    const affectsReport =
      row.review_status !== input.reviewStatus ||
      row.location_verified !== b(input.locationVerified) ||
      row.city_service_verified !== b(input.cityServiceVerified) ||
      row.keep_city_request_private !== priv;
    const affectsMap = row.publish_on_map !== b(input.publishOnMap);
    if (!affectsReport && !affectsMap) return "No changes to save.";
    getDb()
      .prepare(
        `UPDATE potholes SET
           review_status = ?, location_verified = ?, city_service_verified = ?,
           publish_on_map = ?, keep_city_request_private = ?,
           ${affectsReport ? `${CLEAR_APPROVAL},` : ""} updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.reviewStatus,
        b(input.locationVerified),
        b(input.cityServiceVerified),
        b(input.publishOnMap),
        priv,
        new Date().toISOString(),
        id,
      );
    return "Review decisions saved." + (affectsReport ? approvalNote(row) : "");
  });
}

// ---------------------------------------------------------------------------

export function markDuplicate(id: string, canonicalId: string): ReviewResult {
  return write(() => {
    const row = loadForWrite(id);
    if (canonicalId === id) throw new ReviewError("A record cannot be a duplicate of itself.");
    const canonical = getDb().prepare("SELECT * FROM potholes WHERE id = ?").get(canonicalId) as
      | PotholeRow
      | undefined;
    if (!canonical) throw new ReviewError("The main record does not exist.");
    if (canonical.duplicate_of !== null) {
      throw new ReviewError("That record is itself a duplicate. Link to its main record instead.");
    }
    if (canonical.review_status === "rejected") {
      throw new ReviewError("A rejected record cannot be the main record.");
    }
    const dependents = getDb()
      .prepare("SELECT COUNT(*) FROM potholes WHERE duplicate_of = ?")
      .pluck()
      .get(id) as number;
    if (dependents > 0) {
      throw new ReviewError(
        `${dependents} other record(s) are linked to this one as duplicates. Unlink them first, or mark the other record as the duplicate instead.`,
      );
    }
    getDb()
      .prepare(
        `UPDATE potholes SET review_status = 'duplicate', duplicate_of = ?, publish_on_map = 0,
           ${CLEAR_APPROVAL}, updated_at = ?
         WHERE id = ?`,
      )
      .run(canonicalId, new Date().toISOString(), id);
    return "Linked as a duplicate. It is hidden from the map and cannot be reported." + approvalNote(row);
  });
}

export function unlinkDuplicate(id: string): ReviewResult {
  return write(() => {
    const row = loadForWrite(id);
    if (row.review_status !== "duplicate") throw new ReviewError("This record is not a duplicate.");
    getDb()
      .prepare(
        `UPDATE potholes SET review_status = 'needs_review', duplicate_of = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(new Date().toISOString(), id);
    return "Unlinked. The record is back in the review queue.";
  });
}

// ---------------------------------------------------------------------------

export async function saveRedaction(
  id: string,
  rawBoxes: unknown,
  confirmedReviewed: boolean,
): Promise<ReviewResult> {
  const { dataDir } = getConfig();
  const before = getPotholeForRead(id);
  if (!before) return fail("That record does not exist.");
  const lock = editLockReason(before);
  if (lock) return fail(lock);

  const original = readPhoto(dataDir, before.photo_path).bytes;
  const size = await orientedSize(original);
  const parsed = parseRedactionBoxes(rawBoxes, size.width, size.height);
  if (!parsed.ok) return fail(parsed.error);

  const rendered = await renderRedactedCopy(original, parsed.boxes);
  const newFile = writePhoto(dataDir, rendered);

  let oldFile: string | null = null;
  const result = write(() => {
    const row = loadForWrite(id);
    if (row.photo_path !== before.photo_path) {
      throw new ReviewError("The original photo changed while saving. Try again.");
    }
    oldFile = row.redacted_photo_path;
    getDb()
      .prepare(
        `UPDATE potholes SET redacted_photo_path = ?, redaction_boxes = ?, photo_reviewed = ?,
           ${CLEAR_APPROVAL}, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        newFile,
        JSON.stringify(parsed.boxes),
        confirmedReviewed ? 1 : 0,
        new Date().toISOString(),
        id,
      );
    const count = parsed.boxes.length;
    return (
      `Photo copy saved with ${count} black box${count === 1 ? "" : "es"} and all metadata removed.` +
      (confirmedReviewed ? "" : " Confirm the review before it can be published or approved.") +
      approvalNote(row)
    );
  });

  // Only the committed copy may remain on disk.
  if (result.ok && oldFile) deletePhoto(dataDir, oldFile);
  if (!result.ok) deletePhoto(dataDir, newFile);
  return result;
}

// ---------------------------------------------------------------------------

export function approveDraft(id: string): ReviewResult {
  const { dataDir, isProduction } = getConfig();
  return write(() => {
    const row = loadForWrite(id);
    if (row.report_status === "approved_for_filing") {
      throw new ReviewError("This draft is already approved.");
    }
    const blockers = approvalBlockers(row, isProduction);
    if (blockers.length > 0) {
      throw new ReviewError(`Not approved: ${blockers.join(" ")}`);
    }
    const sha = sha256Hex(readPhoto(dataDir, row.redacted_photo_path!).bytes);
    const snapshot = buildSnapshot(row, sha);
    getDb()
      .prepare(
        `UPDATE potholes SET approved_snapshot = ?, approved_at = ?,
           report_status = 'approved_for_filing', updated_at = ?
         WHERE id = ?`,
      )
      .run(JSON.stringify(snapshot), new Date().toISOString(), new Date().toISOString(), id);
    return "Draft approved for filing. Any later edit will clear this approval.";
  });
}

export function revokeApproval(id: string): ReviewResult {
  return write(() => {
    const row = loadForWrite(id);
    if (row.report_status !== "approved_for_filing") {
      throw new ReviewError("This draft is not approved.");
    }
    getDb()
      .prepare(`UPDATE potholes SET ${CLEAR_APPROVAL}, updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);
    return "Approval withdrawn.";
  });
}

function getPotholeForRead(id: string): PotholeRow | undefined {
  return getDb().prepare("SELECT * FROM potholes WHERE id = ?").get(id) as PotholeRow | undefined;
}
