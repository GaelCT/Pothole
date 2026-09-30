/**
 * Produces the reviewed photo copy: auto-oriented, every metadata block
 * (EXIF, GPS, XMP, ICC, camera serials) removed, and solid black boxes painted
 * over whatever the reviewer marked. Black boxes replace pixels outright, so
 * nothing underneath can be recovered from the copy.
 *
 * The original upload is kept privately (admin-only) so a redaction can be
 * redone, but only this copy is ever published or filed with the city.
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import { detectImageType } from "./photo-files.ts";
import type { RedactionBox } from "./review-rules.ts";

// Refuse absurd images (decompression bombs) well below libvips' default.
const MAX_INPUT_PIXELS = 100_000_000;

const open = (bytes: Uint8Array) => sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS });

/** Width and height as the photo is displayed, after EXIF orientation. */
export async function orientedSize(bytes: Uint8Array): Promise<{ width: number; height: number }> {
  const { info } = await open(bytes).rotate().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height };
}

export async function renderRedactedCopy(
  bytes: Uint8Array,
  boxes: readonly RedactionBox[],
): Promise<Buffer> {
  const type = detectImageType(bytes);
  if (!type) throw new Error("Unsupported image type.");

  // rotate() bakes the EXIF orientation into the pixels so the boxes land
  // where the reviewer drew them. sharp writes no metadata unless asked to.
  const oriented = await open(bytes).rotate().toBuffer();
  const image = sharp(oriented).composite(
    boxes.map((b) => ({
      input: { create: { width: b.width, height: b.height, channels: 3, background: "#000000" } },
      left: b.x,
      top: b.y,
    })),
  );
  if (type === "png") return image.png().toBuffer();
  if (type === "webp") return image.webp({ quality: 90 }).toBuffer();
  return image.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
