// GET /api/nowplaying?url=<stream>
// Lee el primer bloque de metadatos ICY del stream para mostrar "Artista - Canción".
const { UA, send, isPrivateHost } = require('./_lib');

const MAX_BYTES = 256 * 1024;

async function readIcyTitle(streamUrl) {
  const res = await fetch(streamUrl, {
    headers: { 'Icy-MetaData': '1', 'User-Agent': UA },
    signal: AbortSignal.timeout(6000),
    redirect: 'follow',
  });
  const metaint = Number.parseInt(res.headers.get('icy-metaint') || '', 10);
  if (!res.ok || !res.body || !Number.isFinite(metaint) || metaint <= 0 || metaint > MAX_BYTES) {
    res.body?.cancel().catch(() => {});
    return null;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (total < MAX_BYTES + 4096) {
      const { value, done } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (total > metaint) {
        const buf = Buffer.concat(chunks);
        const len = buf[metaint] * 16;
        if (len === 0) return null;
        if (buf.length >= metaint + 1 + len) {
          const meta = buf.subarray(metaint + 1, metaint + 1 + len).toString('utf8');
          const m = /StreamTitle='(.*?)';/.exec(meta);
          return m ? m[1].trim() || null : null;
        }
      }
    }
    return null;
  } finally {
    reader.cancel().catch(() => {});
  }
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

  try {
    const title = await readIcyTitle(url.toString());
    send(res, 200, { title }, 15);
  } catch {
    send(res, 200, { title: null }, 15);
  }
};
module.exports.readIcyTitle = readIcyTitle;
