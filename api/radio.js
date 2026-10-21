// GET /api/radio?country=CL | ?tag=chillout | ?q=texto
// Emisoras desde radio-browser.info, filtradas a formatos que Safari 9 puede reproducir.
const { fetchJSON, send } = require('./_lib');

const MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://fi1.api.radio-browser.info',
  'https://all.api.radio-browser.info',
];

// iOS 9 reproduce MP3 y AAC; nada de OGG/Opus/FLAC.
const PLAYABLE = new Set(['MP3', 'AAC', 'AAC+']);

async function query(path, params) {
  let lastErr;
  for (const base of MIRRORS) {
    try {
      return await fetchJSON(`${base}${path}?${params}`, { timeout: 6000 });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

module.exports = async (req, res) => {
  const country = String(req.query.country || '').toUpperCase().slice(0, 2);
  const tag = String(req.query.tag || '').trim().slice(0, 40);
  const q = String(req.query.q || '').trim().slice(0, 60);

  const params = new URLSearchParams({
    hidebroken: 'true',
    order: 'votes',
    reverse: 'true',
    limit: '120',
  });
  if (q) params.set('name', q);
  else if (tag) params.set('tag', tag);
  else if (/^[A-Z]{2}$/.test(country)) params.set('countrycode', country);
  else return send(res, 400, { error: 'missing_filter' });

  try {
    const raw = await query('/json/stations/search', params);
    const seen = new Set();
    const stations = [];
    for (const s of raw) {
      const url = s.url_resolved || s.url;
      const key = s.name.trim().toLowerCase();
      if (!url || !PLAYABLE.has(String(s.codec).toUpperCase()) || seen.has(key)) continue;
      if (/\.m3u8?(\?|$)|\.pls(\?|$)/i.test(url)) continue;
      seen.add(key);
      stations.push({
        id: s.stationuuid,
        name: s.name.trim(),
        url,
        favicon: s.favicon && /^https:\/\//.test(s.favicon) ? s.favicon : '',
        tags: [s.tags && s.tags.split(',').slice(0, 3).join(', '), s.state || s.country]
          .filter(Boolean)
          .join(' · '),
      });
      if (stations.length >= 60) break;
    }
    send(res, 200, { stations }, q ? 3600 : 21600);
  } catch (err) {
    send(res, 502, { error: 'radio_unavailable', detail: String(err.message || err) });
  }
};
