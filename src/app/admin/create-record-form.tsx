"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const noopSubscribe = () => () => {};

/** Browser time zone, rendered only on the client (null during SSR). */
function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(
    noopSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
}

/**
 * Convert a datetime-local value ("2026-09-20T08:15") to ISO 8601 with the
 * browser's UTC offset for that date, e.g. "2026-09-20T08:15:00-07:00".
 */
function withLocalOffset(localValue: string): string | null {
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return null;
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  const base = localValue.length === 16 ? `${localValue}:00` : localValue;
  return `${base}${sign}${hh}:${mm}`;
}

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; id: string }
  | { kind: "failed"; errors: string[] };

export function CreateRecordForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const timeZone = useBrowserTimeZone();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    const local = data.get("observed_local");
    const observedAt = typeof local === "string" ? withLocalOffset(local) : null;
    if (!observedAt) {
      setStatus({ kind: "failed", errors: ["Observation time is required."] });
      return;
    }
    data.delete("observed_local");
    data.set("observed_at", observedAt);

    setStatus({ kind: "saving" });
    try {
      const res = await fetch("/api/admin/potholes", { method: "POST", body: data });
      const body = (await res.json().catch(() => null)) as
        | { id?: string; error?: string; errors?: string[] }
        | null;
      if (!res.ok || !body?.id) {
        const errors = body?.errors?.length
          ? body.errors
          : [body?.error ?? `The server returned ${res.status}.`];
        setStatus({ kind: "failed", errors });
        return;
      }
      setStatus({ kind: "saved", id: body.id });
      formRef.current?.reset();
      router.refresh();
    } catch {
      setStatus({ kind: "failed", errors: ["Could not reach the server. Nothing was saved."] });
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="stack">
      <div className="row">
        <div className="field">
          <label htmlFor="latitude">Latitude</label>
          <input
            id="latitude"
            name="latitude"
            type="text"
            inputMode="decimal"
            placeholder="35.3733"
            required
            aria-describedby="coord-hint"
          />
        </div>
        <div className="field">
          <label htmlFor="longitude">Longitude</label>
          <input
            id="longitude"
            name="longitude"
            type="text"
            inputMode="decimal"
            placeholder="-119.0187"
            required
            aria-describedby="coord-hint"
          />
        </div>
      </div>
      <p id="coord-hint" className="hint">
        The pothole&apos;s own position, not where the camera was. Decimal degrees.
      </p>

      <div className="field">
        <label htmlFor="location_description">Street description</label>
        <input
          id="location_description"
          name="location_description"
          type="text"
          maxLength={500}
          placeholder="Street and nearest intersection"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="lane_direction">
          Lane or direction <span className="hint">(optional, only if actually known)</span>
        </label>
        <input id="lane_direction" name="lane_direction" type="text" maxLength={200} />
      </div>

      <div className="field">
        <label htmlFor="observed_local">Observed at</label>
        <input
          id="observed_local"
          name="observed_local"
          type="datetime-local"
          required
          aria-describedby="tz-hint"
        />
        <p id="tz-hint" className="hint">
          Interpreted in this browser&apos;s time zone{timeZone ? ` (${timeZone})` : ""}.
        </p>
      </div>

      <div className="field">
        <label htmlFor="photo">Evidence photo</label>
        <input
          id="photo"
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          aria-describedby="photo-hint"
        />
        <p id="photo-hint" className="hint">JPEG, PNG, or WebP, up to 10 MB. Stored privately.</p>
      </div>

      <div role="status" aria-live="polite">
        {status.kind === "saved" && (
          <p className="success">Saved to the review queue as {status.id}.</p>
        )}
      </div>
      <div role="alert" aria-live="assertive">
        {status.kind === "failed" && (
          <ul className="error">
            {status.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </div>

      <button type="submit" disabled={status.kind === "saving"}>
        {status.kind === "saving" ? "Saving…" : "Add to review queue"}
      </button>
    </form>
  );
}
