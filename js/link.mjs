// Glass links: a whole screen state in the URL fragment, so a static page can show it with no server.
//   https://…/screen.html#g=1.<base64url(deflate-raw(JSON))>
// The fragment never reaches the web server. The "1." prefix is the format version: links get bookmarked and shared,
// so every future version must keep decoding older ones. Uses the built-in CompressionStream (browsers, Node 18+).
import { VERSION } from './state.mjs';

export const PARAM = 'g';

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

const toB64url = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

export async function encode(state) {
  const json = new TextEncoder().encode(JSON.stringify({ ...state, v: VERSION }));
  return `${VERSION}.${toB64url(await pipe(json, new CompressionStream('deflate-raw')))}`;
}

// decode(token) -> state. Throws on a version this code doesn't know or a damaged link.
export async function decode(token) {
  const m = String(token || '').match(/^(\d+)\.([A-Za-z0-9_-]+)$/);
  if (!m) throw new Error('not a Glass link');
  if (Number(m[1]) !== 1) throw new Error(`Glass link version ${m[1]} is newer than this page`);
  const json = new TextDecoder().decode(await pipe(fromB64url(m[2]), new DecompressionStream('deflate-raw')));
  return JSON.parse(json);
}

// The token in a URL or fragment ("…#g=1.abc" or "#g=1.abc"), or null.
export function tokenOf(url) {
  const hash = String(url).split('#')[1] || '';
  return new URLSearchParams(hash).get(PARAM);
}

export const linkTo = async (base, state) => `${String(base).split('#')[0]}#${PARAM}=${await encode(state)}`;
