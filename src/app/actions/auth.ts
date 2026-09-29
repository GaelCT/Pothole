"use server";

import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";
import { safeEqual, verifyPassword } from "@/lib/password";
import { endAdminSession, startAdminSession } from "@/lib/session";
import {
  clearLoginFailures,
  lockoutRemainingMs,
  recordLoginFailure,
} from "@/lib/login-throttle";

export type LoginState = { error: string } | undefined;

const GENERIC_FAILURE = "Incorrect username or password.";

// Server Actions get Next.js's built-in Origin check (CSRF). Everything else
// here treats the form data as untrusted input.
export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = formData.get("username");
  const password = formData.get("password");
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    return { error: "Enter your username and password." };
  }

  const lockedMs = lockoutRemainingMs();
  if (lockedMs > 0) {
    return {
      error: `Too many failed sign-in attempts. Try again in ${Math.ceil(lockedMs / 60000)} minutes.`,
    };
  }

  // Oversized input cannot be a valid credential; do not spend scrypt on it.
  if (username.length > 256 || password.length > 1024) {
    recordLoginFailure();
    return { error: GENERIC_FAILURE };
  }

  const config = getConfig();
  // Always run the password check so timing does not reveal the username.
  const usernameOk = safeEqual(username, config.adminUsername);
  const passwordOk = await verifyPassword(password, config.adminPasswordHash);
  if (!usernameOk || !passwordOk) {
    recordLoginFailure();
    return { error: GENERIC_FAILURE };
  }

  clearLoginFailures();
  await startAdminSession(config.adminUsername);
  redirect("/admin");
}

export async function logout(): Promise<void> {
  await endAdminSession();
  redirect("/login");
}
