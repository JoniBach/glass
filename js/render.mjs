// Glass components as markup. Input is role content ({title, body, items, progress}) already checked by content.mjs.
// Every string is escaped: content often comes from the web or an LLM, and it must stay text (principles §8).

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
    + list(c.items) + progress(c.progress) + '</div>';
}

export const notice = (c) => `<h2 class="gl-notice">${esc(c.title)}</h2>`;

export const alert = (c) => `<div data-role="alert"><h2 class="gl-alert__title" data-gl-tier="room">${esc(c.title)}</h2>`
  + (c.body ? `<p class="gl-alert__body">${esc(c.body)}</p>` : '') + '</div>';

// Weather (top-right): the temperature as a room-tier figure with its icon, then conditions and forecast lines.
export const weather = (c) => `<div class="gl-weather" data-role="weather"><div class="gl-weather__now">${c.icon ? icon(c.icon) : ''}`
  + `<div class="gl-figure" data-gl-tier="room">${esc(c.title)}</div></div>`
  + (c.body ? `<div class="gl-meta gl-weather__line">${esc(c.body)}</div>` : '')
  + (c.items?.length ? `<div class="gl-meta gl-weather__days">${c.items.map((i) => `<div>${esc(i)}</div>`).join('')}</div>` : '') + '</div>';

export const tickerLine = (it) => `<div class="gl-ticker__src" data-gl-tier="decor">${esc(it.source)}</div><div class="gl-ticker__text">${esc(it.title)}</div>`;

// Group visible layers by zone, highest priority first. Single-layer zones show only the top one; others stack.
export const SINGLE = ['top-right', 'ticker', 'bottom', 'full'];
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
  if (zone === 'ticker') return entries.map(([, l]) => (l.items?.length ? tickerLine({ source: l.title, title: l.items[0] }) : '')).join('');
  if (zone === 'full') return entries.map(([, l]) => alert(l)).join('');
  if (zone === 'bottom') return entries.map(([, l]) => notice(l)).join('');
  return entries.map(([role, l]) => card(role, l)).join('');
}

// §7: nothing clips. Ambient elements are hidden, in order, until the frame fits.
export function fit(frame, yieldOrder = []) {
  for (const el of yieldOrder) el.hidden = false;
  for (const el of yieldOrder) { if (frame.scrollHeight <= frame.clientHeight) break; el.hidden = true; }
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
};
export const icon = (name, cls = '') => `<svg class="gl-icon ${cls}" viewBox="0 0 24 24">${ICONS[name] || ICONS.cloud}</svg>`;
