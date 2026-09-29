/**
 * Generates placeholder PNGs for development fixtures. Each image is visibly
 * stamped "DEV FIXTURE / NOT REAL" so it cannot be mistaken for evidence.
 * Uses only node:zlib; no image library needed.
 */
import { crc32, deflateSync } from "node:zlib";

const WIDTH = 480;
const HEIGHT = 360;

// 5x7 bitmap glyphs, only the letters this stamp needs.
const GLYPHS: Record<string, string[]> = {
  A: [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
  D: ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
  E: ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
  F: ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
  I: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
  L: ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
  N: ["#...#", "##..#", "#.#.#", "#.#.#", "#..##", "#...#", "#...#"],
  O: [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  R: ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
  T: ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
  U: ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
  V: ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
  X: ["#...#", "#...#", ".#.#.", "..#..", ".#.#.", "#...#", "#...#"],
  " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
};

type RGB = [number, number, number];

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

export function fixturePng(stripe: RGB): Buffer {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  const set = (x: number, y: number, [r, g, b]: RGB) => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return;
    const i = (y * WIDTH + x) * 3;
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
  };

  // Diagonal stripes: obviously synthetic, never photo-like.
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      set(x, y, Math.floor((x + y) / 24) % 2 === 0 ? stripe : [235, 235, 235]);
    }
  }

  const drawText = (text: string, top: number, scale: number) => {
    const textWidth = (text.length * 6 - 1) * scale;
    const left = Math.floor((WIDTH - textWidth) / 2);
    // White plate behind the text for contrast.
    for (let y = top - scale * 2; y < top + 9 * scale; y++) {
      for (let x = left - scale * 2; x < left + textWidth + scale * 2; x++) {
        set(x, y, [255, 255, 255]);
      }
    }
    [...text].forEach((ch, index) => {
      const glyph = GLYPHS[ch];
      if (!glyph) throw new Error(`No glyph for ${JSON.stringify(ch)}`);
      glyph.forEach((row, gy) => {
        [...row].forEach((cell, gx) => {
          if (cell !== "#") return;
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              set(left + (index * 6 + gx) * scale + dx, top + gy * scale + dy, [0, 0, 0]);
            }
          }
        });
      });
    });
  };
  drawText("DEV FIXTURE", 110, 6);
  drawText("NOT REAL", 200, 6);

  // Each scanline starts with filter type 0 (none).
  const raw = Buffer.alloc(HEIGHT * (WIDTH * 3 + 1));
  for (let y = 0; y < HEIGHT; y++) {
    pixels.copy(raw, y * (WIDTH * 3 + 1) + 1, y * WIDTH * 3, (y + 1) * WIDTH * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
