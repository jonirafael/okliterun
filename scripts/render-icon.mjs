import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const SIZE = 128;
const SAMPLES = 4;
const RADIUS = 28;

const table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  table[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function insideRoundRect(px, py) {
  const cx = Math.abs(px - SIZE / 2);
  const cy = Math.abs(py - SIZE / 2);
  const dx = cx - (SIZE / 2 - RADIUS);
  const dy = cy - (SIZE / 2 - RADIUS);
  if (dx <= 0 && dy <= 0) {
    return true;
  }
  const ox = Math.max(dx, 0);
  const oy = Math.max(dy, 0);
  return ox * ox + oy * oy <= RADIUS * RADIUS;
}

const triangle = [
  { x: 50, y: 38 },
  { x: 50, y: 90 },
  { x: 94, y: 64 },
];

function sign(p1, p2, p3) {
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

function insideTriangle(point) {
  const [a, b, c] = triangle;
  const d1 = sign(point, a, b);
  const d2 = sign(point, b, c);
  const d3 = sign(point, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

const pixels = Buffer.alloc(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;
    for (let sy = 0; sy < SAMPLES; sy++) {
      for (let sx = 0; sx < SAMPLES; sx++) {
        const px = x + (sx + 0.5) / SAMPLES;
        const py = y + (sy + 0.5) / SAMPLES;
        if (!insideRoundRect(px, py)) {
          continue;
        }
        if (insideTriangle({ x: px, y: py })) {
          red += 255;
          green += 255;
          blue += 255;
        } else {
          red += 15;
          green += 118;
          blue += 110;
        }
        alpha += 255;
      }
    }
    const samples = SAMPLES * SAMPLES;
    const offset = (y * SIZE + x) * 4;
    pixels[offset] = Math.round(red / samples);
    pixels[offset + 1] = Math.round(green / samples);
    pixels[offset + 2] = Math.round(blue / samples);
    pixels[offset + 3] = Math.round(alpha / samples);
  }
}

const raw = Buffer.alloc(SIZE * (1 + SIZE * 4));
for (let y = 0; y < SIZE; y++) {
  const row = y * (1 + SIZE * 4);
  raw[row] = 0;
  pixels.copy(raw, row + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;
ihdr[9] = 6;

const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'media', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`wrote ${out} (${png.length} bytes)`);
