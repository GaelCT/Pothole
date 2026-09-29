/**
 * Admin password hashing with Node's built-in scrypt.
 *
 * Stored format: scrypt:<log2 N>:<r>:<p>:<salt base64url>:<hash base64url>
 *
 * The separator is ":" rather than "$" on purpose: Next.js expands "$NAME"
 * inside .env files, which would silently corrupt a "$"-delimited hash.
 */
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

const PREFIX = "scrypt";
// OWASP-recommended scrypt parameters: N = 2^17, r = 8, p = 1.
const DEFAULT_LOG_N = 17;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const KEY_LENGTH = 32;
const SALT_BYTES = 16;

type Params = { logN: number; r: number; p: number; salt: Buffer; hash: Buffer };

function scryptAsync(password: string, salt: Buffer, logN: number, r: number, p: number) {
  const N = 2 ** logN;
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      // maxmem must exceed 128 * N * r, or Node rejects the parameters.
      { N, r, p, maxmem: 256 * N * r },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

function parse(stored: string): Params | null {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== PREFIX) return null;
  const [, logNs, rs, ps, saltB64, hashB64] = parts;
  if (![logNs, rs, ps].every((s) => /^\d{1,2}$/.test(s))) return null;
  const logN = Number(logNs);
  const r = Number(rs);
  const p = Number(ps);
  // Bound the parameters so a mistyped hash cannot demand gigabytes of memory.
  if (logN < 14 || logN > 20 || r < 1 || r > 16 || p < 1 || p > 4) return null;
  const b64url = /^[A-Za-z0-9_-]+$/;
  if (!b64url.test(saltB64) || !b64url.test(hashB64)) return null;
  const salt = Buffer.from(saltB64, "base64url");
  const hash = Buffer.from(hashB64, "base64url");
  if (salt.length < 16 || hash.length !== KEY_LENGTH) return null;
  return { logN, r, p, salt, hash };
}

export function isValidHashFormat(stored: string): boolean {
  return parse(stored) !== null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(password, salt, DEFAULT_LOG_N, DEFAULT_R, DEFAULT_P);
  return [
    PREFIX,
    DEFAULT_LOG_N,
    DEFAULT_R,
    DEFAULT_P,
    salt.toString("base64url"),
    hash.toString("base64url"),
  ].join(":");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const params = parse(stored);
  if (!params) return false;
  const candidate = await scryptAsync(password, params.salt, params.logN, params.r, params.p);
  return timingSafeEqual(candidate, params.hash);
}

/** Constant-time string comparison (hashing first equalizes lengths). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a, "utf8").digest();
  const hb = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(ha, hb);
}

/**
 * Short fingerprint of the configured hash, stored in the session. Changing
 * the admin password changes the fingerprint and signs out existing sessions.
 */
export function hashFingerprint(stored: string): string {
  return createHash("sha256").update(stored, "utf8").digest("base64url").slice(0, 22);
}
