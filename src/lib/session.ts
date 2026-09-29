import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession, type SessionOptions } from "iron-session";
import { getConfig } from "./config.ts";
import { hashFingerprint } from "./password.ts";

type AdminSessionData = {
  username: string;
  /** Fingerprint of the password hash at login; a password change invalidates it. */
  credential: string;
  loggedInAt: number;
};

export type AdminSession = { username: string };

const SESSION_TTL_SECONDS = 8 * 60 * 60;

function sessionOptions(): SessionOptions {
  const config = getConfig();
  return {
    // The __Host- prefix makes browsers require Secure, Path=/ and no Domain.
    cookieName: config.isProduction ? "__Host-pothole_admin" : "pothole_admin",
    password: config.sessionSecret,
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: "lax",
      path: "/",
    },
    onUnsealError: (reason) => {
      if (reason !== "expired") console.warn(`[auth] rejected session cookie: ${reason}`);
    },
  };
}

async function rawSession() {
  // cookies() comes first: it marks the route as request-time, so nothing
  // below (config, secrets) is ever evaluated during the build.
  const store = await cookies();
  return getIronSession<AdminSessionData>(store, sessionOptions());
}

/** The signed-in administrator, or null. Memoized per request. */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const session = await rawSession();
  const config = getConfig();
  if (
    session.username !== config.adminUsername ||
    session.credential !== hashFingerprint(config.adminPasswordHash)
  ) {
    return null;
  }
  return { username: session.username };
});

/** For admin pages: redirect to the login page unless signed in. */
export async function requireAdminPage(): Promise<AdminSession> {
  const admin = await getAdminSession();
  if (!admin) redirect("/login");
  return admin;
}

/** Only call after the credentials have been verified. */
export async function startAdminSession(username: string): Promise<void> {
  const config = getConfig();
  const session = await rawSession();
  session.username = username;
  session.credential = hashFingerprint(config.adminPasswordHash);
  session.loggedInAt = Date.now();
  await session.save();
}

export async function endAdminSession(): Promise<void> {
  const session = await rawSession();
  session.destroy();
}
