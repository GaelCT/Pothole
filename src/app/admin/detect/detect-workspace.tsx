"use client";

import { useEffect, useRef, useState } from "react";
import { MapStatusMessages } from "@/components/map/map-status";
import { fitToPoints, useMapTilerMap } from "@/components/map/use-maptiler-map";
import {
  coord,
  formatVideoTime,
  isoWithLocalOffset,
  pointsFromGpx,
  positionAt,
  type Position,
  type TrackPoint,
} from "@/lib/gps-track";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const FRAME = 1 / 30;

type Track = { name: string; points: TrackPoint[]; skipped: number };

type Candidate = {
  key: string;
  videoTime: number;
  blob: Blob;
  thumbUrl: string;
  description: string;
  status: "draft" | "sending" | "sent" | "failed";
  message: string;
  recordId?: string;
  /** Values actually sent; drafts follow the current start time and offset. */
  sent?: { observedAt: string; lat: string; lon: string };
};

const timeFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "medium" });

/**
 * Dashcam workspace. The video and GPS files stay in this browser: nothing is
 * uploaded until you send a marked frame, and then only that one JPEG frame.
 */
export function DetectWorkspace({ mapKey }: { mapKey: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const { handle, keyError, tileError } = useMapTilerMap(mapRef, mapKey);

  const [video, setVideo] = useState<{ url: string; name: string } | null>(null);
  const [videoError, setVideoError] = useState("");
  const [duration, setDuration] = useState(0);
  const [now, setNow] = useState(0);
  const [track, setTrack] = useState<Track | null>(null);
  const [trackError, setTrackError] = useState("");
  const [start, setStart] = useState("");
  const [offset, setOffset] = useState("0");
  const [markError, setMarkError] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  // ---- clock alignment -----------------------------------------------------
  const startMs = start ? new Date(start).getTime() : NaN;
  const offsetSec = Number(offset);
  const clockError = !start
    ? "Enter the video's start time."
    : Number.isNaN(startMs)
      ? "The start time is not valid."
      : !Number.isFinite(offsetSec)
        ? "The offset must be a number of seconds."
        : "";
  const instantAt = (videoTime: number) => (clockError ? null : startMs + offsetSec * 1000 + videoTime * 1000);
  const positionOf = (videoTime: number): Position => {
    const t = instantAt(videoTime);
    if (t === null) return { ok: false, error: clockError };
    if (!track) return { ok: false, error: "Load a GPS track first." };
    return positionAt(track.points, t);
  };
  const nowInstant = instantAt(now);
  const nowPos = positionOf(now);

  // ---- files ---------------------------------------------------------------
  function loadVideo(file: File | undefined) {
    if (video) URL.revokeObjectURL(video.url);
    setVideoError("");
    setDuration(0);
    setNow(0);
    setVideo(file ? { url: URL.createObjectURL(file), name: file.name } : null);
  }

  async function loadTrack(file: File | undefined) {
    setTrack(null);
    setTrackError("");
    if (!file) return;
    try {
      const doc = new DOMParser().parseFromString(await file.text(), "application/xml");
      const { points, skipped } = pointsFromGpx(doc);
      if (points.length < 2) throw new Error("No usable track points (<trkpt> with lat, lon and time) were found.");
      setTrack({ name: file.name, points, skipped });
    } catch (err) {
      setTrackError((err as Error).message);
    }
  }

  // ---- marking -------------------------------------------------------------
  function seek(delta: number) {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.min(Math.max(0, v.currentTime + delta), v.duration || 0);
  }

  async function markFrame() {
    setMarkError("");
    const v = videoRef.current;
    if (!v || v.readyState < 2 || !v.videoWidth) {
      setMarkError("Load a video and wait for it to show a frame.");
      return;
    }
    v.pause();
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    if (!blob) {
      setMarkError("Could not capture this frame.");
      return;
    }
    if (blob.size > MAX_PHOTO_BYTES) {
      setMarkError("This frame is larger than 10 MB as a JPEG. Use a lower-resolution copy of the video.");
      return;
    }
    const videoTime = v.currentTime;
    setCandidates((all) => [
      ...all,
      {
        key: crypto.randomUUID(),
        videoTime,
        blob,
        thumbUrl: URL.createObjectURL(blob),
        description: "",
        status: "draft",
        message: "",
      },
    ]);
  }

  const update = (key: string, patch: Partial<Candidate>) =>
    setCandidates((all) => all.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  function remove(c: Candidate) {
    URL.revokeObjectURL(c.thumbUrl);
    setCandidates((all) => all.filter((x) => x.key !== c.key));
  }

  async function send(c: Candidate) {
    const t = instantAt(c.videoTime);
    const pos = positionOf(c.videoTime);
    if (t === null || !pos.ok) {
      update(c.key, { status: "failed", message: t === null ? clockError : !pos.ok ? pos.error : "" });
      return;
    }
    if (!c.description.trim()) {
      update(c.key, { status: "failed", message: "Enter a street description first." });
      return;
    }
    const sent = { observedAt: isoWithLocalOffset(t), lat: coord(pos.lat), lon: coord(pos.lon) };
    update(c.key, { status: "sending", message: "" });
    const form = new FormData();
    form.set("latitude", sent.lat);
    form.set("longitude", sent.lon);
    form.set("location_description", c.description.trim());
    form.set("observed_at", sent.observedAt);
    form.set("photo", c.blob, "dashcam-frame.jpg");
    try {
      const res = await fetch("/api/admin/potholes", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as { id?: string; error?: string; errors?: string[] } | null;
      if (!res.ok || !body?.id) {
        const msg = body?.errors?.join(" ") || body?.error || `The server returned ${res.status}.`;
        update(c.key, { status: "failed", message: msg });
        return;
      }
      update(c.key, { status: "sent", recordId: body.id, sent, message: "" });
    } catch {
      update(c.key, { status: "failed", message: "Could not reach the server. Nothing was saved." });
    }
  }

  // ---- warn before losing unsent frames -------------------------------------
  const unsent = candidates.filter((c) => c.status !== "sent").length;
  useEffect(() => {
    if (unsent === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsent]);

  // Revoke frame URLs when the page goes away.
  const candidatesRef = useRef(candidates);
  useEffect(() => {
    candidatesRef.current = candidates;
  }, [candidates]);
  useEffect(() => () => candidatesRef.current.forEach((c) => URL.revokeObjectURL(c.thumbUrl)), []);

  // ---- map -----------------------------------------------------------------
  useEffect(() => {
    if (!handle || !track) return;
    const line = handle.L.polyline(
      track.points.map((p) => [p.lat, p.lon] as [number, number]),
      { color: "#0b5cad", weight: 3, opacity: 0.8, interactive: false },
    ).addTo(handle.map);
    fitToPoints(handle, track.points.map((p) => ({ latitude: p.lat, longitude: p.lon })));
    return () => {
      line.remove();
    };
  }, [handle, track]);

  const carLat = nowPos.ok ? nowPos.lat : null;
  const carLon = nowPos.ok ? nowPos.lon : null;
  useEffect(() => {
    if (!handle || carLat === null || carLon === null) return;
    const car = handle.L.circleMarker([carLat, carLon], {
      radius: 8,
      weight: 3,
      color: "#000000",
      fillColor: "#ffcc00",
      fillOpacity: 1,
    })
      .bindTooltip("Car position at the current video time")
      .addTo(handle.map);
    return () => {
      car.remove();
    };
  }, [handle, carLat, carLon]);

  // ---- render --------------------------------------------------------------
  const trackRange = track
    ? `${timeFormat.format(track.points[0].t)} to ${timeFormat.format(track.points[track.points.length - 1].t)}`
    : null;
  const mapUsable = mapKey !== null && keyError === null;

  return (
    <div className="stack wide">
      <section aria-labelledby="files-heading">
        <h2 id="files-heading">1. Load the drive</h2>
        <div className="row">
          <div className="field">
            <label htmlFor="video-file">Dashcam video</label>
            <input id="video-file" type="file" accept="video/*" onChange={(e) => loadVideo(e.target.files?.[0])} />
            <p className="hint">Stays on this computer. Only the frames you send are uploaded.</p>
          </div>
          <div className="field">
            <label htmlFor="gpx-file">GPS track (GPX)</label>
            <input id="gpx-file" type="file" accept=".gpx,application/gpx+xml,application/xml" onChange={(e) => void loadTrack(e.target.files?.[0])} />
            <p className="hint">
              {track
                ? `${track.points.length} points, ${trackRange}${track.skipped ? `. ${track.skipped} unusable points skipped` : ""}.`
                : "From a phone GPS logger or your dashcam's GPS export."}
            </p>
          </div>
        </div>
        <p role="alert" className="error">{trackError}</p>
      </section>

      <section aria-labelledby="sync-heading">
        <h2 id="sync-heading">2. Line up the clocks</h2>
        <div className="row">
          <div className="field">
            <label htmlFor="video-start">Time at the start of the video (0:00)</label>
            <input id="video-start" type="datetime-local" step={1} value={start} onChange={(e) => setStart(e.target.value)} aria-describedby="start-hint" />
            <p id="start-hint" className="hint">Read it from the dashcam&apos;s on-screen timestamp. This computer&apos;s time zone is used.</p>
          </div>
          <div className="field">
            <label htmlFor="video-offset">Fine adjustment (seconds)</label>
            <input id="video-offset" type="number" step={0.1} value={offset} onChange={(e) => setOffset(e.target.value)} aria-describedby="offset-hint" />
            <p id="offset-hint" className="hint">Positive if the dashcam clock is behind the GPS. Check the yellow dot follows the road on the map.</p>
          </div>
        </div>
        {clockError && <p className="hint">{clockError}</p>}
      </section>

      <section aria-labelledby="video-heading">
        <h2 id="video-heading">3. Find potholes</h2>
        <div className="detect-layout">
          <div className="stack wide">
            {video ? (
              <video
                ref={videoRef}
                key={video.url}
                src={video.url}
                controls
                muted
                playsInline
                className="detect-video"
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
                onSeeked={(e) => setNow(e.currentTarget.currentTime)}
                onError={() =>
                  setVideoError(
                    "This browser can't play this video. Dashcams often record H.265/HEVC; convert it to H.264, for example: ffmpeg -i input.mp4 -c:v libx264 -crf 20 output.mp4",
                  )
                }
                aria-label={`Dashcam video ${video.name}`}
              />
            ) : (
              <p className="hint">Load a video to start.</p>
            )}
            <p role="alert" className="error">{videoError}</p>
            <div className="row frame-controls">
              <button type="button" className="secondary" onClick={() => seek(-1)} disabled={!video}>−1 s</button>
              <button type="button" className="secondary" onClick={() => seek(-FRAME)} disabled={!video}>− frame</button>
              <button type="button" className="secondary" onClick={() => seek(FRAME)} disabled={!video}>+ frame</button>
              <button type="button" className="secondary" onClick={() => seek(1)} disabled={!video}>+1 s</button>
              <button type="button" onClick={() => void markFrame()} disabled={!video}>Mark pothole at this frame</button>
            </div>
            <p role="alert" className="error">{markError}</p>
            <dl className="summary-list" aria-live="polite">
              <dt>Video time</dt>
              <dd className="mono">
                {formatVideoTime(now)}
                {duration ? ` / ${formatVideoTime(duration)}` : ""}
              </dd>
              <dt>Clock time</dt>
              <dd className="mono">{nowInstant === null ? "—" : isoWithLocalOffset(nowInstant)}</dd>
              <dt>Car position</dt>
              <dd className="mono">{nowPos.ok ? `${coord(nowPos.lat)}, ${coord(nowPos.lon)}` : nowPos.error}</dd>
            </dl>
            <p className="hint">
              Pick the frame where the pothole is closest to the car (lowest in the picture). GPS gives
              the car&apos;s position, so you&apos;ll move the pin onto the pothole on the review page.
            </p>
          </div>
          <div>
            <MapStatusMessages mapKey={mapKey} keyError={keyError} tileError={tileError} fallback="Positions are still shown as numbers." />
            {mapKey && (
              <div
                ref={mapRef}
                className="map detect-map"
                hidden={!mapUsable}
                role="region"
                aria-label="GPS track (blue line) and the car's position at the current video time (yellow dot)"
              />
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="auto-heading" className="placeholder-section">
        <h2 id="auto-heading">Automatic detection</h2>
        <p>
          <strong>Not connected yet.</strong> Once you export your model as <code>best.onnx</code>, this
          section will scan the video at about 2 frames per second in this browser, group repeat
          detections of the same pothole, and add each one to the list below for you to check. Until
          then, mark potholes by hand above.
        </p>
      </section>

      <section aria-labelledby="cand-heading">
        <h2 id="cand-heading">4. Send to the review queue ({candidates.length})</h2>
        <p className="hint">
          Each one becomes an unverified record with its coordinates, time and photo filled in. Nothing
          is published or filed until you review it.
        </p>
        {candidates.length === 0 ? (
          <p>No marked frames yet.</p>
        ) : (
          <ul className="candidate-list">
            {candidates.map((c, i) => {
              const t = instantAt(c.videoTime);
              const pos = positionOf(c.videoTime);
              const sent = c.status === "sent";
              return (
                <li key={c.key}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={c.thumbUrl} alt={`Marked frame ${i + 1} at ${formatVideoTime(c.videoTime)}`} width={200} height={112} />
                  <div className="stack wide">
                    <p className="mono">
                      {formatVideoTime(c.videoTime)} · {sent ? c.sent!.observedAt : t === null ? "no clock time" : isoWithLocalOffset(t)}
                      <br />
                      {sent ? `${c.sent!.lat}, ${c.sent!.lon}` : pos.ok ? `${coord(pos.lat)}, ${coord(pos.lon)}` : pos.error}
                    </p>
                    <div className="field">
                      <label htmlFor={`desc-${c.key}`}>Street description</label>
                      <input
                        id={`desc-${c.key}`}
                        maxLength={500}
                        value={c.description}
                        disabled={sent || c.status === "sending"}
                        placeholder="Street and nearest intersection"
                        onChange={(e) => update(c.key, { description: e.target.value, status: c.status === "failed" ? "draft" : c.status })}
                      />
                    </div>
                    <div className="row">
                      {sent ? (
                        <p className="success" role="status">
                          Sent. <a href={`/admin/potholes/${c.recordId}`}>Review it</a>
                        </p>
                      ) : (
                        <>
                          <button type="button" onClick={() => void send(c)} disabled={c.status === "sending" || !pos.ok}>
                            {c.status === "sending" ? "Sending…" : "Send to review queue"}
                          </button>
                          <button type="button" className="secondary" onClick={() => remove(c)} disabled={c.status === "sending"}>
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                    <p role="alert" className="error">{c.status === "failed" ? c.message : ""}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
