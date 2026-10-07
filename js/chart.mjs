// Glass charts: small, glanceable data views inside a card, from four plain fields any card can carry:
//   chart: line | bars        data: 8,210 8,225 8,198 | 8000 8050 8100   (series split by "|", values by spaces or ", ")
//   labels: Mon, Tue, Wed     series: FTSE 100, S&P 500               unit: W   (or $, £, €, % …)
// Rules (Glass + the dataviz method, adapted to a screen nobody touches):
// - Brightness, not colour (§3): one series in ink-1; a second is context in ink-3 (emphasis). Never more than two.
// - Thin marks: 2px lines with a round end dot; bars ≤ 16px with a 4px round data end; one hairline baseline;
//   no gridlines, no fills behind the plot (§1, §2).
// - Labels are HTML text in text inks (checked like all text); the marks carry identity. Values are labelled
//   selectively: the line's last value, low and high; each bar at its tip.
// - No hover: nothing on the glass is interactive, so every value the reader needs is printed. No d3: Glass has
//   no dependencies, and these forms need only a linear scale and a path.
import { esc } from './render.mjs';

export const MAX_POINTS = 120, MAX_BARS = 7, MAX_SERIES = 2;

// A value: digits with an optional sign, decimal point and exponent; thousands commas and unit marks are dropped.
const num = (s) => { const t = String(s).replace(/[^\d.eE+\-]/g, ''); const v = Number(t); return /\d/.test(t) && Number.isFinite(v) ? v : null; };
const list = (s, sep) => String(s ?? '').split(sep).map((x) => x.trim()).filter(Boolean);

// Parse the text fields into { kind, series: [{ name, values }], labels, unit }. Returns null if there's nothing to draw.
export function spec(c) {
  if (!c?.chart || !c?.data) return null;
  const kind = /^bars?$/i.test(c.chart) ? 'bars' : 'line';
  const names = list(c.series, ',');
  const series = list(c.data, '|').slice(0, MAX_SERIES).map((d, i) => ({ name: names[i] || '', values: d.split(/\s*,\s+|\s+/).filter(Boolean).map(num) }));
  if (!series.length || !series[0].values.some((v) => v != null)) return null;
  return { kind, series, labels: list(c.labels, ','), unit: String(c.unit ?? '').trim() };
}

// Mean of each bucket, so long series keep their shape within MAX_POINTS.
export function downsample(values, max = MAX_POINTS) {
  if (values.length <= max) return values;
  const out = [], step = values.length / max;
  for (let i = 0; i < max; i++) {
    const b = values.slice(Math.floor(i * step), Math.floor((i + 1) * step)).filter((v) => v != null);
    out.push(b.length ? b.reduce((a, v) => a + v, 0) / b.length : null);
  }
  return out;
}

// 1,284 · 12.9K · 4.2M; currency and % units attach, others follow a thin space.
export function format(v, unit = '') {
  const a = Math.abs(v);
  const n = a >= 1e6 ? `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M` : a >= 1e4 ? `${(v / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`
    : v.toLocaleString('en-GB', { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 });
  if (!unit) return n;
  return /^[$£€¥]$/.test(unit) ? (v < 0 ? `-${unit}${n.replace('-', '')}` : `${unit}${n}`) : unit === '%' ? `${n}%` : `${n} ${unit}`;
}

const W = 1000, H = 240, PAD = 10; // plot viewBox; strokes don't scale (vector-effect), so the box can stretch

function line(s) {
  const all = s.series.flatMap((x) => downsample(x.values)).filter((v) => v != null);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (lo === hi) { lo -= 1; hi += 1; }
  const y = (v) => PAD + (H - 2 * PAD) * (1 - (v - lo) / (hi - lo));
  const paths = s.series.map((x, i) => {
    const vals = downsample(x.values), dx = (W - 2 * PAD) / Math.max(1, vals.length - 1);
    let d = '', pen = false, last = null;
    vals.forEach((v, j) => { if (v == null) { pen = false; return; } const px = PAD + j * dx, py = y(v); d += `${pen ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`; pen = true; last = [px, py]; });
    const tier = i === 0 ? 'gl-chart__mark' : 'gl-chart__mark gl-chart__mark--context';
    // A zero-length round-capped segment draws the end dot as a true circle even in a stretched viewBox.
    return `<path class="${tier}" d="${d}"/>` + (last ? `<path class="${tier} gl-chart__dot" d="M${last[0].toFixed(1)} ${last[1].toFixed(1)}h0"/>` : '');
  }).reverse().join(''); // context underneath
  const main = s.series[0].values.filter((v) => v != null), now = main.at(-1);
  const first = s.labels[0] || '', end = s.labels.at(-1) || '';
  const legend = s.series.length > 1
    ? `<div class="gl-chart__legend">${s.series.map((x, i) => `<span><svg class="gl-chart__key" viewBox="0 0 24 4"><path class="gl-chart__mark${i ? ' gl-chart__mark--context' : ''}" d="M2 2H22"/></svg>${esc(x.name || `Series ${i + 1}`)}</span>`).join('')}</div>` : '';
  return `<figure class="gl-chart gl-chart--line">`
    + `<div class="gl-chart__now">${esc(format(now, s.unit))}</div>`
    + `<svg class="gl-chart__plot" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="gl-chart__base" d="M0 ${H - 0.5}H${W}"/>${paths}</svg>`
    + `<figcaption class="gl-chart__axis"><span>${esc(first)}</span><span>low ${esc(format(Math.min(...main), s.unit))} · high ${esc(format(Math.max(...main), s.unit))}</span><span>${esc(end)}</span></figcaption>`
    + legend + '</figure>';
}

function bars(s) {
  const vals = s.series[0].values.slice(0, MAX_BARS);
  const hi = Math.max(0, ...vals.filter((v) => v != null)), lo = Math.min(0, ...vals.filter((v) => v != null));
  const rows = vals.map((v, i) => {
    const w = v == null || hi === lo ? 0 : (100 * (Math.abs(v) - 0)) / (Math.max(hi, -lo) || 1);
    return `<div class="gl-bar"><span class="gl-bar__label">${esc(s.labels[i] || '')}</span>`
      + `<svg class="gl-bar__track" aria-hidden="true"><rect class="gl-chart__bar" x="0" y="2" height="12" rx="4" width="${w.toFixed(1)}%"/></svg>`
      + `<span class="gl-bar__value">${v == null ? '–' : esc(format(v, s.unit))}</span></div>`;
  }).join('');
  return `<figure class="gl-chart gl-chart--bars">${rows}</figure>`;
}

// chart(content) -> markup for a card, or '' when the card has no chart.
export function chart(c) {
  const s = spec(c);
  return !s ? '' : s.kind === 'bars' ? bars(s) : line(s);
}
