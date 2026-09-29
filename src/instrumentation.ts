/**
 * Runs once when the server starts. Validates configuration and applies
 * database migrations up front, so a misconfigured deployment fails at boot
 * with a clear message instead of on the first visitor's request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Nothing is read at build time; the build must not need secrets or a DB.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { loadConfig } = await import("./lib/config-core");
  const { openDatabase } = await import("./lib/db-core");

  const config = loadConfig(process.env);
  const db = openDatabase(config.dbFile);
  const version = db.prepare("SELECT MAX(version) FROM schema_migrations").pluck().get();
  db.close();
  console.log(`[startup] data directory ${config.dataDir}, schema version ${version}`);
}
