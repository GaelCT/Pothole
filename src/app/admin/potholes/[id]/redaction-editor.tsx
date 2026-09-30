"use client";

import { useActionState, useRef, useState } from "react";
import { saveRedactionAction, type ActionState } from "./actions";
import { FormStatus } from "./form-status";
import type { RedactionBox } from "@/lib/review-rules";

type Draft = { x0: number; y0: number; x1: number; y1: number };

/**
 * Draw solid black boxes over faces, license plates, house numbers, or
 * anything else identifying. Drag on the photo with a mouse, finger or pen;
 * the numeric fields are the keyboard alternative. Boxes are in pixels of the
 * photo as displayed (EXIF orientation applied), which is how the server
 * renders them.
 */
export function RedactionEditor({
  potholeId,
  originalUrl,
  reviewedUrl,
  width,
  height,
  initialBoxes,
  initiallyReviewed,
  locked,
}: {
  potholeId: string;
  originalUrl: string;
  reviewedUrl: string | null;
  width: number;
  height: number;
  initialBoxes: RedactionBox[];
  initiallyReviewed: boolean;
  locked: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveRedactionAction.bind(null, potholeId),
    undefined,
  );
  const [boxes, setBoxes] = useState<RedactionBox[]>(initialBoxes);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [numeric, setNumeric] = useState({ x: "", y: "", width: "", height: "" });
  const [numericError, setNumericError] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);

  // Pointer position in photo pixels, clamped to the image.
  function toPhoto(e: React.PointerEvent): { x: number; y: number } {
    const rect = stageRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const y = ((e.clientY - rect.top) / rect.height) * height;
    return {
      x: Math.min(width, Math.max(0, Math.round(x))),
      y: Math.min(height, Math.max(0, Math.round(y))),
    };
  }

  function normalize(d: Draft): RedactionBox {
    const x = Math.min(d.x0, d.x1);
    const y = Math.min(d.y0, d.y1);
    return { x, y, width: Math.abs(d.x1 - d.x0), height: Math.abs(d.y1 - d.y0) };
  }

  // The in-progress box lives in a ref so fast pointer events never read a
  // stale value; the state copy only drives rendering.
  const draftRef = useRef<Draft | null>(null);
  const updateDraft = (d: Draft | null) => {
    draftRef.current = d;
    setDraft(d);
  };

  function onPointerDown(e: React.PointerEvent) {
    if (locked || e.button !== 0) return;
    e.preventDefault();
    // Capture keeps the drag going outside the photo; drawing still works
    // if the browser refuses it.
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is an enhancement only */
    }
    const p = toPhoto(e);
    updateDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
  }
  function onPointerMove(e: React.PointerEvent) {
    const current = draftRef.current;
    if (!current) return;
    const p = toPhoto(e);
    updateDraft({ ...current, x1: p.x, y1: p.y });
  }
  function onPointerUp(e: React.PointerEvent) {
    const current = draftRef.current;
    if (!current) return;
    const p = toPhoto(e);
    const box = normalize({ ...current, x1: p.x, y1: p.y });
    updateDraft(null);
    // Ignore accidental clicks; a real box is at least a few pixels.
    if (box.width >= 4 && box.height >= 4) setBoxes((b) => [...b, box]);
  }

  function addNumeric() {
    const v = Object.fromEntries(Object.entries(numeric).map(([k, s]) => [k, Number(s)])) as RedactionBox;
    const whole = [v.x, v.y, v.width, v.height].every((n) => Number.isInteger(n));
    if (!whole || v.x < 0 || v.y < 0 || v.width < 1 || v.height < 1 || v.x + v.width > width || v.y + v.height > height) {
      setNumericError(`Enter whole pixels inside the ${width} × ${height} photo.`);
      return;
    }
    setNumericError("");
    setBoxes((b) => [...b, v]);
    setNumeric({ x: "", y: "", width: "", height: "" });
  }

  const pct = (n: number, of: number) => `${(n / of) * 100}%`;
  const boxStyle = (b: RedactionBox) => ({
    left: pct(b.x, width),
    top: pct(b.y, height),
    width: pct(b.width, width),
    height: pct(b.height, height),
  });
  const shown = draft ? [...boxes, normalize(draft)] : boxes;

  return (
    <form action={formAction} className="stack wide">
      <div className="redaction-layout">
        <div>
          <h3>Original upload (private)</h3>
          <p className="hint">
            Drag on the photo to cover faces, license plates, house numbers, or anything else that
            identifies a person. Boxes are solid black and cannot be undone in the saved copy.
          </p>
          <div
            ref={stageRef}
            className={locked ? "redaction-stage locked" : "redaction-stage"}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => updateDraft(null)}
          >
            {/* Plain <img>: admin-only, access-checked photo route. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={originalUrl} alt="Original evidence photo" width={width} height={height} draggable={false} />
            {shown.map((b, i) => (
              <div key={i} className="redaction-box" style={boxStyle(b)} aria-hidden="true" />
            ))}
          </div>
          <p className="hint mono">
            {width} × {height} px
          </p>
        </div>
        <div>
          <h3>Saved copy (what the public and the city see)</h3>
          {reviewedUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={reviewedUrl} className="reviewed-photo" src={reviewedUrl} alt="Reviewed, metadata-stripped photo copy" width={width} height={height} />
          ) : (
            <p className="hint">No copy saved yet. Saving creates one with all photo metadata (including GPS) removed.</p>
          )}
        </div>
      </div>

      <fieldset disabled={locked} className="stack wide plain">
        <h3 id="boxes-heading">Boxes ({boxes.length})</h3>
        {boxes.length === 0 ? (
          <p className="hint">No boxes. That is fine if nothing identifying is visible.</p>
        ) : (
          <ol className="box-list" aria-labelledby="boxes-heading">
            {boxes.map((b, i) => (
              <li key={i}>
                <span className="mono">
                  x {b.x}, y {b.y}, {b.width} × {b.height}
                </span>
                <button type="button" className="secondary" onClick={() => setBoxes((all) => all.filter((_, j) => j !== i))}>
                  Remove box {i + 1}
                </button>
              </li>
            ))}
          </ol>
        )}

        <details>
          <summary>Add a box by coordinates (keyboard)</summary>
          <div className="row">
            {(["x", "y", "width", "height"] as const).map((k) => (
              <div className="field" key={k}>
                <label htmlFor={`box-${k}`}>{k}</label>
                <input
                  id={`box-${k}`}
                  inputMode="numeric"
                  value={numeric[k]}
                  onChange={(e) => setNumeric({ ...numeric, [k]: e.target.value })}
                />
              </div>
            ))}
          </div>
          <p role="alert" className="error">{numericError}</p>
          <button type="button" className="secondary" onClick={addNumeric}>
            Add box
          </button>
        </details>

        <input type="hidden" name="boxes" value={JSON.stringify(boxes)} />
        <label className="check">
          <input type="checkbox" name="confirm_reviewed" defaultChecked={initiallyReviewed} />
          I checked the photo with these boxes: no identifiable faces or license plates remain
          visible.
        </label>
        <FormStatus state={state} />
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save photo copy"}
        </button>
      </fieldset>
    </form>
  );
}
