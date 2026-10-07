#!/usr/bin/env node
// Unit tests for the content rules. node glass/scripts/test.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validate, clean, clamp } from '../js/content.mjs';
import { parse, stringify } from '../js/text.mjs';
import { build as buildGuide } from './guide.mjs';
import { apply, empty, visible, prune } from '../js/state.mjs';
import { encode, decode, tokenOf, linkTo } from '../js/link.mjs';
import { spec, downsample, format, chart } from '../js/chart.mjs';
import { tickerItems, byZone } from '../js/render.mjs';

const dir = new URL('..', import.meta.url).pathname;
const schema = JSON.parse(fs.readFileSync(dir + 'schema/roles.json', 'utf8'));
const { measure } = JSON.parse(fs.readFileSync(dir + 'tokens/tokens.resolved.json', 'utf8'));
let n = 0;
const t = (name, fn) => { fn(); n++; console.log(`  ✓ ${name}`); };

t('strips markdown', () => assert.equal(clean('**Train** `times`'), 'Train times'));
t('strips list bullets', () => assert.equal(clean('- 07:42 Platform 3'), '07:42 Platform 3'));
t('clamps at a word boundary', () => assert.deepEqual(clamp('one two three four', 12), ['one two…', true]));
t('leaves short text alone', () => assert.deepEqual(clamp('short', 10), ['short', false]));
t('title over 6 words is trimmed', () => {
  const r = validate(schema, measure, 'info', { title: 'This title is far too long for the mirror glass' });
  assert.equal(r.content.title.split(' ').length, 6); assert.ok(r.content.title.endsWith('…')); assert.equal(r.warnings.length, 1);
});
t('items capped at 6 and trimmed to one line', () => {
  const r = validate(schema, measure, 'info', { title: 'x', items: Array(8).fill('a fairly long line of text that will not fit on one line of the card') });
  assert.equal(r.content.items.length, 6); assert.ok(r.content.items.every((i) => i.length <= measure.item));
});
t('step markers survive and are not counted', () => {
  const r = validate(schema, measure, 'task', { title: 'x', items: ['x Done', '> **Now**', 'Next'] });
  assert.deepEqual(r.content.items, ['x Done', '> Now', 'Next']);
});
t('notify drops items', () => {
  const r = validate(schema, measure, 'notify', { title: 'Report sent', items: ['a'] });
  assert.deepEqual(r.content.items, []); assert.match(r.warnings[0], /no items/);
});
t('alert title is at most 4 words', () => assert.equal(validate(schema, measure, 'alert', { title: 'Leave now the taxi is outside' }).content.title, 'Leave now the taxi…'));
t('progress is clamped', () => assert.equal(validate(schema, measure, 'task', { title: 'x', progress: 140 }).content.progress, 100));
t('unknown role is an error', () => assert.match(validate(schema, measure, 'nope', { title: 'x' }).errors[0], /unknown role/));
t('empty content is an error', () => assert.equal(validate(schema, measure, 'info', { title: '  ' }).errors.length, 1));
// Glass text (§9)
t('text: a task block', () => assert.deepEqual(parse(schema, 'task: Booking dentist\nx Found slots\n> Choosing a time\n- Confirm\nprogress: 50\nTue or Wed').ops,
  [{ role: 'task', title: 'Booking dentist', body: 'Tue or Wed', items: ['x Found slots', '> Choosing a time', 'Confirm'], progress: 50 }]));
t('text: clear, then notify, no blank line needed', () => assert.deepEqual(parse(schema, 'clear: task\nnotify: Blog is live').ops,
  [{ clear: 'task' }, { role: 'notify', title: 'Blog is live' }]));
t('text: clear several and all', () => assert.deepEqual(parse(schema, 'clear: task, info\n\nclear: all').ops, [{ clear: 'task' }, { clear: 'info' }, { clear: 'all' }]));
t('text: quotes, dollars and ampersands are just text', () => assert.equal(parse(schema, `info: Bolt $3,900 "cheapest" & O'Neil's pick`).ops[0].title, `Bolt $3,900 "cheapest" & O'Neil's pick`));
t('text: a field the role lacks stays body text', () => assert.equal(parse(schema, 'notify: Sent\nprogress: 50').ops[0].body, 'progress: 50'));
t('text: "Note: x" is body, not a field', () => assert.equal(parse(schema, 'info: Dentist\nNote: bring ID').ops[0].body, 'Note: bring ID'));
t('text: ttl works on every role', () => assert.equal(parse(schema, 'notify: Sent\nttl: 30s').ops[0].ttl, '30s'));
t('text: code fence is tolerated', () => assert.equal(parse(schema, '```\nnotify: Sent\n```').ops[0].title, 'Sent'));
t('text: unknown role is an error', () => assert.match(parse(schema, 'forecast: Sunny').errors[0], /expected "role: title"/));
t('text: new schema fields are picked up', () => {
  const s2 = structuredClone(schema); s2.roles.info.limits = { ...schema.defaults.limits, when: { lines: 1, measure: 'item' } };
  assert.equal(parse(s2, 'info: Train\nwhen: 07:42').ops[0].when, '07:42');
});
t('text: stringify round-trips', () => {
  const ops = [{ clear: 'task' }, { role: 'task', title: 'Booking', items: ['x Found', '> Choose', 'Confirm'], progress: 50, body: 'Tue' }];
  assert.deepEqual(parse(schema, stringify(ops)).ops, ops);
});
t('docs/agent.md matches the schema (node glass/scripts/guide.mjs)', () => assert.equal(fs.readFileSync(dir + 'docs/agent.md', 'utf8'), buildGuide(schema, measure)));
// Screen state (state.mjs) and links (link.mjs)
const T0 = Date.parse('2026-10-07T07:30:00+01:00'), MIN = 60e3;
const s0 = empty({ screen: 'office', tz: 'Europe/London' });
t('state: apply sets a layer with zone, priority and expiry', () => {
  const r = apply(schema, measure, s0, 'info: Train at 07:42\n- 07:42 Platform 3', T0);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.state.layers.info, { title: 'Train at 07:42', items: ['07:42 Platform 3'], zone: 'lower', priority: 4, set: T0, exp: T0 + 30 * MIN });
});
t('state: ttl overrides the role default', () => assert.equal(apply(schema, measure, s0, 'notify: Sent\nttl: 5m', T0).state.layers.notify.exp, T0 + 5 * MIN));
t('state: one bad block changes nothing', () => {
  const r = apply(schema, measure, s0, 'info: Fine\n\nalert:', T0);
  assert.equal(r.errors.length, 1); assert.equal(r.state, s0);
});
t('state: clear then notify', () => {
  const a = apply(schema, measure, s0, 'task: Migrating blog\n> Deploy', T0).state;
  const b = apply(schema, measure, a, 'clear: task\nnotify: Blog is live', T0 + MIN).state;
  assert.deepEqual(Object.keys(b.layers), ['notify']);
});
t('state: expired layers drop out', () => {
  const a = apply(schema, measure, s0, 'notify: Sent', T0).state;
  assert.ok(visible(a, T0 + 60e3).notify); assert.equal(visible(a, T0 + 91e3).notify, undefined);
  assert.deepEqual(prune(a, T0 + 91e3).layers, {});
});
t('state: hours windows use the screen time zone', () => {
  const a = apply(schema, measure, s0, 'agenda: Wednesday plan', T0).state; // 05:30-12:00 London
  assert.ok(visible(a, T0).agenda); assert.equal(visible(a, Date.parse('2026-10-07T13:00:00+01:00')).agenda, undefined);
  const ny = { ...a, tz: 'America/New_York' }; // 02:30 there
  assert.equal(visible(ny, T0).agenda, undefined);
});
t('state: schema-declared fields pass through (news rotate)', () => assert.equal(apply(schema, measure, s0, 'news: BBC\n- One\nrotate: 20', T0).state.layers.news.rotate, '20'));
t('link: token is read from a URL or fragment', () => { assert.equal(tokenOf('https://x/screen.html#g=1.abc'), '1.abc'); assert.equal(tokenOf('#g=1.abc'), '1.abc'); assert.equal(tokenOf('https://x/'), null); });
const linked = apply(schema, measure, s0, `weather: 14°\nicon: partly\nPartly cloudy · London\n\ninfo: Bolt $3,900 "cheapest" & <b>O'Neil</b>\n- ✓ émoji ok`, T0).state;
const token = await encode(linked);
assert.deepEqual(await decode(token), linked); n++; console.log('  ✓ link: round trip keeps every character');
assert.match(token, /^1\.[A-Za-z0-9_-]+$/); n++; console.log(`  ✓ link: versioned and URL-safe (${token.length} chars)`);
await assert.rejects(decode('2.abc'), /newer/); n++; console.log('  ✓ link: refuses a newer version');
assert.equal(await linkTo('https://x/screen.html#g=old', linked), `https://x/screen.html#g=${token}`); n++; console.log('  ✓ link: linkTo replaces an old fragment');
// Charts (chart.mjs)
t('chart: Glass text carries a chart through apply()', () => {
  const l = apply(schema, measure, s0, 'info: Power use falling\nchart: line\ndata: 16.1 15.4 15.0 14.2\nlabels: 14:00, 15:00\nunit: W', T0).state.layers.info;
  assert.deepEqual(spec(l), { kind: 'line', series: [{ name: '', values: [16.1, 15.4, 15, 14.2] }], labels: ['14:00', '15:00'], unit: 'W' });
});
t('chart: two series max, gaps kept as null', () => assert.deepEqual(spec({ chart: 'line', data: '1 - 3 | 4 5 6 | 7' }).series.map((s) => s.values), [[1, null, 3], [4, 5, 6]]));
t('chart: thousands commas stay inside a value', () => assert.deepEqual(spec({ chart: 'bars', data: '4,500 3,900, 5,200' }).series[0].values, [4500, 3900, 5200]));
t('chart: bars', () => assert.equal(spec({ chart: 'bars', data: '4500 3900' }).kind, 'bars'));
t('chart: no data, no chart', () => { assert.equal(chart({ chart: 'line' }), ''); assert.equal(chart({ chart: 'line', data: 'x y' }), ''); });
t('chart: long series keep their shape in 120 points', () => { const d = downsample(Array.from({ length: 1000 }, (_, i) => i)); assert.equal(d.length, 120); assert.ok(d[0] < d[119]); });
t('chart: compact numbers and units', () => assert.deepEqual([format(1284), format(12900), format(4.2e6, '$'), format(-3.5, '%'), format(15.4, 'W')], ['1,284', '12.9K', '$4.2M', '-3.5%', '15.4 W']));
t('chart: labels are escaped text', () => assert.ok(!chart({ chart: 'bars', data: '1', labels: '<b>x</b>' }).includes('<b>')));
// Ticker: every ticker layer shares the reel; "Label | text" items carry their own label
t('ticker: layers merge in priority order, items keep their labels', () => {
  const st = apply(schema, measure, s0, 'news: BBC News\n- Headline one\n\ndaily: Today\n- Joke | Why did the dot cross the glass?\n- A plain item', T0).state;
  assert.deepEqual(tickerItems(byZone(visible(st, T0)).ticker), [
    { source: 'Joke', title: 'Why did the dot cross the glass?' }, { source: 'Today', title: 'A plain item' }, { source: 'BBC News', title: 'Headline one' }]);
});
t('ticker: a colon in a headline is not a label', () => assert.deepEqual(tickerItems([['news', { title: 'BBC', items: ['Starmer: a plan'] }]]), [{ source: 'BBC', title: 'Starmer: a plan' }]));
console.log(`${n} passed`);
