import "server-only";
import { getAdminSession, type AdminSession } from "./session.ts";

/**
 * CSRF defense for state-changing route handlers, mirroring the check Next.js
 * applies to Server Actions, but stricter: a missing Origin is rejected.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host"))
    ?.split(",")[0]
    ?.trim();
  return Boolean(host) && originHost === host;
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Authorize an admin API request. Returns the session, or an error Response to
 * send back. Writes additionally require a same-origin request.
 */
export async function authorizeAdmin(
  request: Request,
  { write }: { write: boolean },
): Promise<{ admin: AdminSession } | { response: Response }> {
  const admin = await getAdminSession();
  if (!admin) return { response: jsonError(401, "Sign in as the administrator first.") };
  if (write && !isSameOrigin(request)) {
    return { response: jsonError(403, "Cross-origin write requests are not allowed.") };
  }
  return { admin };
}
