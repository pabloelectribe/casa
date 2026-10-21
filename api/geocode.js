// GET /api/geocode?q=Valparaíso → ciudades candidatas para los ajustes.
const { fetchJSON, send } = require('./_lib');

module.exports = async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 80);
  if (q.length < 2) return send(res, 400, { error: 'query_too_short' });

  const params = new URLSearchParams({ name: q, count: '8', language: 'es', format: 'json' });
  try {
    const d = await fetchJSON(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
    const results = (d.results || []).map((r) => ({
      name: r.name,
      admin1: r.admin1 || '',
      country: r.country || '',
      lat: r.latitude,
      lon: r.longitude,
    }));
    send(res, 200, { results }, 86400);
  } catch (err) {
    send(res, 502, { error: 'geocode_unavailable', detail: String(err.message || err) });
  }
};
