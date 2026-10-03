import { getConfig } from "@/lib/config";
import { getAdminSession } from "@/lib/session";
import { getAttempt } from "@/lib/filing";
import { readPhoto, UUID_RE } from "@/lib/photo-files";

const notFound = () =>
  new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

/**
 * Receipt screenshots are admin-only: they can show the operator's city
 * account details. Anyone else gets 404, the same as a missing receipt.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/admin/receipts/[attemptId]">) {
  const { attemptId } = await ctx.params;
  if (!UUID_RE.test(attemptId)) return notFound();
  if (!(await getAdminSession())) return notFound();
  const attempt = getAttempt(attemptId);
  if (!attempt?.receipt_evidence) return notFound();

  const photo = readPhoto(getConfig().dataDir, attempt.receipt_evidence);
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Content-Length": String(photo.bytes.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
