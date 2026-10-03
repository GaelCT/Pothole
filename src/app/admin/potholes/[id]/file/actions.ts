"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/session";
import { UUID_RE } from "@/lib/photo-files";
import { recordOutcome, startFiling, MAX_RECEIPT_BYTES } from "@/lib/filing";
import type { ReviewResult } from "@/lib/review";
import { parseOptionalHttpUrl, parseOptionalText } from "@/lib/validation";

export type FilingState = ReviewResult | undefined;

/**
 * One unbound action for every filing step, chosen by `filing_intent`, so a
 * single always-mounted useActionState owns the result message (the page
 * swaps controls after each step). Unbound for the reason in
 * ../actions.ts: bound actions hang after a no-JavaScript POST.
 */
export async function saveFilingAction(_prev: FilingState, form: FormData): Promise<FilingState> {
  if (!(await getAdminSession())) return { ok: false, error: "Your session has expired. Sign in again." };
  const id = form.get("pothole_id");
  if (typeof id !== "string" || !UUID_RE.test(id)) return { ok: false, error: "Invalid record id." };

  const intent = form.get("filing_intent");
  const confirmed = form.get("confirm") === "on";
  const notes = parseOptionalText(form.get("notes"), "Notes", 1000);
  if (!notes.ok) return { ok: false, error: notes.error };

  let result: ReviewResult;
  if (intent === "start") {
    result = startFiling(id);
  } else if (intent === "unknown") {
    result = recordOutcome(id, { kind: "unknown", notes: notes.value });
  } else if (intent === "abandoned") {
    result = recordOutcome(id, { kind: "abandoned", notes: notes.value, confirmed });
  } else if (intent === "submitted" || intent === "existing") {
    const requestId = parseOptionalText(form.get("city_request_id"), "City request number", 100);
    const requestUrl = parseOptionalHttpUrl(form.get("city_request_url"), "City request link");
    const errors = [requestId, requestUrl].flatMap((r) => (r.ok ? [] : [r.error]));
    if (errors.length > 0 || !requestId.ok || !requestUrl.ok) return { ok: false, error: errors.join(" ") };

    if (intent === "existing") {
      result = recordOutcome(id, {
        kind: "existing",
        cityRequestId: requestId.value,
        cityRequestUrl: requestUrl.value,
        notes: notes.value,
        confirmed,
      });
    } else {
      const file = form.get("receipt");
      let receipt: Uint8Array | null = null;
      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_RECEIPT_BYTES) {
          return { ok: false, error: "The receipt screenshot must be 5 MB or smaller." };
        }
        receipt = new Uint8Array(await file.arrayBuffer());
      }
      result = recordOutcome(id, {
        kind: "submitted",
        cityRequestId: requestId.value,
        cityRequestUrl: requestUrl.value,
        notes: notes.value,
        receipt,
        confirmed,
      });
    }
  } else {
    return { ok: false, error: "Unknown filing step." };
  }

  if (result.ok) {
    for (const path of [`/admin/potholes/${id}/file`, `/admin/potholes/${id}`, "/admin", "/admin/reports", "/", "/login"]) {
      revalidatePath(path);
    }
  }
  return result;
}
