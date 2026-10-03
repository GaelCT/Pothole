/**
 * Input validation for pothole records. Pure functions, no I/O.
 *
 * Every function returns either a value or a human-readable error. Missing or
 * malformed data is rejected; nothing is replaced with a default.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

const DECIMAL_RE = /^-?\d{1,3}(\.\d{1,12})?$/;

function parseCoordinate(raw: unknown, label: string, limit: number): Result<number> {
  if (typeof raw !== "string" || raw.trim() === "") return fail(`${label} is required.`);
  const text = raw.trim();
  // Number("") is 0, and Number("1e2") is 100: accept plain decimals only.
  if (!DECIMAL_RE.test(text)) return fail(`${label} must be a decimal number, e.g. 35.3733.`);
  const value = Number(text);
  if (!Number.isFinite(value) || Math.abs(value) > limit) {
    return fail(`${label} must be between -${limit} and ${limit}.`);
  }
  return ok(value);
}

export function parseLatitude(raw: unknown): Result<number> {
  return parseCoordinate(raw, "Latitude", 90);
}

export function parseLongitude(raw: unknown): Result<number> {
  return parseCoordinate(raw, "Longitude", 180);
}

/** 0,0 is the classic "unset coordinates" value, never a Bakersfield pothole. */
export function checkNotNullIsland(latitude: number, longitude: number): Result<true> {
  return latitude === 0 && longitude === 0
    ? fail("Coordinates 0, 0 look like a missing location, not a real one.")
    : ok(true);
}

// ISO 8601 with an explicit offset or Z. A time with no zone is ambiguous.
const ISO_WITH_ZONE_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

/** Allow small clock skew between the operator's device and the server. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export function parseObservedAt(raw: unknown, now: Date = new Date()): Result<string> {
  if (typeof raw !== "string" || raw.trim() === "") return fail("Observation time is required.");
  const text = raw.trim();
  if (!ISO_WITH_ZONE_RE.test(text)) {
    return fail("Observation time must include a time zone, e.g. 2026-09-20T08:15:00-07:00.");
  }
  const time = Date.parse(text);
  if (Number.isNaN(time)) return fail("Observation time is not a valid date.");
  if (time > now.getTime() + FUTURE_TOLERANCE_MS) {
    return fail("Observation time is in the future.");
  }
  return ok(text);
}

export function parseRequiredText(raw: unknown, label: string, maxLength: number): Result<string> {
  if (typeof raw !== "string" || raw.trim() === "") return fail(`${label} is required.`);
  const text = raw.trim();
  if (text.length > maxLength) return fail(`${label} must be at most ${maxLength} characters.`);
  return ok(text);
}

/** Optional http(s) URL; anything else (javascript:, data:, relative) is rejected. */
export function parseOptionalHttpUrl(raw: unknown, label: string): Result<string | null> {
  if (raw === null || raw === undefined) return ok(null);
  if (typeof raw !== "string") return fail(`${label} must be text.`);
  const text = raw.trim();
  if (text === "") return ok(null);
  if (text.length > 500) return fail(`${label} must be at most 500 characters.`);
  try {
    const url = new URL(text);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return fail(`${label} must start with https:// or http://.`);
    }
    return ok(url.href);
  } catch {
    return fail(`${label} is not a valid web address.`);
  }
}

/** Optional text: empty becomes null, never a guessed value. */
export function parseOptionalText(
  raw: unknown,
  label: string,
  maxLength: number,
): Result<string | null> {
  if (raw === null || raw === undefined) return ok(null);
  if (typeof raw !== "string") return fail(`${label} must be text.`);
  const text = raw.trim();
  if (text === "") return ok(null);
  if (text.length > maxLength) return fail(`${label} must be at most ${maxLength} characters.`);
  return ok(text);
}
