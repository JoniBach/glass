#!/usr/bin/env node
// glass visual: screenshot the screen fixtures and the style guide, and compare them with the approved snapshots.
// Any change to how Glass looks has to be approved with --update, like Postcard's visual tests.
//
//   node glass/scripts/visual.mjs [--update] [--base http://127.0.0.1:8080/glass]
//
// Snapshots: glass/tests/snapshots/*.png (committed). Failures write the new render and a diff to glass/.check/.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { launch, openPage, load, screenshot, decodePNG } from './lib/chrome.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const BASE = (() => { const i = args.indexOf('--base'); return i >= 0 ? args[i + 1] : 'http://127.0.0.1:8080/glass'; })();
const UPDATE = args.includes('--update');
const SNAP = path.join(ROOT, 'tests/snapshots'), OUT = path.join(ROOT, '.check');
const TOLERANCE = { channel: 24, pixels: 0.001 }; // a pixel differs if any channel moves > 24; fail above 0.1% of pixels

const SHOTS = [
  { name: 'screen-rest', path: '/screen.html?fixture=rest' },
  { name: 'screen-busy', path: '/screen.html?fixture=busy' },
  { name: 'screen-alert', path: '/screen.html?fixture=alert' },
  { name: 'styleguide', path: '/', full: true },
];

// Minimal PNG encoder (RGB, no filter) for the diff image.
function encodePNG(width, height, rgb) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Compare two screenshots. The diff shows the new render dimmed, with changed pixels in the accent colour.
function compare(a, b) {
  if (a.width !== b.width || a.height !== b.height) return { changed: 1, note: `size ${a.width}×${a.height} → ${b.width}×${b.height}` };
  const n = a.width * a.height, diff = Buffer.alloc(n * 3);
  let changed = 0;
  for (let i = 0; i < n; i++) {
    const oa = i * a.bpp, ob = i * b.bpp;
    const d = Math.max(Math.abs(a.px[oa] - b.px[ob]), Math.abs(a.px[oa + 1] - b.px[ob + 1]), Math.abs(a.px[oa + 2] - b.px[ob + 2]));
    if (d > TOLERANCE.channel) { changed++; diff[i * 3] = 255; diff[i * 3 + 1] = 179; diff[i * 3 + 2] = 71; }
    else diff[i * 3] = diff[i * 3 + 1] = diff[i * 3 + 2] = b.px[ob + 1] >> 2;
  }
  return { changed: changed / n, diff: encodePNG(b.width, b.height, diff) };
}

fs.mkdirSync(SNAP, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });
const chrome = await launch();
let failed = 0;
try {
  for (const s of SHOTS) {
    const p = await openPage(chrome.port);
    await load(p, BASE + s.path);
    const png = await screenshot(p, { full: s.full });
    p.close();
    const snap = path.join(SNAP, `${s.name}.png`);
    if (!fs.existsSync(snap)) { fs.writeFileSync(snap, png); console.log(`  created ${s.name}`); continue; }
    const r = compare(decodePNG(fs.readFileSync(snap)), decodePNG(png));
    if (r.changed <= TOLERANCE.pixels) { console.log(`  ✓ ${s.name}`); continue; } // unchanged: never rewritten, even with --update
    if (UPDATE) { fs.writeFileSync(snap, png); console.log(`  updated ${s.name}`); continue; }
    failed++;
    fs.writeFileSync(path.join(OUT, `${s.name}.new.png`), png);
    if (r.diff) fs.writeFileSync(path.join(OUT, `${s.name}.diff.png`), r.diff);
    console.log(`  ✗ ${s.name}: ${r.note || `${(r.changed * 100).toFixed(2)}% of pixels changed`} (see glass/.check/${s.name}.diff.png; approve with --update)`);
  }
} finally {
  chrome.close();
}
process.exit(failed ? 1 : 0);
