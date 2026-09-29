import "server-only";
import type Database from "better-sqlite3";
import { openDatabase } from "./db-core.ts";
import { getConfig } from "./config.ts";

// Keep one connection per server process. The global survives dev-mode hot
// reloads, which would otherwise open a new connection on every edit.
const globalForDb = globalThis as unknown as { __potholeDb?: Database.Database };

export function getDb(): Database.Database {
  globalForDb.__potholeDb ??= openDatabase(getConfig().dbFile);
  return globalForDb.__potholeDb;
}
