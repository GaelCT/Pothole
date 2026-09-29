import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, createNonce } from "@/lib/csp";

/**
 * Adds a per-request nonce-based Content-Security-Policy to page responses.
 *
 * The CSP is set on the forwarded request too: Next.js reads the nonce from
 * that request header while rendering and puts it on its own <script> tags.
 *
 * This proxy deliberately does nothing else. It performs no authentication
 * (pages, Server Actions and route handlers check the session themselves),
 * never reads the request body, and never redirects or rewrites.
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except:
      // - /api/*: route handlers are not HTML, and keeping them out of the
      //   proxy means request bodies (the admin photo upload, up to
      //   10 MB + 64 KB) are never buffered or truncated by the proxy's
      //   body-clone limit (experimental.proxyClientMaxBodySize, 10 MB).
      // - Next.js static assets, image optimizer, and the favicon.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      // Link prefetches don't render HTML, so they need no nonce.
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
