import { getConfig } from "@/lib/config";
import { getAdminSession } from "@/lib/session";
import { getPotholeRow, isPubliclyVisible } from "@/lib/potholes";
import { readPhoto, UUID_RE } from "@/lib/photo-files";

const notFound = () =>
  new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * The only way to fetch an evidence photo. Admins can see any photo; everyone
 * else only sees photos of publicly visible records. Hidden and nonexistent
 * records both return 404, so the response does not reveal which is which.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/photos/[id]">) {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return notFound();

  const row = getPotholeRow(id);
  if (!row) return notFound();

  const admin = await getAdminSession();
  if (!admin && !isPubliclyVisible(row)) return notFound();

  // A missing file for an existing record is a storage fault, not a 404:
  // readPhoto throws and the request fails loudly.
  const photo = readPhoto(getConfig().dataDir, row.photo_path);
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
