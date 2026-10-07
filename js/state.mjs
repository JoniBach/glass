// Glass screen state: the whole content of one screen, and the pure function that changes it.
//   apply(schema, measure, state, text, now) -> { state, results, errors }
// No I/O: the same code runs on a Mac, in a hosted API or in the page. Where state is stored and how it reaches the
// screen is the caller's business (an app edge). Times are absolute epoch ms; the clock and `hours` use state.tz.
//
// state = { v: 1, screen, tz, at, display: { clock24h, showSeconds, dim: { level, until } },
//           layers: { <role>: { title, body, items, progress, icon, ...fields, zone, priority, hours, set, exp } } }
// Layers carry their zone, priority and hours, so a page can render a link without the schema that wrote it.
import { validate } from './content.mjs';
import { parse } from './text.mjs';

export const VERSION = 1;

export const empty = ({ screen = 'glass', tz = 'UTC', display = {} } = {}) => ({ v: VERSION, screen, tz, at: 0, display, layers: {} });

// "90s", "30m", "2h", "1d", or seconds as a number. null/'' -> null (no expiry).
export function duration(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v * 1000;
  const m = String(v).trim().match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d)?$/);
  return m ? Number(m[1]) * { s: 1e3, m: 6e4, h: 36e5, d: 864e5 }[m[2] || 's'] : null;
}

// Drop expired layers and an expired dim.
export function prune(state, now) {
  const layers = Object.fromEntries(Object.entries(state.layers || {}).filter(([, l]) => !l.exp || l.exp > now));
  const dim = state.display?.dim;
  const display = dim && dim.until && dim.until <= now ? { ...state.display, dim: null } : state.display;
  return { ...state, layers, display };
}

// Minutes since midnight in a time zone.
function minutesIn(tz, now) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return Number(p.hour) * 60 + Number(p.minute);
}

// "05:30-12:00" (may cross midnight) -> is now inside it?
export function inHours(hours, tz, now) {
  if (!hours) return true;
  const [a, b] = hours.split('-').map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  const t = minutesIn(tz, now);
  return a <= b ? t >= a && t < b : t >= a || t < b;
}

// Layers that should be on the glass now.
export function visible(state, now) {
  return Object.fromEntries(Object.entries(prune(state, now).layers).filter(([, l]) => inHours(l.hours, state.tz, now)));
}

// Apply Glass text to a state. All or nothing: any error leaves the state unchanged.
// results: one entry per operation, with `warnings` when content was trimmed (strict callers can refuse those).
export function apply(schema, measure, state, text, now) {
  const p = parse(schema, text);
  if (p.errors.length) return { state, results: [], errors: p.errors };
  return applyOps(schema, measure, state, p.ops, now);
}

export function applyOps(schema, measure, state, ops, now) {
  const next = prune({ ...state, layers: { ...state.layers } }, now), results = [], errors = [];
  for (const op of ops) {
    if (op.clear) {
      if (op.clear === 'all') next.layers = {};
      else if (schema.roles[op.clear]) delete next.layers[op.clear];
      else { errors.push(`unknown role "${op.clear}"`); continue; }
      results.push({ cleared: op.clear });
      continue;
    }
    const role = schema.roles[op.role];
    const v = validate(schema, measure, op.role, op);
    if (v.errors.length) { errors.push(`${op.role || 'block'}: ${v.errors.join('; ')}`); continue; }
    const ttl = duration(op.ttl) ?? duration(role.ttl);
    const layer = { ...v.content, icon: op.icon || undefined, zone: role.zone, priority: role.priority, hours: role.hours || undefined, set: now, exp: ttl ? now + ttl : undefined };
    next.layers[op.role] = compact(layer);
    results.push({ role: op.role, exp: layer.exp ?? null, ...(v.warnings.length && { warnings: v.warnings }) });
  }
  if (errors.length) return { state, results: [], errors };
  next.at = now;
  return { state: next, results, errors };
}

// Leave out empty fields: they cost bytes in every link.
export function compact(o) {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
}
