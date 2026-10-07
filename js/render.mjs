// Glass components as markup. Input is role content ({title, body, items, progress}) already checked by content.mjs.
// Every string is escaped: content often comes from the web or an LLM, and it must stay text (principles §8).

import { chart } from './chart.mjs';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function list(items = []) {
  if (!items.length) return '';
  return `<ul class="gl-list">${items.map((it) => {
    const m = String(it).match(/^([x>])\s+(.*)$/); // "x done", "> current step"
    const state = m ? (m[1] === 'x' ? ' is-done' : ' is-now') : '';
    return `<li class="gl-item${state}">${esc(m ? m[2] : it)}</li>`;
  }).join('')}</ul>`;
}

export const progress = (n) => (n == null ? '' : `<div class="gl-progress"><div style="width:${Math.max(0, Math.min(100, Number(n)))}%"></div></div>`);

export function card(label, c) {
  return `<div class="gl-card" data-role="${esc(label)}">`
    + (label ? `<div class="gl-card__label" data-gl-tier="decor">${esc(label)}</div>` : '')
    + (c.title ? `<h2 class="gl-card__title">${esc(c.title)}</h2>` : '')
    + (c.body ? `<p class="gl-card__body">${esc(c.body)}</p>` : '')
    + chart(c) + list(c.items) + progress(c.progress) + '</div>';
}

export const notice = (c) => `<h2 class="gl-notice">${esc(c.title)}</h2>`;

export const alert = (c) => `<div data-role="alert"><h2 class="gl-alert__title" data-gl-tier="room">${esc(c.title)}</h2>`
  + (c.body ? `<p class="gl-alert__body">${esc(c.body)}</p>` : '') + '</div>';

// Weather (top-right): the temperature as a room-tier figure with its icon, then conditions and forecast lines.
export const weather = (c) => `<div class="gl-weather" data-role="weather"><div class="gl-weather__now">${c.icon ? icon(c.icon) : ''}`
  + `<div class="gl-figure" data-gl-tier="room">${esc(c.title)}</div></div>`
  + (c.body ? `<div class="gl-meta gl-weather__line">${esc(c.body)}</div>` : '')
  + (c.items?.length ? `<div class="gl-meta gl-weather__days">${c.items.map((i) => `<div>${leadIcon(i)}</div>`).join('')}</div>` : '') + '</div>';

// An item whose first word names an icon starts with that icon ("moon-wax-cres Tonight: waxing crescent").
function leadIcon(text) {
  const [w, ...rest] = String(text).split(' ');
  return ICONS[w] ? `<span class="gl-lead">${icon(w)}${esc(rest.join(' '))}</span>` : esc(text);
}

// Footer: one faint line pinned to the bottom edge (decoration tier), e.g. device stats while measuring.
export const footnote = (c) => `<div class="gl-footnote" data-gl-tier="decor">${esc([c.title, c.body].filter(Boolean).join(' · '))}</div>`;

// Read-out (top-left, under the clock): tiny icon-and-figure chips, decoration tier, read up close.
// In each item, words that name an icon draw it ("battery 87%", "plug check"); the rest is text.
export const readout = (c) => `<div class="gl-readout" data-gl-tier="decor">${(c.items || []).map((it) => `<span class="gl-readout__item">${
  String(it).split(' ').map((w) => (ICONS[w] ? icon(w) : esc(w))).join(' ').replace(/(<\/svg>) /g, '$1')}</span>`).join('')}</div>`; // icons start each chip, so no separators

// Ticker items from every layer in the ticker zone, in priority order. An item written "Label | text" carries its
// own label; otherwise the layer's title is the label.
export function tickerItems(entries = []) {
  return entries.flatMap(([, l]) => (l.items || []).map((it) => {
    const m = String(it).match(/^(.{1,24}?) \| (.+)$/);
    return m ? { source: m[1], title: m[2] } : { source: l.title, title: it };
  }));
}

export const tickerLine = (it) => `<div class="gl-ticker__src" data-gl-tier="decor">${esc(it.source)}</div><div class="gl-ticker__text">${esc(it.title)}</div>`;

// Group visible layers by zone, highest priority first. Single-layer zones show only the top one; others stack.
export const SINGLE = ['top-left', 'top-right', 'bottom', 'footer', 'full']; // the ticker merges its layers
export function byZone(layers) {
  const zones = {};
  for (const [role, l] of Object.entries(layers)) (zones[l.zone] ||= []).push([role, l]);
  for (const [z, list] of Object.entries(zones)) {
    list.sort((a, b) => b[1].priority - a[1].priority);
    if (SINGLE.includes(z)) zones[z] = list.slice(0, 1);
  }
  return zones;
}

// The ticker rotates, so the page renders it one item at a time with tickerLine; this shows the first.
export function renderZone(zone, entries = []) {
  if (zone === 'top-right') return entries.map(([, l]) => weather(l)).join('');
  if (zone === 'footer') return entries.map(([, l]) => footnote(l)).join('');
  if (zone === 'top-left') return entries.map(([, l]) => readout(l)).join('');
  if (zone === 'ticker') { const first = tickerItems(entries)[0]; return first ? tickerLine(first) : ''; }
  if (zone === 'full') return entries.map(([, l]) => alert(l)).join('');
  if (zone === 'bottom') return entries.map(([, l]) => notice(l)).join('');
  return entries.map(([role, l]) => card(role, l)).join('');
}

// §7: nothing clips. Ambient elements are hidden, in order, until the frame fits.
// Overflow is measured against the frame's inner (padding) edge: grid rows can spill into the padding without
// changing scrollHeight, which would put the bottom row into the gutter or under a footnote.
export function fit(frame, yieldOrder = []) {
  const fits = () => {
    const limit = frame.getBoundingClientRect().bottom - parseFloat(getComputedStyle(frame).paddingBottom) + 0.5;
    return frame.scrollHeight <= frame.clientHeight && [...frame.children].every((c) => c.hidden || c.getBoundingClientRect().bottom <= limit);
  };
  for (const el of yieldOrder) el.hidden = false;
  for (const el of yieldOrder) { if (fits()) break; el.hidden = true; }
}

// Line icons, 24×24, stroke only (no fills, §1).
export const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  partly: '<path d="M8 4v1.5M3.5 8H2M4.8 4.8l1 1M12.5 6.6A4 4 0 0 0 5 9.5"/><path d="M8 20h9a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.6 1.8A3.2 3.2 0 0 0 8 20z"/>',
  cloud: '<path d="M7 19h10a4.5 4.5 0 0 0 .4-9A6 6 0 0 0 6 11.5 3.8 3.8 0 0 0 7 19z"/>',
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
  rain: '<path d="M7 15h10a4.5 4.5 0 0 0 .4-9A6 6 0 0 0 6 7.5 3.8 3.8 0 0 0 7 15z"/><path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3"/>',
  snow: '<path d="M7 15h10a4.5 4.5 0 0 0 .4-9A6 6 0 0 0 6 7.5 3.8 3.8 0 0 0 7 15z"/><path d="M8 19h.01M12 21h.01M16 19h.01M10 22h.01M14 22h.01"/>',
  storm: '<path d="M7 15h10a4.5 4.5 0 0 0 .4-9A6 6 0 0 0 6 7.5 3.8 3.8 0 0 0 7 15z"/><path d="M13 15l-3 4h4l-3 4"/>',
  // device read-out
  battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 10.5v3"/>',
  bolt: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
  plug: '<path d="M9 2v5M15 2v5M6 7h12v3a6 6 0 0 1-12 0zM12 16v6"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  thermo: '<path d="M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  level: '<path d="M5 9h14M5 15h14"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  cross: '<path d="M6 6l12 12M18 6 6 18"/>',
  // moon phases by eighth of the month, 0 new → 4 full → 7 waning crescent: the outline of the lit part (stroke
  // only, §1); a dotted rim for the new moon. Short names, because icon words count towards line limits.
  'moon-0': '<circle cx="12" cy="12" r="8" stroke-dasharray="1.5 2.6"/>',
  'moon-1': '<path d="M12 4a8 8 0 0 1 0 16a4 8 0 0 0 0-16z"/>',
  'moon-2': '<path d="M12 4a8 8 0 0 1 0 16z"/>',
  'moon-3': '<path d="M12 4a8 8 0 0 1 0 16a4 8 0 0 1 0-16z"/>',
  'moon-4': '<circle cx="12" cy="12" r="8"/>',
  'moon-5': '<path d="M12 4a8 8 0 0 0 0 16a4 8 0 0 0 0-16z"/>',
  'moon-6': '<path d="M12 4a8 8 0 0 0 0 16z"/>',
  'moon-7': '<path d="M12 4a8 8 0 0 0 0 16a4 8 0 0 1 0-16z"/>',
};
export const icon = (name, cls = '') => `<svg class="gl-icon ${cls}" viewBox="0 0 24 24">${ICONS[name] || ICONS.cloud}</svg>`;
