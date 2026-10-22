// GET /api/stream?url=<stream>
// Relevo de audio: iOS 9 no puede abrir muchos streams HTTPS actuales (certificados
// y cifrados nuevos), así que el iPad escucha la radio a través de este dominio.
// Vercel corta la función a los 300 s; el cliente se reconecta solo al terminar.
const { Readable } = require('node:stream');
const { UA, send, isPrivateHost } = require('./_lib');

function contentType(upstream, url) {
  const ct = (upstream || '').split(';')[0].trim().toLowerCase();
  // Safari no reconoce "audio/aacp" (AAC+ de Shoutcast/Icecast) aunque sí sabe decodificarlo.
  if (/^audio\/(aacp|aac\+|x-aac|x-aacp)$/.test(ct)) return 'audio/aac';
  if (ct.startsWith('audio/')) return ct;
  if (/\.aac(\?|$)|\/aac\//i.test(url)) return 'audio/aac';
  return 'audio/mpeg';
}

module.exports = async (req, res) => {
  let url;
  try {
    url = new URL(String(req.query.url || ''));
  } catch {
    return send(res, 400, { error: 'bad_url' });
  }
  if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) {
    return send(res, 400, { error: 'bad_url' });
  }

  const abort = new AbortController();
  req.on('close', () => abort.abort());

  let upstream;
  try {
    upstream = await fetch(url, {
      headers: { 'User-Agent': UA, 'Icy-MetaData': '0' },
      redirect: 'follow',
      signal: abort.signal,
    });
  } catch {
    return send(res, 502, { error: 'stream_unreachable' });
  }

  const ct = upstream.headers.get('content-type') || '';
  if (!upstream.ok || !upstream.body || /text\/html|json/i.test(ct)) {
    upstream.body?.cancel().catch(() => {});
    return send(res, 502, { error: 'stream_unavailable', status: upstream.status });
  }

  // ?probe=1: diagnóstico. Lee 3 s del stream y responde qué llegó, sin reproducir.
  if (req.query.probe) {
    const reader = upstream.body.getReader();
    const started = Date.now();
    let bytes = 0;
    try {
      while (Date.now() - started < 3000) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.length;
      }
    } catch { /* corte del upstream */ }
    reader.cancel().catch(() => {});
    return send(res, 200, {
      status: upstream.status,
      finalUrl: upstream.url,
      contentType: ct,
      bytesIn3s: bytes,
      region: process.env.VERCEL_REGION || null,
    });
  }

  res.statusCode = 200;
  res.setHeader('Content-Type', contentType(ct, url.pathname));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const body = Readable.fromWeb(upstream.body);
  body.on('error', () => res.end());
  body.pipe(res);
};
