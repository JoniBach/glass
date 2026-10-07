// Shared by check.mjs and visual.mjs: headless Chrome over the DevTools protocol, PNG decoding, luminance.
// No dependencies (Node 22+ for the built-in WebSocket).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';

export const CHROME = process.env.GLASS_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const W = 1080, H = 1920;

// ---------- Chrome over CDP ----------
export async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'glass-check-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars',
    '--no-first-run', '--force-device-scale-factor=1', `--window-size=${W},${H}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chrome did not start')), 20000);
    proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); resolve(m[1]); } });
  });
  const port = new URL(wsUrl).port;
  const close = () => { proc.kill(); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500); };
  return { port, close };
}

export async function openPage(port) {
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const n = ++id; pending.set(n, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  return { send, evaluate, close: () => ws.close() };
}

// ---------- PNG decode (8-bit RGB/RGBA, non-interlaced: what Chrome produces) ----------
export function decodePNG(buf) {
  let pos = 8, width, height, ctype; const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString('ascii', pos + 4, pos + 8), data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); ctype = data[9]; if (data[8] !== 8 || data[12]) throw new Error('unsupported PNG'); }
    else if (type === 'IDAT') idat.push(data);
    pos += 12 + len;
  }
  const bpp = ctype === 6 ? 4 : 3, stride = width * bpp, raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, b = y ? px[o + x - stride] : 0, c = x >= bpp && y ? px[o + x - stride - bpp] : 0;
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? paeth(a, b, c) : 0;
      px[o + x] = (src[x] + pred) & 255;
    }
  }
  return { width, height, bpp, px };
}
function paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }

const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const LUT = Array.from({ length: 256 }, (_, i) => lin(i));
export const lum = (r, g, b) => 0.2126 * LUT[r] + 0.7152 * LUT[g] + 0.0722 * LUT[b];

// Load a URL and wait until it has settled: the live page never finishes loading (SSE), so wait, then let animations end.
export async function load(p, url) {
  await p.send('Page.enable');
  await p.send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 2500));
  await p.evaluate(`Promise.all(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished)).then(() => new Promise(r => setTimeout(r, 1000)))`);
}

// Screenshot; full = the whole page height, not just the viewport.
export async function screenshot(p, { full = false } = {}) {
  if (full) {
    const { cssContentSize } = await p.send('Page.getLayoutMetrics');
    await p.send('Emulation.setDeviceMetricsOverride', { width: W, height: Math.ceil(cssContentSize.height), deviceScaleFactor: 1, mobile: false });
    await new Promise((r) => setTimeout(r, 500));
  }
  return Buffer.from((await p.send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
}
