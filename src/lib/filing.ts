import "server-only";
import { randomUUID } from "node:crypto";
import type { PotholeRow, ReportAttemptRow } from "./db-core.ts";
import { getDb } from "./db.ts";
import { getConfig } from "./config.ts";
import { deletePhoto, PhotoError, readPhoto, writePhoto } from "./photo-files.ts";
import { sha256Hex } from "./photo-processing.ts";
import { approvalBlockers, parseSnapshot, snapshotMatches } from "./review-rules.ts";
import type { ReviewResult } from "./review.ts";

/**
 * Stage 5: manual filing. The operator files each report by hand on the city
 * site; this module only tracks what they did (build plan section 7).
 *
 * Lifecycle of a pothole's report_status:
 *   approved_for_filing --start--> filing
 *   filing --submitted/existing--> submitted     (final)
 *   filing --unknown-->            outcome_unknown
 *   filing --abandoned-->          approved_for_filing
 *   outcome_unknown --submitted/existing--> submitted
 *   outcome_unknown --abandoned (history checked)--> approved_for_filing
 *
 * The unique partial index on report_attempts allows at most one attempt that
 * is in_progress or outcome_unknown per pothole, so a double click, a second
 * tab, or an unreconciled unknown outcome can never open a second attempt.
 * Nothing here ever retries or contacts the city.
 */

export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const EXISTING_NOTE = "Linked to an existing city request; no new report was filed.";

class FilingError extends Error {}

function write(fn: () => string): ReviewResult {
  try {
    return { ok: true, message: getDb().transaction(fn)() };
  } catch (err) {
    if (err instanceof FilingError) return { ok: false, error: err.message };
    if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") {
      return { ok: false, error: "A filing attempt is already open for this record." };
    }
    throw err;
  }
}

function loadRow(id: string): PotholeRow {
  const row = getDb().prepare("SELECT * FROM potholes WHERE id = ?").get(id) as PotholeRow | undefined;
  if (!row) throw new FilingError("That record does not exist.");
  return row;
}

export function getOpenAttempt(potholeId: string): ReportAttemptRow | undefined {
  return getDb()
    .prepare(
      `SELECT * FROM report_attempts
       WHERE pothole_id = ? AND outcome IN ('in_progress', 'outcome_unknown')`,
    )
    .get(potholeId) as ReportAttemptRow | undefined;
}

export function listAttemptsFor(potholeId: string): ReportAttemptRow[] {
  return getDb()
    .prepare("SELECT * FROM report_attempts WHERE pothole_id = ? ORDER BY started_at DESC")
    .all(potholeId) as ReportAttemptRow[];
}

export function getAttempt(attemptId: string): ReportAttemptRow | undefined {
  return getDb().prepare("SELECT * FROM report_attempts WHERE id = ?").get(attemptId) as
    | ReportAttemptRow
    | undefined;
}

export type HistoryEntry = ReportAttemptRow & { location_description: string; is_fixture: 0 | 1 };

export function listAllAttempts(): HistoryEntry[] {
  return getDb()
    .prepare(
      `SELECT a.*, p.location_description, p.is_fixture
       FROM report_attempts a JOIN potholes p ON p.id = a.pothole_id
       ORDER BY a.started_at DESC`,
    )
    .all() as HistoryEntry[];
}

export function listByReportStatus(status: PotholeRow["report_status"]): PotholeRow[] {
  return getDb()
    .prepare("SELECT * FROM potholes WHERE report_status = ? ORDER BY updated_at DESC")
    .all(status) as PotholeRow[];
}

/** Why "Start filing" is not available right now, or null if it is. */
export function startBlockers(row: PotholeRow): string[] {
  const { dataDir, isProduction } = getConfig();
  if (row.report_status === "filing" || row.report_status === "outcome_unknown") {
    return ["Filing has already started for this record."];
  }
  if (row.report_status === "submitted") return ["This record has already been reported to the city."];
  if (row.report_status !== "approved_for_filing") {
    return ["Approve the draft on the review page first."];
  }
  const reasons = approvalBlockers(row, isProduction);
  const snapshot = parseSnapshot(row.approved_snapshot);
  let sha: string | null = null;
  try {
    sha = row.redacted_photo_path ? sha256Hex(readPhoto(dataDir, row.redacted_photo_path).bytes) : null;
  } catch (err) {
    if (!(err instanceof PhotoError)) throw err;
  }
  if (!snapshot || !snapshotMatches(snapshot, row, sha)) {
    reasons.push("The approval no longer matches this record or its photo. Approve the draft again.");
  }
  return reasons;
}

export function startFiling(id: string): ReviewResult {
  return write(() => {
    const row = loadRow(id);
    const blockers = startBlockers(row);
    if (blockers.length > 0) throw new FilingError(blockers.join(" "));
    const now = new Date().toISOString();
    getDb()
      .prepare("INSERT INTO report_attempts (id, pothole_id, snapshot, started_at) VALUES (?, ?, ?, ?)")
      .run(randomUUID(), id, row.approved_snapshot, now);
    getDb()
      .prepare("UPDATE potholes SET report_status = 'filing', updated_at = ? WHERE id = ?")
      .run(now, id);
    return "Filing started. The record is locked until you record the outcome.";
  });
}

export type OutcomeInput =
  | {
      kind: "submitted";
      cityRequestId: string | null;
      cityRequestUrl: string | null;
      notes: string | null;
      receipt: Uint8Array | null;
      confirmed: boolean;
    }
  | {
      kind: "existing";
      cityRequestId: string | null;
      cityRequestUrl: string | null;
      notes: string | null;
      confirmed: boolean;
    }
  | { kind: "unknown"; notes: string | null }
  | { kind: "abandoned"; notes: string | null; confirmed: boolean };

const joinNotes = (...parts: (string | null)[]) => {
  const text = parts.filter((p): p is string => Boolean(p && p.trim())).join("\n");
  return text === "" ? null : text;
};

export function recordOutcome(id: string, input: OutcomeInput): ReviewResult {
  const { dataDir } = getConfig();

  // Validate what doesn't need the database before writing any file.
  if (input.kind !== "unknown" && !input.confirmed) {
    return { ok: false, error: "Tick the confirmation box first." };
  }
  if (input.kind === "existing" && !input.cityRequestId && !input.cityRequestUrl) {
    return { ok: false, error: "Enter the existing city request's number or link." };
  }
  let receiptFile: string | null = null;
  if (input.kind === "submitted" && input.receipt) {
    if (input.receipt.length > MAX_RECEIPT_BYTES) {
      return { ok: false, error: "The receipt screenshot must be 5 MB or smaller." };
    }
    try {
      receiptFile = writePhoto(dataDir, input.receipt);
    } catch (err) {
      if (err instanceof PhotoError) return { ok: false, error: `Receipt screenshot: ${err.message}` };
      throw err;
    }
  }

  const result = write(() => {
    const row = loadRow(id);
    const attempt = getOpenAttempt(id);
    if (!attempt) throw new FilingError("No filing attempt is open for this record. Start filing first.");
    const expected = attempt.outcome === "in_progress" ? "filing" : "outcome_unknown";
    if (row.report_status !== expected) {
      throw new FilingError("This record's filing state is inconsistent. Reload the page.");
    }
    const now = new Date().toISOString();
    const db = getDb();

    if (input.kind === "unknown") {
      if (attempt.outcome === "outcome_unknown") throw new FilingError("This attempt is already marked outcome unknown.");
      db.prepare(
        "UPDATE report_attempts SET outcome = 'outcome_unknown', finished_at = ?, notes = ? WHERE id = ?",
      ).run(now, joinNotes(attempt.notes, input.notes), attempt.id);
      db.prepare("UPDATE potholes SET report_status = 'outcome_unknown', updated_at = ? WHERE id = ?").run(now, id);
      return "Recorded as outcome unknown. Check the city's request history before doing anything else with this record.";
    }

    if (input.kind === "abandoned") {
      db.prepare(
        "UPDATE report_attempts SET outcome = 'abandoned', finished_at = COALESCE(finished_at, ?), notes = ? WHERE id = ?",
      ).run(now, joinNotes(attempt.notes, input.notes), attempt.id);
      db.prepare("UPDATE potholes SET report_status = 'approved_for_filing', updated_at = ? WHERE id = ?").run(now, id);
      return "Recorded as not sent. The approved draft is ready to file again.";
    }

    // submitted or existing
    const existing = input.kind === "existing";
    db.prepare(
      `UPDATE report_attempts SET outcome = 'submitted', finished_at = COALESCE(finished_at, ?),
         city_request_id = ?, city_request_url = ?, receipt_evidence = ?, notes = ?, linked_existing = ?
       WHERE id = ?`,
    ).run(
      now,
      input.cityRequestId,
      input.cityRequestUrl,
      receiptFile,
      joinNotes(attempt.notes, existing ? EXISTING_NOTE : null, input.notes),
      existing ? 1 : 0,
      attempt.id,
    );
    db.prepare(
      `UPDATE potholes SET report_status = 'submitted', submitted_at = ?, city_request_id = ?,
         city_request_url = ?, receipt_evidence = ?, updated_at = ?
       WHERE id = ?`,
    ).run(now, input.cityRequestId, input.cityRequestUrl, receiptFile, now, id);
    return existing
      ? "Linked to the existing city request. No new report was recorded as filed."
      : "Recorded as submitted to the city. Reported does not mean repaired.";
  });

  if (!result.ok && receiptFile) deletePhoto(dataDir, receiptFile);
  return result;
}
