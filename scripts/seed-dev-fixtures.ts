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
import { dbFilePath, openDatabase, type PotholeRow } from "../src/lib/db-core.ts";
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
> & { stripe: [number, number, number]; purpose: string };

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
];

const db = openDatabase(dbFilePath(dataDir));
const exists = db.prepare("SELECT 1 FROM potholes WHERE id = ?").pluck();
const insert = db.prepare(`
  INSERT INTO potholes (
    id, latitude, longitude, location_description, lane_direction, observed_at,
    photo_path, review_status, duplicate_of, location_verified, city_service_verified,
    publish_on_map, keep_city_request_private, is_fixture, created_at, updated_at
  ) VALUES (
    @id, @latitude, @longitude, @location_description, @lane_direction, @observed_at,
    @photo_path, @review_status, @duplicate_of, @location_verified, @city_service_verified,
    @publish_on_map, @keep_city_request_private, 1, @now, @now
  )
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
    now: new Date().toISOString(),
  });
  added++;
  console.log(`  added    ${f.id}  ${f.purpose}`);
}
db.close();

console.log(`\nDevelopment fixtures: ${added} added, ${FIXTURES.length - added} already present.`);
console.log(`Database: ${dbFilePath(dataDir)}`);
