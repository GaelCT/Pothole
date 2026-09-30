import { getConfig } from "@/lib/config";
import { getAdminSession } from "@/lib/session";
import { getPotholeRow, isPubliclyVisible } from "@/lib/potholes";
import { readPhoto, UUID_RE } from "@/lib/photo-files";

const notFound = () =>
  new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * The only way to fetch an evidence photo.
 *
 * - Default: the reviewed copy (metadata stripped, redacted). Visitors get it
 *   only for publicly visible records; admins get it for any record that has
 *   one.
 * - `?variant=original`: the untouched upload, admin only. It may still
 *   contain GPS metadata, faces or plates, so it is never shown publicly.
 *
 * Hidden, nonexistent, and not-yet-reviewed all return 404, so the response
 * does not reveal which is which.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound();

  const variant = new URL(request.url).searchParams.get("variant") ?? "reviewed";
  if (variant !== "reviewed" && variant !== "original") return notFound();

  const row = getPotholeRow(id);
  if (!row) return notFound();

  const admin = await getAdminSession();
  let file: string | null;
  if (variant === "original") {
    if (!admin) return notFound();
    file = row.photo_path;
  } else {
    if (!admin && !isPubliclyVisible(row)) return notFound();
    file = row.redacted_photo_path;
  }
  if (!file) return notFound();

  // A missing file for an existing record is a storage fault, not a 404:
  // readPhoto throws and the request fails loudly.
  const photo = readPhoto(getConfig().dataDir, file);
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.bytes.length),
      // Visibility can be revoked at any time, so never let a cache keep it.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
