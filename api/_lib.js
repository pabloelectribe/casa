// Utilidades compartidas por las funciones de /api (los archivos con "_" no son rutas en Vercel).

const net = require('node:net');

const UA = 'casa-dashboard/1.0 (+https://vercel.com)';

async function fetchJSON(url, { timeout = 8000, headers = {} } = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

function send(res, status, body, cacheSeconds = 0) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (cacheSeconds > 0 && status === 200) {
    res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 4}`);
  } else {
    res.setHeader('Cache-Control', 'no-store');
  }
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function num(value, min, max) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

// Evita que /api/nowplaying y /api/stream se usen para llegar a la red interna.
function isPrivateHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (net.isIPv4(host)) {
    const [a, b] = host.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (net.isIPv6(host)) return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80');
  return false;
}

module.exports = { UA, fetchJSON, send, num, isPrivateHost };
