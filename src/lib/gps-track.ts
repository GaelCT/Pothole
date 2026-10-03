/**
 * GPS track handling for the dashcam page. Pure functions, client-safe.
 *
 * Positions are interpolated between real track points only. Outside the
 * track, or across a gap in it, there is no position: the caller must not
 * invent one (build plan: no fabricated coordinates).
 */

export type TrackPoint = { t: number; lat: number; lon: number };

/** Longest gap between two GPS points we will interpolate across. */
export const MAX_GAP_MS = 10_000;

/** Read <trkpt> points from a parsed GPX document, sorted by time. */
export function pointsFromGpx(doc: Document): { points: TrackPoint[]; skipped: number } {
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("This file is not valid GPX (XML could not be read).");
  }
  const points: TrackPoint[] = [];
  let skipped = 0;
  for (const el of Array.from(doc.getElementsByTagName("trkpt"))) {
    const lat = Number(el.getAttribute("lat"));
    const lon = Number(el.getAttribute("lon"));
    const time = el.getElementsByTagName("time")[0]?.textContent?.trim();
    const t = time ? Date.parse(time) : NaN;
    if (
      !Number.isFinite(lat) || !Number.isFinite(lon) || Number.isNaN(t) ||
      Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)
    ) {
      skipped++;
      continue;
    }
    points.push({ t, lat, lon });
  }
  points.sort((a, b) => a.t - b.t);
  return { points, skipped };
}

export type Position = { ok: true; lat: number; lon: number } | { ok: false; error: string };

/** Interpolated position at time `t` (ms since epoch). */
export function positionAt(points: readonly TrackPoint[], t: number, maxGapMs = MAX_GAP_MS): Position {
  if (points.length < 2) return { ok: false, error: "The GPS track has fewer than two points." };
  if (t < points[0].t || t > points[points.length - 1].t) {
    return { ok: false, error: "This moment is outside the GPS track. Check the start time and offset." };
  }
  // Binary search for points[i].t <= t <= points[i + 1].t.
  let lo = 0;
  let hi = points.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = points[lo];
  const b = points[hi];
  if (t === a.t) return { ok: true, lat: a.lat, lon: a.lon };
  if (t === b.t) return { ok: true, lat: b.lat, lon: b.lon };
  const gap = b.t - a.t;
  if (gap > maxGapMs) {
    return { ok: false, error: `The GPS track has a ${Math.round(gap / 1000)} s gap here, so there's no reliable position.` };
  }
  const f = (t - a.t) / gap;
  return { ok: true, lat: a.lat + f * (b.lat - a.lat), lon: a.lon + f * (b.lon - a.lon) };
}

/** Round to 6 decimals (about 0.1 m) and drop trailing zeros. */
export const coord = (n: number) => String(Math.round(n * 1e6) / 1e6);

/** ISO 8601 with the browser's UTC offset for that instant, e.g. 2026-09-26T16:45:03-07:00. */
export function isoWithLocalOffset(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

/** "1:02:03.4" style video timestamp. */
export function formatVideoTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(1).padStart(4, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
