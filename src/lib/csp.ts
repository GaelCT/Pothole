/**
 * Content-Security-Policy for HTML page responses.
 *
 * Applied per request by src/proxy.ts with a fresh nonce. Next.js reads the
 * nonce from the request's CSP header during rendering and adds it to its own
 * <script> tags; 'strict-dynamic' then lets those trusted scripts load the
 * rest of the app's chunks (including the dynamic import("leaflet") chunk).
 *
 * Route handlers under /api are not covered (the proxy matcher skips them);
 * /api/photos/[id] sets its own locked-down policy.
 *
 * This module must stay free of Node-only or server-only imports because the
 * proxy bundle includes it.
 */

/**
 * Every third-party origin the site is allowed to contact, and why.
 * Adding an origin here widens the policy for every page: keep it minimal.
 */
export const CSP_THIRD_PARTY_ORIGINS = {
  /** MapTiler: raster tile <img>s and the tiles.json key check (fetch). */
  mapTiles: "https://api.maptiler.com",
} as const;

/** 128 bits of randomness, base64-encoded, as CSP nonces expect. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildContentSecurityPolicy(nonce: string, isDev: boolean): string {
  const { mapTiles } = CSP_THIRD_PARTY_ORIGINS;
  const directives: string[] = [
    "default-src 'self'",
    // 'unsafe-eval' only in development: React uses eval there to rebuild
    // server error stacks in the browser. Production never needs it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // 'unsafe-inline' is required because Leaflet positions map panes, tiles
    // and markers with inline style attributes, which a nonce cannot cover
    // (nonces only apply to <style>/<link> elements). Style injection is far
    // less dangerous than script injection, and scripts stay nonce-locked.
    "style-src 'self' 'unsafe-inline'",
    // data:/blob: for Leaflet's CSS-embedded images; MapTiler for tiles.
    `img-src 'self' data: blob: ${mapTiles}`,
    // 'self' also covers the same-origin dev HMR WebSocket (ws://).
    `connect-src 'self' ${mapTiles}`,
    // blob: lets the dashcam page play a video chosen from this computer
    // (an object URL). Nothing is fetched from another origin.
    "media-src 'self' blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  // Only in production: on plain-http local dev it would rewrite
  // subresource requests to https and break them.
  if (!isDev) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}
