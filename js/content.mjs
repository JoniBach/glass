// Glass content rules (principles §5, §8): clean, check and trim what an agent sends before it reaches the glass.
// Pure and dependency-free, so the same code runs in the server, in tests and in the browser.

const MARKER = /^([x>])\s+/; // list items: "x done", "> current step"

// Strip formatting an LLM tends to add; the glass shows plain text only.
export function clean(s) {
  return String(s ?? '')
    .replace(/\*\*|__|`/g, '')
    .replace(/^\s*(#{1,6}|[-*•])\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Shorten at a word boundary with an ellipsis. Returns [text, wasTrimmed].
export function clamp(s, maxChars, maxWords = Infinity) {
  let words = s.split(' ');
  let cut = false;
  if (words.length > maxWords) { words = words.slice(0, maxWords); cut = true; }
  let out = words.join(' ');
  if (out.length > maxChars) {
    out = out.slice(0, maxChars - 1);
    const sp = out.lastIndexOf(' ');
    if (sp > maxChars * 0.5) out = out.slice(0, sp);
    cut = true;
  }
  return [cut ? out.replace(/[\s,.;:–—-]+$/, '') + '…' : out, cut];
}

export function limitsFor(schema, role) {
  const r = schema.roles[role];
  return r ? r.limits || schema.defaults.limits : null; // a role's own limits replace the defaults: fields it doesn't list aren't allowed
}

// validate(schema, measure, role, input) -> { content, warnings, errors }
// Over-long content is trimmed and reported in `warnings`; `errors` means it can't be shown at all.
export function validate(schema, measure, role, input = {}) {
  const limits = limitsFor(schema, role);
  if (!limits) return { content: null, warnings: [], errors: [`unknown role "${role}" (roles: ${Object.keys(schema.roles).join(', ')})`] };
  const warnings = [], content = { title: '', body: '', items: [], progress: null };
  const chars = (l) => (measure[l.measure] || 40) * (l.lines || 1);

  for (const field of ['title', 'body']) {
    const v = clean(input[field]);
    if (!v) continue;
    const l = limits[field];
    if (!l) { warnings.push(`${role} has no ${field}; dropped "${v.slice(0, 30)}"`); continue; }
    const [out, cut] = clamp(v, chars(l), l.words);
    if (cut) warnings.push(`${field} trimmed to ${l.words ? `${l.words} words / ` : ''}${chars(l)} characters: "${out}"`);
    content[field] = out;
  }

  const items = Array.isArray(input.items) ? input.items.map((it) => String(it ?? '')).filter((it) => clean(it)) : [];
  if (items.length && !limits.items) warnings.push(`${role} has no items; dropped ${items.length}`);
  else if (items.length) {
    const l = limits.items;
    if (items.length > l.max) warnings.push(`${items.length} items, showing the first ${l.max}`);
    content.items = items.slice(0, l.max).map((it, i) => {
      const m = it.trim().match(MARKER), text = clean(m ? it.trim().slice(m[0].length) : it);
      const [out, cut] = clamp(text, chars(l));
      if (cut) warnings.push(`item ${i + 1} trimmed to ${chars(l)} characters: "${out}"`);
      return (m ? `${m[1]} ` : '') + out;
    });
  }

  if (input.progress != null && input.progress !== '') {
    const p = Number(input.progress);
    if (!limits.progress) warnings.push(`${role} has no progress; dropped`);
    else if (Number.isFinite(p)) content.progress = Math.max(0, Math.min(100, Math.round(p)));
    else warnings.push(`progress "${input.progress}" is not a number; dropped`);
  }

  // Other fields a role's schema declares as `true` (e.g. news `rotate`) pass through as plain text.
  for (const [field, l] of Object.entries(limits)) {
    if (l !== true || field === 'progress' || input[field] == null || input[field] === '') continue;
    content[field] = clean(input[field]);
  }

  const errors = content.title || content.body || content.items.length ? [] : ['nothing to show: give at least a title, body or items'];
  return { content, warnings, errors };
}
