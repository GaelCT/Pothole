import "server-only";

/**
 * Brute-force protection for the single admin login.
 *
 * Deliberately global rather than per-IP: client IPs are unreliable behind a
 * proxy. The trade-off is that someone hammering the form can lock out the
 * admin for up to one window. They still cannot sign in. State is in memory,
 * so it resets when the server restarts.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const state = globalThis as unknown as { __loginFailures?: number[] };

function recentFailures(now: number): number[] {
  state.__loginFailures = (state.__loginFailures ?? []).filter((t) => now - t < WINDOW_MS);
  return state.__loginFailures;
}

/** Milliseconds until logins are allowed again, or 0 if not locked. */
export function lockoutRemainingMs(now = Date.now()): number {
  const failures = recentFailures(now);
  if (failures.length < MAX_FAILURES) return 0;
  return WINDOW_MS - (now - failures[failures.length - MAX_FAILURES]);
}

export function recordLoginFailure(now = Date.now()): void {
  recentFailures(now).push(now);
}

export function clearLoginFailures(): void {
  state.__loginFailures = [];
}
