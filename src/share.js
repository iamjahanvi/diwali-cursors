// Postcards live entirely in the URL hash (#p=…), so no server ever sees the message.
// Payload is JSON → deflate → base64url. "1" prefix = compressed, "0" = plain fallback.

const b64url = (bytes) => {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

async function pipe(bytes, Stream, fmt) {
  const out = new Blob([bytes]).stream().pipeThrough(new Stream(fmt));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeCard({ card, to, msg, from, date }) {
  const json = JSON.stringify({ c: card, t: to, m: msg, f: from, d: date });
  const raw = new TextEncoder().encode(json);
  if ('CompressionStream' in window) {
    try { return '1' + b64url(await pipe(raw, CompressionStream, 'deflate-raw')); } catch {}
  }
  return '0' + b64url(raw);
}

export async function decodeCard(code) {
  const kind = code[0];
  let bytes = unb64url(code.slice(1));
  if (kind === '1') bytes = await pipe(bytes, DecompressionStream, 'deflate-raw');
  else if (kind !== '0') throw new Error('Unknown postcard format');
  const o = JSON.parse(new TextDecoder().decode(bytes));
  return { card: o.c, to: o.t || '', msg: o.m || '', from: o.f || '', date: o.d };
}

export const shareUrl = (code) => `${location.origin}${location.pathname}#p=${code}`;
