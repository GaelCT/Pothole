"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import {
  saveApprovalAction,
  saveDecisionsAction,
  saveDuplicateAction,
  type ActionState,
} from "./actions";
import { FormStatus } from "./form-status";

/** Every review form sends the record id this way (see actions.ts for why it is not bound). */
export function PotholeIdField({ potholeId }: { potholeId: string }) {
  return <input type="hidden" name="pothole_id" value={potholeId} />;
}

export function DecisionsForm({
  potholeId,
  initial,
  disabledReason,
}: {
  potholeId: string;
  initial: {
    reviewStatus: "needs_review" | "verified" | "rejected";
    locationVerified: boolean;
    cityServiceVerified: boolean;
    publishOnMap: boolean;
    keepCityRequestPrivate: boolean | null;
  };
  disabledReason: string | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveDecisionsAction, undefined);
  const privacy =
    initial.keepCityRequestPrivate === null ? "undecided" : initial.keepCityRequestPrivate ? "private" : "public";

  return (
    <form action={formAction} className="stack wide">
      <PotholeIdField potholeId={potholeId} />
      {disabledReason && <p className="hint">{disabledReason}</p>}
      <fieldset disabled={disabledReason !== null} className="stack wide plain">
        <fieldset>
          <legend>Review status</legend>
          {(
            [
              ["needs_review", "Needs review"],
              ["verified", "Verified: this is a real pothole"],
              ["rejected", "Rejected: not a pothole, or not usable"],
            ] as const
          ).map(([value, label]) => (
            <label className="check" key={value}>
              <input type="radio" name="review_status" value={value} defaultChecked={initial.reviewStatus === value} />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Confirmations</legend>
          <label className="check">
            <input type="checkbox" name="location_verified" defaultChecked={initial.locationVerified} />
            The pin marks the pothole itself (checked against the photo)
          </label>
          <label className="check">
            <input type="checkbox" name="city_service_verified" defaultChecked={initial.cityServiceVerified} />
            The road is maintained by the City of Bakersfield (not Caltrans, Kern County, or private)
          </label>
        </fieldset>

        <fieldset>
          <legend>City request privacy</legend>
          {(
            [
              ["undecided", "Not decided yet"],
              ["public", "Public city request"],
              ["private", "Keep the city request private (also keeps it off this site's map)"],
            ] as const
          ).map(([value, label]) => (
            <label className="check" key={value}>
              <input type="radio" name="keep_city_request_private" value={value} defaultChecked={privacy === value} />
              {label}
            </label>
          ))}
          <p className="hint">The city&apos;s privacy checkbox does not make a request anonymous.</p>
        </fieldset>

        <label className="check">
          <input type="checkbox" name="publish_on_map" defaultChecked={initial.publishOnMap} />
          Publish on this site&apos;s public map
        </label>

        <FormStatus state={state} />
        <button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save decisions"}
        </button>
      </fieldset>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Duplicates: one hook and one result line for every duplicate form, so the
// message survives the page switching between "link" and "unlink" controls.

type DuplicateContextValue = { potholeId: string; formAction: (form: FormData) => void; pending: boolean };
const DuplicateContext = createContext<DuplicateContextValue | null>(null);

function useDuplicateContext(): DuplicateContextValue {
  const value = useContext(DuplicateContext);
  if (!value) throw new Error("Duplicate controls must be inside <DuplicateControls>.");
  return value;
}

export function DuplicateControls({ potholeId, children }: { potholeId: string; children: ReactNode }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveDuplicateAction, undefined);
  return (
    <DuplicateContext.Provider value={{ potholeId, formAction, pending }}>
      <FormStatus state={state} />
      {children}
    </DuplicateContext.Provider>
  );
}

export function MarkDuplicateButton({
  canonicalId,
  label,
  disabled,
}: {
  canonicalId: string;
  label: string;
  disabled: boolean;
}) {
  const { potholeId, formAction, pending } = useDuplicateContext();
  return (
    <form action={formAction} className="inline-form">
      <PotholeIdField potholeId={potholeId} />
      <input type="hidden" name="duplicate_intent" value="link" />
      <input type="hidden" name="canonical_id" value={canonicalId} />
      <button type="submit" className="secondary" disabled={disabled || pending}>
        {pending ? "Linking…" : `Mark this record as a duplicate of ${label}`}
      </button>
    </form>
  );
}

export function DuplicateByIdForm({ disabled }: { disabled: boolean }) {
  const { potholeId, formAction, pending } = useDuplicateContext();
  return (
    <form action={formAction} className="stack">
      <PotholeIdField potholeId={potholeId} />
      <input type="hidden" name="duplicate_intent" value="link" />
      <div className="field">
        <label htmlFor="canonical_id">Main record id (for records farther away)</label>
        <input id="canonical_id" name="canonical_id" className="mono" required disabled={disabled} />
      </div>
      <button type="submit" className="secondary" disabled={disabled || pending}>
        Link as duplicate
      </button>
    </form>
  );
}

export function UnlinkDuplicateButton({ disabled }: { disabled: boolean }) {
  const { potholeId, formAction, pending } = useDuplicateContext();
  return (
    <form action={formAction} className="stack">
      <PotholeIdField potholeId={potholeId} />
      <input type="hidden" name="duplicate_intent" value="unlink" />
      <button type="submit" className="secondary" disabled={disabled || pending}>
        {pending ? "Unlinking…" : "Unlink duplicate"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------

/**
 * Approve and withdraw share one action and one result line, so the
 * confirmation stays visible (and is announced) when the button swaps.
 */
export function ApprovalControls({
  potholeId,
  approved,
  canApprove,
  locked,
}: {
  potholeId: string;
  approved: boolean;
  canApprove: boolean;
  locked: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveApprovalAction, undefined);
  return (
    <form action={formAction} className="stack">
      <PotholeIdField potholeId={potholeId} />
      <input type="hidden" name="approval_intent" value={approved ? "revoke" : "approve"} />
      <FormStatus state={state} />
      {approved ? (
        <button type="submit" className="secondary" disabled={locked || pending}>
          {pending ? "Withdrawing…" : "Withdraw approval"}
        </button>
      ) : (
        <button type="submit" disabled={!canApprove || locked || pending}>
          {pending ? "Approving…" : "Approve this draft for filing"}
        </button>
      )}
    </form>
  );
}
