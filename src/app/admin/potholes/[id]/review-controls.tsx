"use client";

import { useActionState } from "react";
import {
  approveDraftAction,
  markDuplicateAction,
  revokeApprovalAction,
  saveDecisionsAction,
  unlinkDuplicateAction,
  type ActionState,
} from "./actions";
import { FormStatus } from "./form-status";

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
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveDecisionsAction.bind(null, potholeId),
    undefined,
  );
  const privacy =
    initial.keepCityRequestPrivate === null ? "undecided" : initial.keepCityRequestPrivate ? "private" : "public";

  return (
    <form action={formAction} className="stack wide">
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

export function MarkDuplicateButton({
  potholeId,
  canonicalId,
  label,
  disabled,
}: {
  potholeId: string;
  canonicalId: string;
  label: string;
  disabled: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    markDuplicateAction.bind(null, potholeId),
    undefined,
  );
  return (
    <form action={formAction} className="inline-form">
      <input type="hidden" name="canonical_id" value={canonicalId} />
      <button type="submit" className="secondary" disabled={disabled || pending}>
        {pending ? "Linking…" : `Mark this record as a duplicate of ${label}`}
      </button>
      <FormStatus state={state} />
    </form>
  );
}

export function DuplicateByIdForm({ potholeId, disabled }: { potholeId: string; disabled: boolean }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    markDuplicateAction.bind(null, potholeId),
    undefined,
  );
  return (
    <form action={formAction} className="stack">
      <div className="field">
        <label htmlFor="canonical_id">Main record id (for records farther away)</label>
        <input id="canonical_id" name="canonical_id" className="mono" required disabled={disabled} />
      </div>
      <FormStatus state={state} />
      <button type="submit" className="secondary" disabled={disabled || pending}>
        Link as duplicate
      </button>
    </form>
  );
}

function SimpleActionButton({
  action,
  label,
  pendingLabel,
  className,
  disabled,
}: {
  /** A bound server action, passed straight through so the form also works without JavaScript. */
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  label: string;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, undefined);
  return (
    <form action={formAction} className="stack">
      <FormStatus state={state} />
      <button type="submit" className={className} disabled={disabled || pending}>
        {pending ? pendingLabel : label}
      </button>
    </form>
  );
}

export function UnlinkDuplicateButton({ potholeId, disabled }: { potholeId: string; disabled: boolean }) {
  return (
    <SimpleActionButton
      action={unlinkDuplicateAction.bind(null, potholeId)}
      label="Unlink duplicate"
      pendingLabel="Unlinking…"
      className="secondary"
      disabled={disabled}
    />
  );
}

/**
 * Approve and withdraw share one mounted component with one result line, so
 * the confirmation stays visible (and is announced) when the button swaps.
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
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    approved ? revokeApprovalAction.bind(null, potholeId) : approveDraftAction.bind(null, potholeId),
    undefined,
  );
  return (
    <form action={formAction} className="stack">
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
