// /api/spotify/:action — control remoto de Spotify Connect.
// El iPad no habla con Spotify: todo pasa por aquí (OAuth, API y carátulas).
//
// Variables de entorno en Vercel:
//   SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET  → de developer.spotify.com
//   SPOTIFY_REFRESH_TOKEN                     → lo entrega /api/spotify/callback
//
// Acciones:
//   GET  login     → redirige al login de Spotify
//   GET  callback  → muestra el refresh token para guardarlo en Vercel
//   GET  state     → qué suena, en qué dispositivo
//   GET  devices   → dispositivos disponibles
//   POST control   → ?cmd=play|pause|next|previous|volume&value=|transfer&device=
//   GET  art       → carátula (solo dominios de Spotify)
const crypto = require('node:crypto');
const { send } = require('../_lib');

const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing';
const ACCOUNTS = 'https://accounts.spotify.com';
const API = 'https://api.spotify.com/v1';

let cached = { token: null, exp: 0 };

class SpotifyError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function env() {
  return {
    id: process.env.SPOTIFY_CLIENT_ID || '',
    secret: process.env.SPOTIFY_CLIENT_SECRET || '',
    refresh: process.env.SPOTIFY_REFRESH_TOKEN || '',
  };
}

function missing() {
  const e = env();
  const out = [];
  if (!e.id) out.push('SPOTIFY_CLIENT_ID');
  if (!e.secret) out.push('SPOTIFY_CLIENT_SECRET');
  if (!e.refresh) out.push('SPOTIFY_REFRESH_TOKEN');
  return out;
}

function origin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (/^localhost|^127\./.test(host) ? 'http' : 'https');
  return `${proto}://${host}`;
}

function basicAuth() {
  const e = env();
  return 'Basic ' + Buffer.from(`${e.id}:${e.secret}`).toString('base64');
}

async function tokenRequest(params) {
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(8000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new SpotifyError(data.error || 'auth_failed', res.status);
  return data;
}

async function accessToken() {
  if (cached.token && Date.now() < cached.exp - 60_000) return cached.token;
  const data = await tokenRequest({ grant_type: 'refresh_token', refresh_token: env().refresh });
  cached = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
  return cached.token;
}

async function api(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!res.ok) {
    const reason = data && data.error && (data.error.reason || data.error.message);
    if (res.status === 404) throw new SpotifyError('no_device', 404);
    if (res.status === 403) throw new SpotifyError(/premium/i.test(reason || '') ? 'premium_required' : 'forbidden', 403);
    if (res.status === 401) { cached = { token: null, exp: 0 }; throw new SpotifyError('auth_failed', 401); }
    throw new SpotifyError(reason || `spotify_${res.status}`, res.status);
  }
  return data;
}

function pickImage(images) {
  if (!images || !images.length) return '';
  let best = images[0];
  for (const img of images) {
    if (Math.abs((img.width || 300) - 300) < Math.abs((best.width || 300) - 300)) best = img;
  }
  return best.url;
}

function artUrl(url) {
  return url ? `/api/spotify/art?u=${encodeURIComponent(url)}` : '';
}

function device(d) {
  return d && {
    id: d.id,
    name: d.name,
    type: d.type,
    active: d.is_active,
    volume: d.volume_percent,
    supportsVolume: d.supports_volume !== false,
  };
}

const actions = {
  async login(req, res) {
    const e = env();
    if (!e.id || !e.secret) return send(res, 400, { error: 'missing_client', missing: missing() });
    const state = crypto.randomBytes(12).toString('hex');
    const params = new URLSearchParams({
      client_id: e.id,
      response_type: 'code',
      redirect_uri: `${origin(req)}/api/spotify/callback`,
      scope: SCOPES,
      state,
      show_dialog: 'true',
    });
    res.setHeader('Set-Cookie', `sp_state=${state}; Path=/api/spotify; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
    res.statusCode = 302;
    res.setHeader('Location', `${ACCOUNTS}/authorize?${params}`);
    res.end();
  },

  async callback(req, res) {
    const cookie = /(?:^|;\s*)sp_state=([a-f0-9]+)/.exec(req.headers.cookie || '');
    let body;
    if (req.query.error) {
      body = `<h1>Spotify no autorizó el acceso</h1><p>${escapeHtml(req.query.error)}</p>`;
    } else if (!cookie || cookie[1] !== req.query.state) {
      body = '<h1>La sesión expiró</h1><p>Vuelve a <a href="/spotify.html">la página de configuración</a> e inténtalo de nuevo.</p>';
    } else {
      try {
        const data = await tokenRequest({
          grant_type: 'authorization_code',
          code: String(req.query.code || ''),
          redirect_uri: `${origin(req)}/api/spotify/callback`,
        });
        body = `<h1>¡Listo! Último paso</h1>
<p>Copia este valor y guárdalo en Vercel como variable de entorno <b>SPOTIFY_REFRESH_TOKEN</b>
(proyecto <i>casa</i> → Settings → Environment Variables). Después pide un nuevo despliegue.</p>
<textarea readonly onclick="this.select()">${escapeHtml(data.refresh_token || '')}</textarea>
<p class="warn">Es una llave de tu cuenta de Spotify: no la compartas ni la pegues en chats.</p>`;
      } catch (err) {
        body = `<h1>No se pudo conectar</h1><p>${escapeHtml(err.code || String(err))}</p>`;
      }
    }
    res.setHeader('Set-Cookie', 'sp_state=; Path=/api/spotify; Max-Age=0');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.end(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Spotify · Casa</title><style>
body{font:17px/1.5 -apple-system,Helvetica,Arial,sans-serif;background:#0f1218;color:#eef;margin:0;padding:24px;max-width:640px}
h1{font-size:26px}a{color:#1ed760}textarea{width:100%;height:140px;font:14px monospace;background:#1b2130;color:#fff;border:1px solid #333;border-radius:12px;padding:12px;box-sizing:border-box}
.warn{color:#ffb37f;font-size:15px}</style></head><body>${body}</body></html>`);
  },

  async state(req, res) {
    if (missing().length) return send(res, 200, { configured: false, missing: missing() });
    const p = await api('GET', '/me/player?additional_types=episode');
    if (!p || !p.item) return send(res, 200, { configured: true, active: false, device: device(p && p.device) });
    const item = p.item;
    const images = (item.album && item.album.images) || item.images || (item.show && item.show.images);
    send(res, 200, {
      configured: true,
      active: true,
      isPlaying: !!p.is_playing,
      progressMs: p.progress_ms || 0,
      durationMs: item.duration_ms || 0,
      track: item.name,
      artist: (item.artists || []).map((a) => a.name).join(', ') || (item.show && item.show.name) || '',
      album: (item.album && item.album.name) || '',
      image: artUrl(pickImage(images)),
      device: device(p.device),
    });
  },

  async devices(req, res) {
    if (missing().length) return send(res, 200, { configured: false, devices: [] });
    const d = await api('GET', '/me/player/devices');
    send(res, 200, { configured: true, devices: ((d && d.devices) || []).map(device) });
  },

  async control(req, res) {
    if (req.method !== 'POST') return send(res, 405, { error: 'use_post' });
    if (missing().length) return send(res, 200, { ok: false, error: 'not_configured' });
    const cmd = String(req.query.cmd || '');
    const deviceId = req.query.device ? `?device_id=${encodeURIComponent(req.query.device)}` : '';
    switch (cmd) {
      case 'play': await api('PUT', `/me/player/play${deviceId}`); break;
      case 'pause': await api('PUT', '/me/player/pause'); break;
      case 'next': await api('POST', '/me/player/next'); break;
      case 'previous': await api('POST', '/me/player/previous'); break;
      case 'volume': {
        const v = Math.max(0, Math.min(100, Math.round(Number(req.query.value))));
        if (!Number.isFinite(v)) return send(res, 400, { error: 'bad_volume' });
        await api('PUT', `/me/player/volume?volume_percent=${v}`);
        break;
      }
      case 'transfer':
        if (!req.query.device) return send(res, 400, { error: 'missing_device' });
        await api('PUT', '/me/player', { device_ids: [String(req.query.device)], play: true });
        break;
      default:
        return send(res, 400, { error: 'bad_cmd' });
    }
    send(res, 200, { ok: true });
  },

  async art(req, res) {
    let url;
    try { url = new URL(String(req.query.u || '')); } catch { return send(res, 400, { error: 'bad_url' }); }
    if (url.protocol !== 'https:' || !/(^|\.)(scdn\.co|spotifycdn\.com)$/.test(url.hostname)) {
      return send(res, 400, { error: 'bad_url' });
    }
    const up = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!up.ok) return send(res, 502, { error: 'art_unavailable' });
    res.setHeader('Content-Type', up.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800');
    res.end(Buffer.from(await up.arrayBuffer()));
  },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = async (req, res) => {
  const fn = Object.prototype.hasOwnProperty.call(actions, req.query.action) && actions[req.query.action];
  if (!fn) return send(res, 404, { error: 'not_found' });
  try {
    await fn(req, res);
  } catch (err) {
    const code = err instanceof SpotifyError ? err.code : 'spotify_unavailable';
    if (!(err instanceof SpotifyError)) console.error('[spotify]', err);
    // Errores esperables (sin dispositivo, sin Premium…) van con 200 para que el iPad los muestre.
    send(res, 200, { ok: false, configured: !missing().length, error: code });
  }
};
