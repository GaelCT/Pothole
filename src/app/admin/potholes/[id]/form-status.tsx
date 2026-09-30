"use client";

import type { ActionState } from "./actions";

/** Result line for a review form: polite for success, assertive for errors. */
export function FormStatus({ state }: { state: ActionState }) {
  return (
    <>
      <p role="status" aria-live="polite" className="success">
        {state?.ok ? state.message : ""}
      </p>
      <p role="alert" aria-live="assertive" className="error">
        {state && !state.ok ? state.error : ""}
      </p>
    </>
  );
}
