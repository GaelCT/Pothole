import "server-only";
import { loadConfig, type AppConfig } from "./config-core.ts";

let cached: AppConfig | undefined;

/** Validated server configuration. Throws ConfigError if anything is missing. */
export function getConfig(): AppConfig {
  cached ??= loadConfig(process.env);
  return cached;
}
