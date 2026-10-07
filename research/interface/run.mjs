#!/usr/bin/env node
// Interface study: which format should agents write to drive the glass?
//   node run.mjs docs                                   size of each format's instructions (no model calls)
//   node run.mjs run --model haiku --runs 3 [--formats cli,json] [--only trains,taxi] [--jobs 4]
//   node run.mjs score --model haiku                    tables → results/<model>/summary.md
// Raw outputs are cached in results/<model>/<format>/<id>-<run>.json, so an interrupted run resumes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { parsers } from './parse.mjs';
import { validate, clean } from '../../js/content.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const GLASS = path.resolve(HERE, '../..');
const schema = JSON.parse(fs.readFileSync(path.join(GLASS, 'schema/roles.json'), 'utf8'));
const { measure } = JSON.parse(fs.readFileSync(path.join(GLASS, 'tokens/tokens.resolved.json'), 'utf8'));
const requests = JSON.parse(fs.readFileSync(path.join(HERE, 'requests.json'), 'utf8'));
const FORMATS = Object.keys(parsers);
const prompt = (f) => [fs.readFileSync(path.join(HERE, 'formats/core.md'), 'utf8'), fs.readFileSync(path.join(HERE, `formats/${f}.md`), 'utf8')].join('\n');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i < 0 ? d : args[i + 1]; };
const model = opt('model', 'haiku');
const formats = opt('formats', FORMATS.join(',')).split(',');
const only = opt('only', null)?.split(',');
const runs = Number(opt('runs', 3));
const jobs = Number(opt('jobs', 4));
const out = (...p) => path.join(HERE, 'results', model, ...p);

// One call with a bare context: the format doc is the whole system prompt, no tools, no MCP, and only project
// settings (cwd is a temp dir) so the user's CLAUDE.md doesn't leak in and favour the CLI format it documents.
function call(system, ask) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(path.join(os.homedir(), '.local/bin/claude'), ['-p', '--model', model, '--system-prompt', system,
      '--tools', '', '--strict-mcp-config', '--setting-sources', 'project', '--no-session-persistence', '--output-format', 'json'],
      { cwd: os.tmpdir() });
    let so = '', se = '';
    p.stdout.on('data', (d) => (so += d)); p.stderr.on('data', (d) => (se += d));
    p.on('close', () => {
      try {
        const j = JSON.parse(so);
        const u = j.usage || {};
        resolve({ raw: j.result ?? '', isError: !!j.is_error, ms: j.duration_ms ?? Date.now() - t0, cost: j.total_cost_usd,
          tokensIn: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), tokensOut: u.output_tokens });
      } catch { resolve({ raw: '', isError: true, stderr: (se || so).slice(0, 300), ms: Date.now() - t0 }); }
    });
    p.stdin.end(ask);
  });
}

async function run() {
  const todo = [];
  for (const f of formats) for (const r of requests) if (!only || only.includes(r.id)) for (let n = 1; n <= runs; n++) {
    const file = out(f, `${r.id}-${n}.json`);
    if (!fs.existsSync(file)) todo.push({ f, r, n, file });
  }
  console.log(`${todo.length} calls on ${model}`);
  let done = 0, cost = 0;
  const worker = async () => {
    for (let t; (t = todo.shift());) {
      const res = await call(prompt(t.f), t.r.ask);
      cost += res.cost || 0;
      if (res.isError) { console.log(`  ! ${t.f}/${t.r.id}-${t.n}: ${res.stderr || res.raw}`.slice(0, 200)); continue; }
      fs.mkdirSync(path.dirname(t.file), { recursive: true });
      fs.writeFileSync(t.file, JSON.stringify(res, null, 2));
      if (++done % 10 === 0) console.log(`  ${done} done, $${cost.toFixed(3)}`);
    }
  };
  await Promise.all(Array.from({ length: jobs }, worker));
  console.log(`${done} done, API-equivalent cost $${cost.toFixed(3)}`);
}

// ---------- scoring ----------
const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ');
const words = (s) => new Set(norm(s).split(/[^\p{L}\p{N}:$.,'-]+/u).filter(Boolean));
const jaccard = (a, b) => { const A = words(a), B = words(b); const i = [...A].filter((x) => B.has(x)).length; return A.size + B.size ? i / (A.size + B.size - i) : 1; };

export function grade(format, req, raw) {
  const p = parsers[format](raw);
  const shown = [], warnings = [];
  for (const op of p.ops) {
    if (op.kind !== 'show') continue;
    const v = validate(schema, measure, op.role, op.input);
    warnings.push(...v.warnings); p.errors.push(...v.errors);
    if (v.content) shown.push({ role: op.role, ...v.content });
  }
  const opSet = p.ops.map((o) => `${o.kind}:${o.role}`).sort().join(' ');
  const want = req.ops.map((o) => o.split('|'));
  const opsOk = p.ops.length === want.length && want.every((alts) => alts.some((a) => opSet.split(' ').includes(a)));
  const text = norm(shown.map((s) => [s.title, s.body, ...s.items].join(' ')).join(' '));
  const facts = req.facts.map((f) => [].concat(f).some((a) => text.includes(norm(a))));
  const task = shown.find((s) => s.role === 'task');
  const markersOk = !req.markers || (task && task.items.some((i) => i.startsWith('x ')) && task.items.some((i) => i.startsWith('> ')));
  const progressOk = !req.progress || (task && task.progress != null);
  const factShare = facts.length ? facts.filter(Boolean).length / facts.length : 1;
  return {
    valid: p.errors.length === 0, errors: p.errors, notes: p.notes, warnings, opsOk, opSet, factShare, markersOk, progressOk,
    title: shown[0]?.title || '',
    pass: p.errors.length === 0 && opsOk && factShare === 1 && warnings.length === 0 && markersOk && progressOk,
  };
}

function score() {
  const rows = [], fails = [];
  const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const pct = (a) => `${Math.round(100 * mean(a.map(Number)))}%`;
  for (const f of formats) {
    const g = [], res = [], consistOps = [], consistTitle = [];
    for (const r of requests) {
      const per = [];
      for (let n = 1; n <= runs; n++) {
        const file = out(f, `${r.id}-${n}.json`);
        if (!fs.existsSync(file)) continue;
        const x = JSON.parse(fs.readFileSync(file, 'utf8'));
        const s = grade(f, r, x.raw);
        g.push(s); res.push(x); per.push(s);
        if (!s.pass) fails.push({ f, id: `${r.id}-${n}`, why: [...new Set(s.errors), ...s.warnings, !s.opsOk && `ops: ${s.opSet || 'none'}`, s.factShare < 1 && `facts ${Math.round(s.factShare * 100)}%`, !s.markersOk && 'no x/> markers', !s.progressOk && 'no progress'].filter(Boolean).join('; '), notes: s.notes.join('; ') });
      }
      if (per.length > 1) {
        const modal = Math.max(...Object.values(per.reduce((m, s) => ({ ...m, [s.opSet]: (m[s.opSet] || 0) + 1 }), {})));
        consistOps.push(modal / per.length);
        const pairs = []; for (let i = 0; i < per.length; i++) for (let j = i + 1; j < per.length; j++) pairs.push(jaccard(per[i].title, per[j].title));
        consistTitle.push(mean(pairs));
      }
    }
    if (!g.length) continue;
    rows.push({ f, n: g.length, pass: pct(g.map((s) => s.pass)), valid: pct(g.map((s) => s.valid)), ops: pct(g.map((s) => s.opsOk)),
      facts: pct(g.map((s) => s.factShare)), untrimmed: pct(g.map((s) => !s.warnings.length)), fenced: pct(g.map((s) => s.notes.length > 0)),
      sameOps: pct(consistOps), titleSim: mean(consistTitle).toFixed(2),
      tokIn: Math.round(mean(res.map((x) => x.tokensIn))), tokOut: Math.round(mean(res.map((x) => x.tokensOut))),
      chars: Math.round(mean(res.map((x) => x.raw.length))), sec: (mean(res.map((x) => x.ms)) / 1000).toFixed(1), cost: res.reduce((s, x) => s + (x.cost || 0), 0).toFixed(3) });
  }
  const cols = [['format', 'f'], ['calls', 'n'], ['pass', 'pass'], ['valid', 'valid'], ['right ops', 'ops'], ['facts', 'facts'], ['untrimmed', 'untrimmed'], ['slips', 'fenced'],
    ['same ops', 'sameOps'], ['title sim', 'titleSim'], ['tokens in', 'tokIn'], ['tokens out', 'tokOut'], ['chars out', 'chars'], ['s/call', 'sec'], ['$', 'cost']];
  const table = [`| ${cols.map((c) => c[0]).join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${cols.map((c) => r[c[1]]).join(' | ')} |`)].join('\n');
  const failList = fails.map((x) => `- ${x.f} ${x.id}: ${x.why}${x.notes ? ` (${x.notes})` : ''}`).join('\n');
  const md = `# Interface study: ${model}\n\n${table}\n\n## Failures\n\n${failList || 'none'}\n`;
  fs.mkdirSync(out(), { recursive: true });
  fs.writeFileSync(out('summary.md'), md);
  console.log(md);
}

function docs() {
  for (const f of FORMATS) { const p = prompt(f); console.log(`${f.padEnd(5)} ${String(p.length).padStart(5)} chars  ~${Math.round(p.length / 4)} tokens (format part: ${fs.readFileSync(path.join(HERE, `formats/${f}.md`), 'utf8').length} chars)`); }
}

const cmd = args[0];
if (cmd === 'run') await run();
else if (cmd === 'score') score();
else if (cmd === 'docs') docs();
else console.log('usage: node run.mjs docs | run [--model haiku --runs 3 --formats a,b --only id,id --jobs 4] | score [--model haiku]');
