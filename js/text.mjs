// Glass text (principles §9): the plain format agents write to update the glass. It compiles to the JSON operations
// the server validates: { role, title, body, items, ...fields } or { clear: role }.
// Field names come from the role schema, so a field added to a role in schema/roles.json can be written as
// "field: value" with no change here. Pure and dependency-free, like content.mjs.
//
//   task: Booking dentist        a block starts with "role: title"
//   x Found slots                items: "- text", or task steps "x done" / "> current"
//   > Choosing a time
//   progress: 50                 "field: value" for the role's other fields, plus ttl and icon
//   Tue or Wed afternoon         any other line is the body
//
//   clear: info                  clear one role, several ("clear: task, info") or everything ("clear: all")
import { limitsFor } from './content.mjs';

export const META = ['ttl', 'icon']; // per-update settings every role accepts
const KEY = /^([a-z][a-z0-9-]*):(?:\s+(.*)|\s*)$/i;
const ITEM = /^(?:[-*•]\s+(.*)|([x>]\s+.*))$/;
const BLOCK_FIELDS = ['title', 'body', 'items']; // written as the header, plain lines and item lines

export function fieldsFor(schema, role) {
  const limits = limitsFor(schema, role);
  return limits ? [...Object.keys(limits).filter((k) => !BLOCK_FIELDS.includes(k)), ...META] : [];
}

// parse(schema, text) -> { ops, errors }. Nothing should be applied when errors is non-empty.
export function parse(schema, text) {
  const ops = [], errors = [];
  const roles = Object.keys(schema.roles);
  let op = null, fields = [];
  const fenced = String(text ?? '').trim().match(/^```[\w-]*\n([\s\S]*?)\n```$/); // tolerated: models often fence
  const lines = (fenced ? fenced[1] : String(text ?? '')).split('\n');

  lines.forEach((raw, n) => {
    const line = raw.trim();
    if (!line) return; // blank lines separate blocks for readability; a header line also starts a new block
    const key = line.match(KEY), name = key && key[1].toLowerCase(), value = key ? (key[2] || '').trim() : '';
    if (op && op.role && key && fields.includes(name)) { op[name] = name === 'progress' && /^\d+%?$/.test(value) ? parseInt(value, 10) : value; return; }
    if (key && name === 'clear') {
      op = null;
      for (const r of (value || 'all').split(/[\s,]+/).filter(Boolean)) {
        if (r !== 'all' && !roles.includes(r)) errors.push(`line ${n + 1}: can't clear unknown role "${r}" (roles: ${roles.join(', ')})`);
        else ops.push({ clear: r });
      }
      return;
    }
    if (key && roles.includes(name)) {
      op = { role: name, title: value, body: '', items: [] };
      fields = fieldsFor(schema, name);
      ops.push(op);
      return;
    }
    if (!op) { errors.push(`line ${n + 1}: expected "role: title" or "clear: role" (roles: ${roles.join(', ')}), got "${line.slice(0, 40)}"`); return; }
    const item = line.match(ITEM);
    if (item) op.items.push(item[1] ?? item[2]);
    else op.body = op.body ? `${op.body}\n${line}` : line;
  });

  if (!ops.length && !errors.length) errors.push('nothing to do: start a block with "role: title"');
  for (const o of ops) if (o.role) { if (!o.body) delete o.body; if (!o.items.length) delete o.items; }
  return { ops, errors };
}

// stringify(ops) -> Glass text. The inverse of parse, for showing state back to agents in the same format.
export function stringify(ops) {
  return [].concat(ops).map((o) => {
    if (o.clear) return `clear: ${o.clear}`;
    const { role, title = '', body, items, ...rest } = o;
    return [`${role}: ${title}`.trimEnd(), ...(items || []).map((i) => (/^[x>]\s/.test(i) ? i : `- ${i}`)),
      ...Object.entries(rest).filter(([, v]) => v != null && v !== '').map(([k, v]) => `${k}: ${v}`),
      ...(body ? String(body).split('\n') : [])].join('\n');
  }).join('\n\n');
}
