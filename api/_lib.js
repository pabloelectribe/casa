// Utilidades compartidas por las funciones de /api (los archivos con "_" no son rutas en Vercel).

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

module.exports = { UA, fetchJSON, send, num };
