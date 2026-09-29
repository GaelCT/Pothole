/**
 * Environment configuration loading. No fallbacks: every required value must
 * be set, and all problems are reported together in one visible error.
 *
 * Kept free of `server-only` so instrumentation can validate at startup.
 * Application code should import `getConfig` from ./config instead.
 */
import path from "node:path";
import { isValidHashFormat } from "./password.ts";
import { dbFilePath } from "./db-core.ts";

export type AppConfig = {
  dataDir: string;
  dbFile: string;
  adminUsername: string;
  adminPasswordHash: string;
  sessionSecret: string;
  /** Production requires HTTPS; cookies are marked Secure. */
  isProduction: boolean;
};

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function loadConfig(env: NodeJS.ProcessEnv): AppConfig {
  const problems: string[] = [];
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) problems.push(`${name} is not set.`);
    return value ?? "";
  };

  const dataDir = required("DATA_DIR");
  const adminUsername = required("ADMIN_USERNAME");
  const adminPasswordHash = required("ADMIN_PASSWORD_HASH");
  const sessionSecret = required("SESSION_SECRET");

  if (sessionSecret && sessionSecret.length < 32) {
    problems.push("SESSION_SECRET must be at least 32 characters.");
  }
  if (adminPasswordHash && !isValidHashFormat(adminPasswordHash)) {
    problems.push(
      "ADMIN_PASSWORD_HASH is not in the format produced by `npm run hash-password`.",
    );
  }

  if (problems.length > 0) {
    throw new ConfigError(
      `Server configuration is incomplete:\n  - ${problems.join("\n  - ")}\n` +
        'See README.md, section "Configure".',
    );
  }

  // Runtime-only path: tell the bundler not to trace the filesystem from here.
  const resolvedDataDir = path.resolve(/*turbopackIgnore: true*/ dataDir);
  return {
    dataDir: resolvedDataDir,
    dbFile: dbFilePath(resolvedDataDir),
    adminUsername,
    adminPasswordHash,
    sessionSecret,
    isProduction: env.NODE_ENV === "production",
  };
}
