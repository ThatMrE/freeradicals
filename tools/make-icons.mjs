#!/usr/bin/env node
/**
 * Draws the toolbar icons with no dependencies and no binary assets in git.
 *
 * The mark is a free radical: a ring with a gap and one unpaired electron
 * sitting outside it. Rendered analytically at 4x and box-filtered down, which
 * is all the anti-aliasing a 16px icon needs.
 *
 *   node tools/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'extension', 'icons');
const SS = 4; // supersampling factor
const ACCENT = [124, 140, 255];

/** @returns {[number,number,number,number]} premultiplied-free RGBA at a point */
function shade(x, y, size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.30;          // ring radius
  const w = size * 0.115;         // ring thickness
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.hypot(dx, dy);

  // Gap in the ring, pointing up-right, where the electron broke away.
  const angle = Math.atan2(-dy, dx);          // 0 = east, +ve = north
  const gapCenter = Math.PI / 4;
  const gapHalf = 0.42;
  const inGap = Math.abs(normalizeAngle(angle - gapCenter)) < gapHalf;

  const onRing = !inGap && Math.abs(dist - r) <= w / 2;

  // The unpaired electron.
  const ex = cx + Math.cos(gapCenter) * size * 0.40;
  const ey = cy - Math.sin(gapCenter) * size * 0.40;
  const onDot = Math.hypot(x - ex, y - ey) <= size * 0.115;

  return onRing || onDot ? [...ACCENT, 255] : [0, 0, 0, 0];
}

function normalizeAngle(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const [pr, pg, pb, pa] = shade(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS, size);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      rgba[i] = a ? Math.round(r / a) : 0;
      rgba[i + 1] = a ? Math.round(g / a) : 0;
      rgba[i + 2] = a ? Math.round(b / a) : 0;
      rgba[i + 3] = Math.round(a / n);
    }
  }
  return rgba;
}

/* --- minimal PNG encoder -------------------------------------------------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // colour type: RGBA
  // 10..12 = compression, filter, interlace = 0

  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, png(size, render(size)));
  console.log(`wrote ${file}`);
}
