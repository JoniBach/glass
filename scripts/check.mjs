#!/usr/bin/env node
// glass check: render pages headlessly and test them against the Glass principles (docs/principles.md).
// No dependencies: drives Chrome over the DevTools protocol and decodes the screenshot itself.
//
//   node glass/scripts/check.mjs [--base http://127.0.0.1:8080/glass] [--live <screen link>] [--only rest,busy,live] [--json]
// The live scenario runs when --live gives a Glass link (an app prints its own, e.g. `mirror link`).
//
// Exit code 1 if any rule fails. Screenshots land in glass/.check/<scenario>.png.

import fs from 'node:fs';
import path from 'node:path';
import { tokens, sizeFor } from './tokens.mjs';
import { W, H, launch, openPage, decodePNG, lum, load, screenshot } from './lib/chrome.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('base', 'http://127.0.0.1:8080/glass');
const B = tokens.budget, I = tokens.inputs;

const SCENARIOS = [
  { name: 'rest', path: '/screen.html?fixture=rest', litMax: B.litAreaRest, centre: true },
  { name: 'busy', path: '/screen.html?fixture=busy', litMax: B.litAreaBusy, centre: false },
  { name: 'alert', path: '/screen.html?fixture=alert', litMax: B.litAreaBusy, centre: false },
  ...(opt('live') ? [{ name: 'live', url: opt('live'), litMax: B.litAreaBusy, centre: false }] : []),
].filter((s) => !opt('only') || opt('only').split(',').includes(s.name));
if (!opt('live')) console.log('(no --live link given: checking the fixtures only)');


function litStats({ width, height, bpp, px }) {
  let lit = 0, band = 0, bandPx = 0;
  const [b0, b1] = B.centreBand.map((f) => Math.round(f * height));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * bpp, on = lum(px[o], px[o + 1], px[o + 2]) > B.litLuminance;
    lit += on;
    if (y >= b0 && y < b1) { bandPx++; band += on; }
  }
  return { lit: lit / (width * height), centre: band / bandPx };
}

// ---------- in-page collector ----------
const COLLECT = `(() => {
  const vis = (el) => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length; };
  const opacity = (el) => { let o = 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) o *= Number(getComputedStyle(e).opacity); return o; };
  const sel = (el) => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + (el.parentElement?.closest('[id]') ? ' in #' + el.parentElement.closest('[id]').id : '');
  const text = [], fills = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg') || !vis(el)) continue;
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
    if (own) text.push({ sel: sel(el), text: own.slice(0, 40), bottom: Math.round(r.bottom), right: Math.round(r.right), size: parseFloat(s.fontSize), weight: Number(s.fontWeight), color: s.color,
      opacity: opacity(el), tier: el.closest('[data-gl-tier]')?.dataset.glTier || 'near', title: /^H[1-3]$/.test(el.tagName) });
    const bg = s.backgroundColor, m = bg.match(/rgba?\\(([\\d.]+), ([\\d.]+), ([\\d.]+)(?:, ([\\d.]+))?\\)/);
    if (m && (m[4] === undefined || Number(m[4]) > 0) && (+m[1] + +m[2] + +m[3]) > 0 && r.width > 4 && r.height > 4)
      fills.push({ sel: sel(el), w: Math.round(r.width), h: Math.round(r.height), color: bg });
  }
  const loops = document.getAnimations().filter((a) => a.effect?.getTiming().iterations === Infinity).map((a) => a.animationName || 'animation');
  const short = [];
  const ms = (v) => v.split(',').map((t) => parseFloat(t) * (t.trim().endsWith('ms') ? 1 : 1000));
  for (const sheet of document.styleSheets) { let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) { const st = rule.style; if (!st) continue;
      for (const prop of ['transitionDuration', 'animationDuration']) if (st[prop]) for (const d of ms(st[prop])) if (d > 0 && d < ${parseFloat(tokens.motion['min-duration'])}) short.push(rule.selectorText + ' ' + prop + ' ' + d + 'ms'); } }
  return { text, fills, loops, short, ready: document.readyState };
})()`;

// ---------- rules ----------
const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
const INK2 = lum(...rgb(tokens.ink['ink-2'].match(/\w\w/g).map((h) => `${parseInt(h, 16)}`).join(',')));
const FLOOR = { room: sizeFor(I.distanceRoomM, I.floorArcmin), near: sizeFor(I.distanceNearM, I.floorArcmin) };
const TITLE_FLOOR = sizeFor(I.distanceNearM, I.comfortArcmin);
const WEIGHT_FLOOR = { room: 300, near: 400 };

function judge(sc, page, shot) {
  const fail = [], pass = [];
  const rule = (id, ok, msg) => (ok ? pass : fail).push(`${id} ${msg}`);

  // §1 Black is the mirror: no fills
  rule('§1 ground', !page.fills.length, page.fills.length ? `non-black fills: ${page.fills.map((f) => `${f.sel} ${f.w}×${f.h} ${f.color}`).join('; ')}` : 'no fills');
  // §2 lit-area budget, no large filled rectangles
  rule('§2 lit-area', shot.lit <= sc.litMax, `${(shot.lit * 100).toFixed(1)}% lit (budget ${sc.litMax * 100}%)`);
  const big = page.fills.filter((f) => (f.w * f.h) / (W * H) > B.fillMaxArea);
  rule('§2 fill-size', !big.length, big.length ? `fills over ${B.fillMaxArea * 100}%: ${big.map((f) => f.sel).join(', ')}` : 'no large fills');
  // §3 readable text is ink-1/ink-2
  const faint = page.text.filter((t) => t.tier !== 'decor' && lum(...rgb(t.color).slice(0, 3)) * t.opacity < INK2 * 0.98);
  rule('§3 ink', !faint.length, faint.length ? `readable text below ink-2: ${faint.map((t) => `${t.sel} "${t.text}" ${t.color}`).join('; ')}` : 'readable text is ink-1/ink-2');
  // §4 size and weight per tier
  const small = page.text.filter((t) => t.tier !== 'decor' && t.size < (t.title ? Math.max(TITLE_FLOOR, FLOOR[t.tier]) : FLOOR[t.tier]));
  rule('§4 size', !small.length, small.length ? `below the floor (room ${FLOOR.room}px, near ${FLOOR.near}px, titles ${TITLE_FLOOR}px): ${small.map((t) => `${t.sel} "${t.text}" ${t.size}px [${t.tier}]`).join('; ')}` : 'all text meets its tier floor');
  const thin = page.text.filter((t) => t.tier !== 'decor' && t.weight < WEIGHT_FLOOR[t.tier]);
  rule('§4 weight', !thin.length, thin.length ? `too thin: ${thin.map((t) => `${t.sel} "${t.text}" ${t.weight} [${t.tier}]`).join('; ')}` : 'weights meet the floor');
  // §6 calm motion
  rule('§6 motion', !page.loops.length && !page.short.length,
    page.loops.length || page.short.length ? `loops: ${page.loops.join(', ') || 'none'}; too fast: ${page.short.join(', ') || 'none'}` : 'no loops, nothing faster than the minimum');
  // §7 fit: nothing cut off at the edge of the glass
  const cut = page.text.filter((t) => t.bottom > H || t.right > W);
  rule('§7 fit', !cut.length, cut.length ? `cut off: ${cut.map((t) => `${t.sel} "${t.text}"`).join('; ')}` : 'everything fits on the glass');
  // §7 centre clear at rest
  if (sc.centre) rule('§7 centre', shot.centre <= B.centreLitMax, `${(shot.centre * 100).toFixed(2)}% of the centre band lit (max ${B.centreLitMax * 100}%)`);
  return { fail, pass };
}

// ---------- run ----------
const outDir = path.join(ROOT, '.check');
fs.mkdirSync(outDir, { recursive: true });
const chrome = await launch();
const results = [];
try {
  for (const sc of SCENARIOS) {
    const p = await openPage(chrome.port);
    await load(p, sc.url || BASE + sc.path);
    const page = await p.evaluate(COLLECT);
    const png = await screenshot(p);
    fs.writeFileSync(path.join(outDir, `${sc.name}.png`), png);
    const shot = litStats(decodePNG(png));
    results.push({ scenario: sc.name, ...judge(sc, page, shot), screenshot: path.join(outDir, `${sc.name}.png`) });
    p.close();
  }
} finally {
  chrome.close();
}

if (args.includes('--json')) console.log(JSON.stringify(results, null, 2));
else for (const r of results) {
  console.log(`\n${r.scenario}  ${r.fail.length ? `✗ ${r.fail.length} failed` : '✓ passed'}  (${r.screenshot})`);
  for (const f of r.fail) console.log(`  ✗ ${f}`);
  for (const p of r.pass) console.log(`  ✓ ${p}`);
}
process.exit(results.some((r) => r.fail.length) ? 1 : 0);
