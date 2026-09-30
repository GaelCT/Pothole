/**
 * Database core: schema, migrations, and shared row types.
 *
 * This module has no Next.js or `server-only` dependency so the CLI scripts in
 * `scripts/` can use the exact same schema as the web server. Relative imports
 * inside `src/lib` shared modules carry a `.ts` extension so Node's built-in
 * TypeScript support can run the scripts directly.
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const REVIEW_STATUSES = [
  "needs_review",
  "verified",
  "rejected",
  "duplicate",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/**
 * Manual-filing lifecycle (build plan section 7). Nothing in this project
 * operates the city's form; these states track what the operator did by hand.
 */
export const REPORT_STATUSES = [
  "not_sent",
  "approved_for_filing",
  "filing",
  "submitted",
  "blocked",
  "outcome_unknown",
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const ATTEMPT_OUTCOMES = [
  "in_progress",
  "submitted",
  "outcome_unknown",
  "abandoned",
] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

/** SQLite stores booleans as 0/1. */
export type SqlBool = 0 | 1;

export type PotholeRow = {
  id: string;
  latitude: number;
  longitude: number;
  location_description: string;
  lane_direction: string | null;
  observed_at: string;
  photo_path: string;
  review_status: ReviewStatus;
  duplicate_of: string | null;
  location_verified: SqlBool;
  city_service_verified: SqlBool;
  publish_on_map: SqlBool;
  /** NULL means the reviewer has not made this decision yet. */
  keep_city_request_private: SqlBool | null;
  report_status: ReportStatus;
  approved_snapshot: string | null;
  approved_at: string | null;
  city_request_id: string | null;
  city_request_url: string | null;
  receipt_evidence: string | null;
  submitted_at: string | null;
  is_fixture: SqlBool;
  created_at: string;
  updated_at: string;
  /** Metadata-stripped, black-box-redacted copy. The only file ever shown publicly or filed. */
  redacted_photo_path: string | null;
  /** JSON array of RedactionBox, in auto-oriented original-image pixels. */
  redaction_boxes: string | null;
  /** Reviewer confirmed no identifiable faces or plates remain in the redacted copy. */
  photo_reviewed: SqlBool;
};

export type ReportAttemptRow = {
  id: string;
  pothole_id: string;
  snapshot: string;
  started_at: string;
  finished_at: string | null;
  outcome: AttemptOutcome;
  city_request_id: string | null;
  city_request_url: string | null;
  receipt_evidence: string | null;
  notes: string | null;
};

const sqlList = (values: readonly string[]) =>
  values.map((v) => `'${v}'`).join(", ");

type Migration = { version: number; name: string; sql: string };

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "potholes and report_attempts",
    sql: `
      CREATE TABLE potholes (
        id                        TEXT PRIMARY KEY,
        latitude                  REAL NOT NULL CHECK (latitude BETWEEN -90 AND 90),
        longitude                 REAL NOT NULL CHECK (longitude BETWEEN -180 AND 180),
        location_description      TEXT NOT NULL CHECK (length(trim(location_description)) > 0),
        lane_direction            TEXT,
        observed_at               TEXT NOT NULL,
        photo_path                TEXT NOT NULL,
        review_status             TEXT NOT NULL DEFAULT 'needs_review'
                                  CHECK (review_status IN (${sqlList(REVIEW_STATUSES)})),
        duplicate_of              TEXT REFERENCES potholes(id),
        location_verified         INTEGER NOT NULL DEFAULT 0 CHECK (location_verified IN (0, 1)),
        city_service_verified     INTEGER NOT NULL DEFAULT 0 CHECK (city_service_verified IN (0, 1)),
        publish_on_map            INTEGER NOT NULL DEFAULT 0 CHECK (publish_on_map IN (0, 1)),
        keep_city_request_private INTEGER CHECK (keep_city_request_private IN (0, 1)),
        report_status             TEXT NOT NULL DEFAULT 'not_sent'
                                  CHECK (report_status IN (${sqlList(REPORT_STATUSES)})),
        approved_snapshot         TEXT,
        approved_at               TEXT,
        city_request_id           TEXT,
        city_request_url          TEXT,
        receipt_evidence          TEXT,
        submitted_at              TEXT,
        is_fixture                INTEGER NOT NULL DEFAULT 0 CHECK (is_fixture IN (0, 1)),
        created_at                TEXT NOT NULL,
        updated_at                TEXT NOT NULL,

        -- A duplicate always names its canonical record, and only duplicates do.
        CHECK ((review_status = 'duplicate') = (duplicate_of IS NOT NULL)),
        CHECK (duplicate_of IS NULL OR duplicate_of <> id),
        -- Approval is a snapshot plus a time, never one without the other.
        CHECK ((approved_snapshot IS NULL) = (approved_at IS NULL)),
        -- "submitted" requires a recorded submission time.
        CHECK (report_status <> 'submitted' OR submitted_at IS NOT NULL)
      );

      CREATE INDEX potholes_review_status ON potholes(review_status);
      CREATE INDEX potholes_duplicate_of ON potholes(duplicate_of);

      CREATE TABLE report_attempts (
        id               TEXT PRIMARY KEY,
        pothole_id       TEXT NOT NULL REFERENCES potholes(id),
        snapshot         TEXT NOT NULL,
        started_at       TEXT NOT NULL,
        finished_at      TEXT,
        outcome          TEXT NOT NULL DEFAULT 'in_progress'
                         CHECK (outcome IN (${sqlList(ATTEMPT_OUTCOMES)})),
        city_request_id  TEXT,
        city_request_url TEXT,
        receipt_evidence TEXT,
        notes            TEXT,
        CHECK ((outcome = 'in_progress') = (finished_at IS NULL))
      );

      -- Database-level filing lock: at most one open attempt per pothole.
      -- An unresolved 'outcome_unknown' attempt also counts as open, so a new
      -- attempt is impossible until the operator reconciles it.
      CREATE UNIQUE INDEX report_attempts_one_open_per_pothole
        ON report_attempts(pothole_id)
        WHERE outcome IN ('in_progress', 'outcome_unknown');
    `,
  },
  {
    version: 2,
    name: "redacted photo copy and photo review",
    sql: `
      ALTER TABLE potholes ADD COLUMN redacted_photo_path TEXT;
      ALTER TABLE potholes ADD COLUMN redaction_boxes TEXT;
      ALTER TABLE potholes ADD COLUMN photo_reviewed INTEGER NOT NULL DEFAULT 0
        CHECK (photo_reviewed IN (0, 1));
    `,
  },
];

export function dbFilePath(dataDir: string): string {
  return path.join(dataDir, "pothole.db");
}

/**
 * Open (creating if needed) the SQLite database and bring its schema up to
 * date. Throws if the file was written by a newer schema than this code knows.
 */
export function openDatabase(file: string): Database.Database {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").pluck().all() as number[],
  );
  const latestKnown = Math.max(...MIGRATIONS.map((m) => m.version));
  const newest = Math.max(0, ...applied);
  if (newest > latestKnown) {
    throw new Error(
      `Database schema version ${newest} is newer than this code supports (${latestKnown}). ` +
        "Refusing to open it; deploy the matching code version.",
    );
  }

  const record = db.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      record.run(m.version, m.name, new Date().toISOString());
    })();
  }
}
