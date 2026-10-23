// Servidor local: archivos estáticos + funciones de /api con la misma firma que en Vercel.
// Uso: npm run dev   (MOCK=1 npm run dev para datos de ejemplo sin internet)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 3000;
const MOCK = process.env.MOCK === '1';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json',
};

function pad(n) { return String(n).padStart(2, '0'); }
function localIso(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const mocks = {
  weather() {
    const now = new Date();
    const h0 = new Date(now); h0.setMinutes(0, 0, 0);
    const codes = [1, 2, 2, 3, 61, 80, 2, 1, 0, 0, 0, 0];
    const hourly = Array.from({ length: 24 }, (_, i) => {
      const t = new Date(h0.getTime() + i * 3600e3);
      const h = t.getHours();
      return { time: localIso(t), temp: 14 + 8 * Math.sin(((h - 9) / 24) * 2 * Math.PI), code: codes[i % codes.length], pop: [0, 0, 10, 20, 60, 40, 10, 0][i % 8], isDay: h >= 7 && h < 20 ? 1 : 0 };
    });
    const daily = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() + i * 86400e3);
      const date = localIso(d).slice(0, 10);
      return { date, code: [1, 3, 61, 80, 0, 2, 95][i], max: [23, 19, 15, 17, 25, 24, 18][i], min: [9, 10, 8, 7, 9, 11, 10][i], pop: [0, 20, 80, 50, 0, 10, 70][i], sunrise: `${date}T07:02`, sunset: `${date}T20:11`, uv: [8, 5, 2, 4, 9, 8, 3][i] };
    });
    return { timezone: 'America/Santiago', current: { time: localIso(now), temp: 21.4, feels: 20.2, humidity: 41, code: 1, isDay: 1, wind: 9 }, hourly, daily };
  },
  radio(query) {
    const names = query.q ? [`${query.q} FM`, `Radio ${query.q}`] : query.tag ? ['Chillout Lounge', 'Lofi Café', 'Deep Chill'] :
      ['Radio Futuro', 'Rock & Pop', 'Radio Cooperativa', 'ADN Radio', 'Radio Concierto', 'Radio Beethoven', 'Sonar FM', 'Radio Zero', 'Radio Pudahuel', 'Play FM'];
    return { stations: names.map((name, i) => ({ id: `mock-${name}`, name, url: `http://127.0.0.1:${PORT}/sounds/alarm.wav?${i}`, favicon: '', tags: 'pop, rock · Santiago' })) };
  },
  geocode(query) {
    return { results: [
      { name: query.q, admin1: 'Región de Valparaíso', country: 'Chile', lat: -33.05, lon: -71.62 },
      { name: `${query.q} Norte`, admin1: 'Antofagasta', country: 'Chile', lat: -23.65, lon: -70.4 },
    ] };
  },
  nowplaying() { return { title: 'Hollis Vane - Dreams' }; },
  'spotify/state'() {
    return { configured: true, active: true, isPlaying: true, progressMs: 83000, durationMs: 215000, track: 'Dreams', artist: 'Hollis Vane', album: 'Night Drive', image: '', device: { id: 'd1', name: 'Parlante living', type: 'Speaker', active: true, volume: 45 } };
  },
  'spotify/devices'() {
    return { configured: true, devices: [
      { id: 'd1', name: 'Parlante living', type: 'Speaker', active: true, volume: 45 },
      { id: 'd2', name: 'iPhone de Pablo', type: 'Smartphone', active: false, volume: 100 },
      { id: 'd3', name: 'MacBook', type: 'Computer', active: false, volume: 70 },
    ] };
  },
  'spotify/control'() { return { ok: true }; },
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const query = Object.fromEntries(url.searchParams);

  const api = /^\/api\/([a-z]+)(?:\/([a-z]+))?$/.exec(url.pathname);
  if (api) {
    const key = api[2] ? `${api[1]}/${api[2]}` : api[1];
    if (MOCK && mocks[key]) {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(mocks[key](query)));
    }
    // /api/spotify/:action → api/spotify/[action].js, como en Vercel.
    if (api[2]) query.action = api[2];
    const file = api[2] ? path.join(ROOT, 'api', api[1], '[action].js') : path.join(ROOT, 'api', `${api[1]}.js`);
    if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('not found'); }
    req.query = query;
    return require(file)(req, res);
  }

  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(PORT, () => console.log(`Casa en http://localhost:${PORT}${MOCK ? ' (datos de ejemplo)' : ''}`));
