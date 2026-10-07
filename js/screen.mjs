// The Glass screen: renders a screen state from the link fragment (#g=…), or a fixture (?fixture=busy) for checks.
// Static: no server, no network requests. A writer changes the fragment and the page redraws without reloading.
// It draws the clock itself (from state.tz) and runs expiry, `hours` windows and ticker rotation on its own timers.
import { visible, empty, apply } from './state.mjs';
import { decode, tokenOf } from './link.mjs';
import { byZone, renderZone, tickerLine, fit } from './render.mjs';

const $ = (id) => document.getElementById(id);
const ZONES = ['top-left', 'top-right', 'upper', 'center', 'lower', 'bottom', 'footer', 'full'];
let state = null, frozen = null, problem = '';
const now = () => frozen ?? Date.now();

// ---------- clock ----------
function clock() {
  const tz = state?.tz, d = state?.display || {}, t = now();
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: 'numeric', minute: '2-digit', second: '2-digit', hourCycle: d.clock24h === false ? 'h12' : 'h23' })
    .formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const hh = d.clock24h === false ? String(Number(p.hour)) : p.hour.padStart(2, '0');
  $('time').textContent = `${hh}:${p.minute}`;
  $('date').textContent = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(t));
}

// ---------- ticker: one line at a time, cross-fading (§6) ----------
let tickKey = '', tickIdx = 0, tickTimer = null;
function ticker(layer) {
  const key = JSON.stringify(layer || null);
  if (key === tickKey) return;
  tickKey = key; tickIdx = 0; clearInterval(tickTimer);
  const items = layer?.items || [];
  const show = () => {
    const put = () => { $('ticker').innerHTML = items.length ? tickerLine({ source: layer.title, title: items[tickIdx++ % items.length] }) : ''; layout(); };
    const text = $('ticker').querySelector('.gl-ticker__text');
    if (!text) return put();
    text.classList.add('is-out');
    setTimeout(put, 800);
  };
  show();
  const secs = Math.max(8, Number(layer?.rotate) || 12); // --gl-rotate-min
  if (items.length > 1) tickTimer = setInterval(show, secs * 1000);
}

// ---------- zones ----------
const shown = {};
const layout = () => fit($('frame'), [$('ticker')]); // §7: nothing clips; the ticker gives way first

function render() {
  clock();
  const zones = state ? byZone(visible(state, now())) : {};
  for (const z of ZONES) {
    const html = renderZone(z, zones[z]);
    if (shown[z] !== html) { $(z).innerHTML = html; shown[z] = html; } // unchanged zones keep their elements: no replayed fade-ins
  }
  $('full').classList.toggle('is-on', !!zones.full);
  ticker(zones.ticker?.[0]?.[1]);
  const dim = state?.display?.dim;
  $('dim').style.opacity = dim && (!dim.until || dim.until > now()) ? String(1 - Math.max(2, dim.level) / 100) : '0';
  $('status').hidden = !problem;
  $('status').textContent = problem;
  layout();
}

// ---------- sources ----------
async function fixtureState(name) {
  const get = async (f) => (await fetch(f)).json();
  const [f, schema, tokens] = await Promise.all([get(`fixtures/${encodeURIComponent(name)}.json`), get('schema/roles.json'), get('tokens/tokens.resolved.json')]);
  frozen = Date.parse(f.now);
  const r = apply(schema, tokens.measure, empty({ tz: f.tz, display: f.display }), f.text, frozen);
  if (r.errors.length) throw new Error(r.errors.join('; '));
  return r.state;
}

async function load() {
  const fixture = new URLSearchParams(location.search).get('fixture');
  try {
    if (fixture) state = await fixtureState(fixture);
    else { const token = tokenOf(location.href); state = token ? await decode(token) : null; }
    problem = '';
  } catch (e) {
    problem = `Glass: ${e.message}`; // keep the last good state on screen (§6: fail quietly)
  }
  render();
}

window.addEventListener('hashchange', load);
setInterval(render, 1000);
await load();
