/**
 * Private evidence-photo storage on the persistent volume.
 *
 * Photos live in <DATA_DIR>/photos, outside the web root, and are only ever
 * served through the access-checked route in app/api/photos/[id]. File names
 * are generated here (never taken from the upload) and validated on read, so a
 * stored path cannot point outside the photos directory.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;
export type PhotoExt = keyof typeof CONTENT_TYPES;

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PHOTO_FILE_RE = new RegExp(`^${UUID}\\.(jpg|png|webp)$`);
export const UUID_RE = new RegExp(`^${UUID}$`);

export class PhotoError extends Error {}

/** Identify the image type from its leading bytes, ignoring any claimed type. */
export function detectImageType(bytes: Uint8Array): PhotoExt | null {
  const starts = (sig: number[], offset = 0) =>
    bytes.length >= offset + sig.length && sig.every((b, i) => bytes[offset + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "jpg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  // RIFF....WEBP
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "webp";
  return null;
}

export function photosDir(dataDir: string): string {
  return path.join(dataDir, "photos");
}

/**
 * Write a new photo and return its stored file name. Refuses to overwrite.
 * `id` lets callers tie the file name to a record; it must be a UUID.
 */
export function writePhoto(dataDir: string, bytes: Uint8Array, id: string = randomUUID()): string {
  if (!UUID_RE.test(id)) throw new PhotoError("Photo id must be a UUID.");
  if (bytes.length === 0) throw new PhotoError("The photo file is empty.");
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new PhotoError(`The photo is larger than ${MAX_PHOTO_BYTES / (1024 * 1024)} MB.`);
  }
  const ext = detectImageType(bytes);
  if (!ext) throw new PhotoError("The photo must be a JPEG, PNG, or WebP image.");

  const dir = photosDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${id}.${ext}`;
  fs.writeFileSync(path.join(dir, name), bytes, { flag: "wx", mode: 0o600 });
  return name;
}

export function deletePhoto(dataDir: string, name: string): void {
  if (!PHOTO_FILE_RE.test(name)) return;
  fs.rmSync(path.join(photosDir(dataDir), name), { force: true });
}

/** Read a stored photo. Throws PhotoError if the name is invalid or the file is missing. */
export function readPhoto(dataDir: string, name: string): { bytes: Buffer; contentType: string } {
  const match = PHOTO_FILE_RE.exec(name);
  if (!match) throw new PhotoError(`Stored photo name is invalid: ${JSON.stringify(name)}`);
  const ext = match[1] as PhotoExt;
  try {
    return {
      bytes: fs.readFileSync(path.join(photosDir(dataDir), name)),
      contentType: CONTENT_TYPES[ext],
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new PhotoError(`Photo file is missing from storage: ${name}`);
    }
    throw err;
  }
}
