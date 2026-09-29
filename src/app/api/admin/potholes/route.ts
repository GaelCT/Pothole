import { authorizeAdmin, jsonError } from "@/lib/request-guards";
import { createPothole, listAllPotholesForAdmin } from "@/lib/potholes";
import { MAX_PHOTO_BYTES, PhotoError } from "@/lib/photo-files";
import {
  checkNotNullIsland,
  parseLatitude,
  parseLongitude,
  parseObservedAt,
  parseOptionalText,
  parseRequiredText,
} from "@/lib/validation";

// Room for the multipart envelope and the text fields around the photo.
const MAX_BODY_BYTES = MAX_PHOTO_BYTES + 64 * 1024;

export async function GET(request: Request) {
  const auth = await authorizeAdmin(request, { write: false });
  if ("response" in auth) return auth.response;
  return Response.json(
    { potholes: listAllPotholesForAdmin() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  // Authorize before reading the body, so anonymous clients cannot make the
  // server buffer an upload.
  const auth = await authorizeAdmin(request, { write: true });
  if ("response" in auth) return auth.response;

  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0) {
    return jsonError(411, "A Content-Length header is required.");
  }
  if (length > MAX_BODY_BYTES) {
    return jsonError(413, `Upload is too large. Photos may be up to ${MAX_PHOTO_BYTES / (1024 * 1024)} MB.`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Expected a multipart form upload.");
  }

  const latitude = parseLatitude(form.get("latitude"));
  const longitude = parseLongitude(form.get("longitude"));
  const description = parseRequiredText(form.get("location_description"), "Street description", 500);
  const lane = parseOptionalText(form.get("lane_direction"), "Lane or direction", 200);
  const observedAt = parseObservedAt(form.get("observed_at"));

  const errors: string[] = [];
  for (const r of [latitude, longitude, description, lane, observedAt]) {
    if (!r.ok) errors.push(r.error);
  }
  if (latitude.ok && longitude.ok) {
    const island = checkNotNullIsland(latitude.value, longitude.value);
    if (!island.ok) errors.push(island.error);
  }

  const photo = form.get("photo");
  if (!(photo instanceof File) || photo.size === 0) {
    errors.push("An evidence photo is required.");
  }

  if (errors.length > 0 || !latitude.ok || !longitude.ok || !description.ok || !lane.ok || !observedAt.ok || !(photo instanceof File)) {
    return Response.json({ error: "The record was not saved.", errors }, { status: 422 });
  }

  try {
    const id = createPothole({
      latitude: latitude.value,
      longitude: longitude.value,
      locationDescription: description.value,
      laneDirection: lane.value,
      observedAt: observedAt.value,
      photoBytes: new Uint8Array(await photo.arrayBuffer()),
    });
    return Response.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof PhotoError) {
      return Response.json({ error: "The record was not saved.", errors: [err.message] }, { status: 422 });
    }
    throw err;
  }
}
