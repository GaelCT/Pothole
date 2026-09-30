"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/session";
import { UUID_RE } from "@/lib/photo-files";
import {
  approveDraft,
  markDuplicate,
  revokeApproval,
  saveRedaction,
  unlinkDuplicate,
  updateDecisions,
  updateDetails,
  type ReviewResult,
} from "@/lib/review";
import {
  checkNotNullIsland,
  parseLatitude,
  parseLongitude,
  parseOptionalText,
  parseRequiredText,
} from "@/lib/validation";

/**
 * Stage 4 review actions. Each one re-checks the admin session (rendering the
 * page is not a security boundary), validates its input, and delegates the
 * write to src/lib/review.ts. Next.js applies its Origin check to every action.
 *
 * Every action is unbound: `(previousState, formData)`, with the record id in
 * a hidden `pothole_id` field. Do not switch back to
 * `action.bind(null, id)` inside a client component. After a no-JavaScript
 * POST, React's server renderer checks the posted action against each
 * useActionState hook. For a bound action that check waits on the binding's
 * promise and suspends, and each retry re-renders the component, creating a
 * fresh binding that suspends again, so the response never finishes. Unbound
 * actions are checked synchronously. The id was client-supplied either way,
 * and it is validated here exactly as before.
 */

export type ActionState = ReviewResult | undefined;

async function guard(form: FormData): Promise<string | ReviewResult> {
  if (!(await getAdminSession())) return { ok: false, error: "Your session has expired. Sign in again." };
  const id = form.get("pothole_id");
  if (typeof id !== "string" || !UUID_RE.test(id)) {
    return { ok: false, error: "Invalid record id." };
  }
  return id;
}

// Re-render the review page (and the records list) with the saved data.
function finish(id: string, result: ReviewResult): ReviewResult {
  if (result.ok) {
    revalidatePath(`/admin/potholes/${id}`);
    revalidatePath("/admin");
  }
  return result;
}

export async function saveDetailsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = await guard(form);
  if (typeof id !== "string") return id;

  const lat = parseLatitude(form.get("latitude"));
  const lon = parseLongitude(form.get("longitude"));
  const desc = parseRequiredText(form.get("location_description"), "Street description", 500);
  const lane = parseOptionalText(form.get("lane_direction"), "Lane or direction", 200);
  const errors = [lat, lon, desc, lane].flatMap((r) => (r.ok ? [] : [r.error]));
  if (lat.ok && lon.ok) {
    const island = checkNotNullIsland(lat.value, lon.value);
    if (!island.ok) errors.push(island.error);
  }
  if (errors.length > 0 || !lat.ok || !lon.ok || !desc.ok || !lane.ok) {
    return { ok: false, error: errors.join(" ") };
  }
  return finish(
    id,
    updateDetails(id, {
      latitude: lat.value,
      longitude: lon.value,
      locationDescription: desc.value,
      laneDirection: lane.value,
    }),
  );
}

export async function saveDecisionsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = await guard(form);
  if (typeof id !== "string") return id;

  const status = form.get("review_status");
  if (status !== "needs_review" && status !== "verified" && status !== "rejected") {
    return { ok: false, error: "Choose a review status." };
  }
  const privacy = form.get("keep_city_request_private");
  if (privacy !== "undecided" && privacy !== "private" && privacy !== "public") {
    return { ok: false, error: "Choose a privacy option." };
  }
  return finish(
    id,
    updateDecisions(id, {
      reviewStatus: status,
      locationVerified: form.get("location_verified") === "on",
      cityServiceVerified: form.get("city_service_verified") === "on",
      publishOnMap: form.get("publish_on_map") === "on",
      keepCityRequestPrivate: privacy === "undecided" ? null : privacy === "private",
    }),
  );
}

/**
 * Link and unlink share one action so a single, always-mounted useActionState
 * owns the result message, including after a no-JavaScript POST, where React
 * only restores state to the hook whose action matches the posted one.
 */
export async function saveDuplicateAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = await guard(form);
  if (typeof id !== "string") return id;
  const intent = form.get("duplicate_intent");
  if (intent === "unlink") return finish(id, unlinkDuplicate(id));
  if (intent !== "link") return { ok: false, error: "Unknown duplicate action." };
  const canonical = form.get("canonical_id");
  if (typeof canonical !== "string" || !UUID_RE.test(canonical.trim())) {
    return { ok: false, error: "Choose the main record." };
  }
  return finish(id, markDuplicate(id, canonical.trim()));
}

export async function saveRedactionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = await guard(form);
  if (typeof id !== "string") return id;
  const raw = form.get("boxes");
  if (typeof raw !== "string" || raw.length > 20_000) {
    return { ok: false, error: "Redaction boxes are missing or too large." };
  }
  let boxes: unknown;
  try {
    boxes = JSON.parse(raw);
  } catch {
    return { ok: false, error: "Redaction boxes could not be read." };
  }
  return finish(id, await saveRedaction(id, boxes, form.get("confirm_reviewed") === "on"));
}

/** Approve and withdraw share one action for the same reason as duplicates. */
export async function saveApprovalAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const id = await guard(form);
  if (typeof id !== "string") return id;
  const intent = form.get("approval_intent");
  if (intent === "approve") return finish(id, approveDraft(id));
  if (intent === "revoke") return finish(id, revokeApproval(id));
  return { ok: false, error: "Unknown approval action." };
}
