/**
 * Loads clearly labeled development fixtures into the local database.
 *
 *   npm run db:seed-dev
 *
 * Refuses to run in production. Idempotent: fixtures have fixed IDs, and
 * re-running never creates a second copy of a record.
 *
 * Fixture coordinates are inside Bakersfield so the Stage 3 map has something
 * to show, but they are NOT real pothole observations. Every description,
 * photo, and row is marked as a fixture.
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { dbFilePath, openDatabase, type PotholeRow } from "../src/lib/db-core.ts";
import { buildSnapshot, parseSnapshot } from "../src/lib/review-rules.ts";
import { photosDir, writePhoto } from "../src/lib/photo-files.ts";
import { fixturePng } from "./fixture-png.ts";

if (process.env.NODE_ENV === "production") {
  console.error("Refusing to load development fixtures with NODE_ENV=production.");
  process.exit(1);
}

const dataDirRaw = process.env.DATA_DIR?.trim();
if (!dataDirRaw) {
  console.error("DATA_DIR is not set. Configure .env.local first (see README.md).");
  process.exit(1);
}
const dataDir = path.resolve(dataDirRaw);

type Fixture = Pick<
  PotholeRow,
  | "id"
  | "latitude"
  | "longitude"
  | "location_description"
  | "lane_direction"
  | "observed_at"
  | "review_status"
  | "duplicate_of"
  | "location_verified"
  | "city_service_verified"
  | "publish_on_map"
  | "keep_city_request_private"
> & {
  stripe: [number, number, number];
  purpose: string;
  /** Simulates a report the operator confirmed as filed. No city ID is invented. */
  submittedAt?: string;
};

const fid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const label = (letter: string) => `[DEV FIXTURE ${letter}] Test location, not a real report`;

// Order matters: a duplicate must come after its canonical record.
const FIXTURES: Fixture[] = [
  {
    id: fid(1),
    purpose: "public: verified, published, city request public",
    latitude: 35.3733,
    longitude: -119.0187,
    location_description: label("A"),
    lane_direction: "Fixture lane note",
    observed_at: "2026-09-20T08:15:00-07:00",
    review_status: "verified",
    duplicate_of: null,
    location_verified: 1,
    city_service_verified: 1,
    publish_on_map: 1,
    keep_city_request_private: 0,
    stripe: [120, 170, 230],
  },
  {
    id: fid(2),
    purpose: "public: verified, published, no lane information",
    latitude: 35.354,
    longitude: -119.061,
    location_description: label("B"),
    lane_direction: null,
    observed_at: "2026-09-21T17:40:00-07:00",
    review_status: "verified",
    duplicate_of: null,
    location_verified: 1,
    city_service_verified: 1,
    publish_on_map: 1,
    keep_city_request_private: 0,
    stripe: [140, 200, 140],
  },
  {
    id: fid(3),
    purpose: "hidden: needs review",
    latitude: 35.39,
    longitude: -119.0,
    location_description: label("C"),
    lane_direction: null,
    observed_at: "2026-09-22T12:05:00-07:00",
    review_status: "needs_review",
    duplicate_of: null,
    location_verified: 0,
    city_service_verified: 0,
    publish_on_map: 0,
    keep_city_request_private: null,
    stripe: [230, 190, 110],
  },
  {
    id: fid(4),
    purpose: "hidden: rejected",
    latitude: 35.33,
    longitude: -119.09,
    location_description: label("D"),
    lane_direction: null,
    observed_at: "2026-09-22T13:30:00-07:00",
    review_status: "rejected",
    duplicate_of: null,
    location_verified: 0,
    city_service_verified: 0,
    publish_on_map: 0,
    keep_city_request_private: null,
    stripe: [220, 130, 130],
  },
  {
    id: fid(5),
    purpose: "hidden: duplicate of A",
    latitude: 35.37336,
    longitude: -119.01866,
    location_description: label("E"),
    lane_direction: null,
    observed_at: "2026-09-23T09:00:00-07:00",
    review_status: "duplicate",
    duplicate_of: fid(1),
    location_verified: 1,
    city_service_verified: 1,
    publish_on_map: 0,
    keep_city_request_private: 0,
    stripe: [180, 140, 220],
  },
  {
    id: fid(6),
    purpose: "hidden: verified but city request kept private",
    latitude: 35.36,
    longitude: -119.03,
    location_description: label("F"),
    lane_direction: null,
    observed_at: "2026-09-24T07:20:00-07:00",
    review_status: "verified",
    duplicate_of: null,
    location_verified: 1,
    city_service_verified: 1,
    publish_on_map: 0,
    keep_city_request_private: 1,
    stripe: [150, 150, 150],
  },
  {
    id: fid(7),
    purpose: "public + submitted to city (no city request ID shown)",
    latitude: 35.385,
    longitude: -119.02,
    location_description: label("G"),
    lane_direction: "Fixture lane note",
    observed_at: "2026-09-18T11:10:00-07:00",
    review_status: "verified",
    duplicate_of: null,
    location_verified: 1,
    city_service_verified: 1,
    publish_on_map: 1,
    keep_city_request_private: 0,
    submittedAt: "2026-09-19T09:30:00-07:00",
    stripe: [240, 150, 90],
  },
  {
    id: fid(8),
    purpose: "public + submitted to city (no city request ID shown)",
    latitude: 35.345,
    longitude: -119.1,
    location_description: label("H"),
    lane_direction: null,
    observed_at: "2026-09-19T15:45:00-07:00",
    review_status: "verified",
    duplicate_of: null,
    location_verified: 1,
    city_service_verified: 1,
    publish_on_map: 1,
    keep_city_request_private: 0,
    submittedAt: "2026-09-21T10:05:00-07:00",
    stripe: [200, 110, 160],
  },
];

const db = openDatabase(dbFilePath(dataDir));
const exists = db.prepare("SELECT 1 FROM potholes WHERE id = ?").pluck();
const insert = db.prepare(`
  INSERT INTO potholes (
    id, latitude, longitude, location_description, lane_direction, observed_at,
    photo_path, review_status, duplicate_of, location_verified, city_service_verified,
    publish_on_map, keep_city_request_private, report_status, approved_snapshot,
    approved_at, submitted_at, is_fixture, created_at, updated_at
  ) VALUES (
    @id, @latitude, @longitude, @location_description, @lane_direction, @observed_at,
    @photo_path, @review_status, @duplicate_of, @location_verified, @city_service_verified,
    @publish_on_map, @keep_city_request_private, @report_status, @approved_snapshot,
    @approved_at, @submitted_at, 1, @now, @now
  )
`);
const insertAttempt = db.prepare(`
  INSERT INTO report_attempts (id, pothole_id, snapshot, started_at, finished_at, outcome, notes)
  VALUES (@id, @pothole_id, @snapshot, @started_at, @finished_at, 'submitted', @notes)
`);

let added = 0;
for (const f of FIXTURES) {
  if (exists.get(f.id)) {
    console.log(`  exists   ${f.id}  ${f.purpose}`);
    continue;
  }
  // Reuse a photo left behind by an interrupted earlier run.
  const photoName = `${f.id}.png`;
  if (!fs.existsSync(path.join(photosDir(dataDir), photoName))) {
    writePhoto(dataDir, fixturePng(f.stripe), f.id);
  }
  insert.run({
    id: f.id,
    latitude: f.latitude,
    longitude: f.longitude,
    location_description: f.location_description,
    lane_direction: f.lane_direction,
    observed_at: f.observed_at,
    photo_path: photoName,
    review_status: f.review_status,
    duplicate_of: f.duplicate_of,
    location_verified: f.location_verified,
    city_service_verified: f.city_service_verified,
    publish_on_map: f.publish_on_map,
    keep_city_request_private: f.keep_city_request_private,
    report_status: f.submittedAt ? "submitted" : "not_sent",
    approved_snapshot: null,
    approved_at: null,
    submitted_at: f.submittedAt ?? null,
    now: new Date().toISOString(),
  });
  added++;
  console.log(`  added    ${f.id}  ${f.purpose}`);
}

// Bring every fixture up to the current review model (also upgrades fixtures
// created by earlier versions of this script):
// - verified fixtures get a reviewed photo copy (the synthetic PNG has no
//   metadata and nothing to redact, so the copy is byte-identical)
// - "submitted" fixtures get an approval snapshot and a simulated attempt
const selectRow = db.prepare("SELECT * FROM potholes WHERE id = ?");
const attemptExists = db.prepare("SELECT 1 FROM report_attempts WHERE pothole_id = ?").pluck();
let upgraded = 0;
for (const f of FIXTURES) {
  let row = selectRow.get(f.id) as PotholeRow;
  const changes: string[] = [];

  if (f.review_status === "verified" && row.redacted_photo_path === null) {
    const reviewedId = f.id.replace(/^00000000/, "b0000000");
    const reviewedName = `${reviewedId}.png`;
    if (!fs.existsSync(path.join(photosDir(dataDir), reviewedName))) {
      const original = fs.readFileSync(path.join(photosDir(dataDir), row.photo_path));
      writePhoto(dataDir, original, reviewedId);
    }
    db.prepare(
      "UPDATE potholes SET redacted_photo_path = ?, redaction_boxes = '[]', photo_reviewed = 1 WHERE id = ?",
    ).run(reviewedName, f.id);
    changes.push("reviewed photo copy");
    row = selectRow.get(f.id) as PotholeRow;
  }

  if (f.submittedAt && parseSnapshot(row.approved_snapshot) === null) {
    const sha = createHash("sha256")
      .update(fs.readFileSync(path.join(photosDir(dataDir), row.redacted_photo_path!)))
      .digest("hex");
    const snapshot = JSON.stringify(buildSnapshot(row, sha));
    db.transaction(() => {
      db.prepare("UPDATE potholes SET approved_snapshot = ?, approved_at = ? WHERE id = ?").run(
        snapshot,
        f.submittedAt,
        f.id,
      );
      if (attemptExists.get(f.id)) {
        db.prepare("UPDATE report_attempts SET snapshot = ? WHERE pothole_id = ?").run(snapshot, f.id);
      } else {
        insertAttempt.run({
          id: f.id.replace(/^00000000/, "a0000000"),
          pothole_id: f.id,
          snapshot,
          started_at: f.submittedAt,
          finished_at: f.submittedAt,
          notes: "DEV FIXTURE: simulated filing, nothing was sent to the city.",
        });
      }
    })();
    changes.push("approval snapshot");
  }

  if (changes.length > 0) {
    upgraded++;
    console.log(`  upgraded ${f.id}  ${changes.join(", ")}`);
  }
}
db.close();

console.log(
  `\nDevelopment fixtures: ${added} added, ${FIXTURES.length - added} already present, ${upgraded} upgraded.`,
);
console.log(`Database: ${dbFilePath(dataDir)}`);
