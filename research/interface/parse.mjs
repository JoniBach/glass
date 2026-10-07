// Parsers for the candidate interface formats. Each returns { ops, errors, notes }:
// ops: [{ kind: 'show', role, input: { title, body, items, progress } } | { kind: 'clear', role }]
// errors: the update would fail or come out wrong in real use. notes: tolerated slips (code fences, stray prose).

const ROLES = ['agenda', 'focus', 'task', 'info', 'notify', 'alert'];

function unfence(raw, notes) {
  const m = raw.trim().match(/^```[\w-]*\n([\s\S]*?)\n```$/);
  if (m) notes.push('wrapped in a code fence');
  return (m ? m[1] : raw).trim();
}

// ---------- A. shell commands ----------
// Tokenises like bash. Anything bash would expand or treat specially (e.g. "$4,500", backticks, unquoted &) is an
// error, because the real command would put different text on the glass, or fail.
function shellWords(line, errors) {
  const words = []; let w = null, i = 0;
  const push = (c) => { w = (w ?? '') + c; };
  while (i < line.length) {
    const c = line[i];
    if (c === "'") {
      const end = line.indexOf("'", i + 1);
      if (end < 0) { errors.push('unterminated single quote'); return words; }
      push(line.slice(i + 1, end)); i = end + 1;
    } else if (c === '"') {
      i++; w = w ?? '';
      while (i < line.length && line[i] !== '"') {
        const d = line[i];
        if (d === '\\' && '$`"\\'.includes(line[i + 1])) { push(line[i + 1]); i += 2; continue; }
        if (d === '$' && /[\w{(@*#?!-]/.test(line[i + 1] || '')) errors.push(`bash would expand "${line.slice(i, i + 6)}"`);
        if (d === '`') errors.push('backtick inside double quotes runs a command');
        if (d === '!' && line[i + 1] && line[i + 1] !== ' ') errors.push('"!" inside double quotes triggers history expansion');
        push(d); i++;
      }
      if (i >= line.length) { errors.push('unterminated double quote'); return words; }
      i++;
    } else if (c === '\\') { push(line[i + 1] ?? ''); i += 2; }
    else if (/\s/.test(c)) { if (w !== null) words.push(w); w = null; i++; }
    else {
      if (c === '#' && w === null) break; // comment
      if ('&|;<>()`$'.includes(c)) errors.push(`unquoted "${c}" is special to bash`);
      push(c); i++;
    }
  }
  if (w !== null) words.push(w);
  return words;
}

export function parseCli(raw) {
  const errors = [], notes = [], ops = [];
  const text = unfence(raw, notes).replace(/\\\n/g, ' ');
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (line.startsWith('#')) continue;
    if (!line.startsWith('mirror ')) { notes.push(`stray line: ${line.slice(0, 40)}`); continue; }
    const words = shellWords(line, errors).slice(1);
    const [cmd, ...rest] = words;
    const o = { _: [], items: [] };
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (a === '--item' || a === '-i') o.items.push(rest[++i]);
      else if (a.startsWith('--')) o[a.slice(2)] = rest[++i];
      else o._.push(a);
    }
    const input = (title) => ({ title, body: o.body, items: o.items, progress: o.progress });
    if (cmd === 'show') ops.push({ kind: 'show', role: o._[0], input: input(o.title) });
    else if (cmd === 'task') ops.push({ kind: 'show', role: 'task', input: input(o._[0] ?? o.title) });
    else if (cmd === 'notify') ops.push({ kind: 'show', role: 'notify', input: { title: o._.join(' ') } });
    else if (cmd === 'alert') ops.push({ kind: 'show', role: 'alert', input: { title: o._[0], body: o._[1] } });
    else if (cmd === 'clear') ops.push({ kind: 'clear', role: o._[0] });
    else errors.push(`unknown command "mirror ${cmd}"`);
  }
  return { ops, errors, notes };
}

// ---------- B. JSON ----------
export function parseJson(raw) {
  const errors = [], notes = [], ops = [];
  let text = unfence(raw, notes), j;
  const start = text.search(/[[{]/);
  if (start > 0) { notes.push('prose before the JSON'); text = text.slice(start); }
  try { j = JSON.parse(text); } catch (e) { errors.push(`invalid JSON: ${e.message.slice(0, 60)}`); return { ops, errors, notes }; }
  for (const op of Array.isArray(j) ? j : [j]) {
    if (op && op.clear) ops.push({ kind: 'clear', role: op.clear });
    else if (op && op.role) ops.push({ kind: 'show', role: op.role, input: op });
    else errors.push(`operation without role or clear: ${JSON.stringify(op).slice(0, 40)}`);
  }
  return { ops, errors, notes };
}

// ---------- C. plain-text blocks ----------
export function parseText(raw) {
  const errors = [], notes = [], ops = [];
  const text = unfence(raw, notes);
  for (const block of text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)) {
    const [head, ...lines] = block.split('\n').map((l) => l.trim());
    const h = head.match(/^(\w+):\s*(.*)$/);
    if (!h || !(ROLES.includes(h[1]) || h[1] === 'clear')) { errors.push(`block doesn't start with "role: title": ${head.slice(0, 40)}`); continue; }
    if (h[1] === 'clear') { ops.push({ kind: 'clear', role: h[2].trim() }); continue; }
    const input = { title: h[2], body: '', items: [], progress: null };
    for (const l of lines) {
      const p = l.match(/^progress:\s*(\d+)\s*%?$/);
      if (p) input.progress = Number(p[1]);
      else if (/^[x>]\s/.test(l)) input.items.push(l);
      else if (/^[-*•]\s/.test(l)) input.items.push(l.slice(2));
      else input.body = (input.body ? input.body + ' ' : '') + l;
    }
    ops.push({ kind: 'show', role: h[1], input });
  }
  return { ops, errors, notes };
}

// ---------- D. XML elements ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function xmlText(s, errors) {
  if (/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(s)) errors.push('unescaped "&"');
  if (/[<>]/.test(s)) errors.push('unescaped "<" or ">" in text');
  return s.replace(/&(amp|lt|gt|quot|apos);/g, (_, e) => ENT[e]).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

export function parseXml(raw) {
  const errors = [], notes = [], ops = [];
  let text = unfence(raw, notes);
  const el = /<(\w+)((?:\s+[\w-]+="[^"]*")*)\s*(?:\/>|>([\s\S]*?)<\/\1>)/g;
  const attrs = (s) => Object.fromEntries([...s.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k, xmlText(v, errors)]));
  let m, last = 0, leftover = '';
  while ((m = el.exec(text))) {
    leftover += text.slice(last, m.index); last = el.lastIndex;
    const [, tag, a, inner = ''] = m, at = attrs(a);
    if (tag === 'clear') { ops.push({ kind: 'clear', role: at.role }); continue; }
    if (!ROLES.includes(tag)) { errors.push(`unknown element <${tag}>`); continue; }
    const input = { title: at.title, progress: at.progress, items: [], body: '' };
    const rest = inner.replace(/<(body|item)>([\s\S]*?)<\/\1>/g, (_, t, v) => {
      if (t === 'body') input.body = xmlText(v, errors); else input.items.push(xmlText(v, errors));
      return '';
    });
    if (rest.trim()) {
      if (!input.title && !/[<>]/.test(rest)) input.title = xmlText(rest.trim(), errors); // <notify>text</notify>
      else errors.push(`unexpected content in <${tag}>: ${rest.trim().slice(0, 40)}`);
    }
    ops.push({ kind: 'show', role: tag, input });
  }
  leftover += text.slice(last);
  if (leftover.trim()) (/[<>]/.test(leftover) ? errors : notes).push(`text outside elements: ${leftover.trim().slice(0, 40)}`);
  return { ops, errors, notes };
}

export const parsers = { cli: parseCli, json: parseJson, text: parseText, xml: parseXml };
