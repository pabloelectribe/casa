/*
 * Casa — dashboard de cocina para un iPad mini 1 (iOS 9.3.5 / Safari 9).
 *
 * ES5 estricto a propósito: nada de let/const, arrow functions, template
 * strings, fetch, Intl ni Element.closest. `npm run lint` lo verifica.
 */
(function () {
  'use strict';

  var DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  var SOMA = 'https://ice1.somafm.com/';
  var BIOBIO = 'https://unlimited3-cl.dps.live/';
  var BIOBIO_ICON = 'https://www.biobiochile.cl/assets/biobiochile/img/icons/apple-touch-icon-120x120.png';
  // Radios que se agregaron a las favoritas después de la primera versión.
  var NEW_FAVORITES = [
    { id: 'biobio-temuco', name: 'BioBio Temuco', url: BIOBIO + 'biobiotemuco/mp3/icecast.audio', favicon: BIOBIO_ICON, tags: 'noticias · Araucanía' },
    { id: 'biobio-santiago', name: 'BioBio Santiago', url: BIOBIO + 'biobiosantiago/mp3/icecast.audio', favicon: BIOBIO_ICON, tags: 'noticias · Santiago' }
  ];
  var FAVORITES_VERSION = 2;
  var DEFAULT_FAVORITES = NEW_FAVORITES.concat([
    { id: 'soma-groovesalad', name: 'Groove Salad', url: SOMA + 'groovesalad-128-mp3', tags: 'chill, downtempo · SomaFM' },
    { id: 'soma-secretagent', name: 'Secret Agent', url: SOMA + 'secretagent-128-mp3', tags: 'lounge, jazz · SomaFM' },
    { id: 'soma-lush', name: 'Lush', url: SOMA + 'lush-128-mp3', tags: 'voces suaves, electrónica · SomaFM' },
    { id: 'soma-indiepop', name: 'Indie Pop Rocks!', url: SOMA + 'indiepop-128-mp3', tags: 'indie pop · SomaFM' },
    { id: 'soma-u80s', name: 'Underground 80s', url: SOMA + 'u80s-128-mp3', tags: 'new wave, synth pop · SomaFM' },
    { id: 'soma-bossa', name: 'Bossa Beyond', url: SOMA + 'bossa-128-mp3', tags: 'bossa nova · SomaFM' }
  ]);
  var SOMA_FAVORITES = DEFAULT_FAVORITES.slice(NEW_FAVORITES.length);

  // iOS 9 o anterior no abre muchos streams directo (HTTPS moderno, "audio/aacp"):
  // ahí siempre se escucha a través de /api/stream.
  var OLD_IOS = /\bOS [1-9]_\d.* like Mac OS X/.test(window.navigator.userAgent);

  var DEFAULT_SETTINGS = {
    city: 'Santiago',
    lat: -33.4489,
    lon: -70.6693,
    seconds: true,
    nightDim: true
  };

  var MAX_TIMERS = 3;
  var WEATHER_EVERY = 10 * 60 * 1000;
  var NOWPLAYING_EVERY = 20 * 1000;
  var ALARM_SOUND_MAX = 3 * 60 * 1000;

  var bootAt = Date.now();

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  function $(id) { return document.getElementById(id); }
  function pad(n) { return n < 10 ? '0' + n : String(n); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  function extend(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i];
      if (!src) continue;
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
      }
    }
    return target;
  }

  function hasClass(el, c) {
    return (' ' + (el.getAttribute('class') || '') + ' ').indexOf(' ' + c + ' ') > -1;
  }
  function toggleClass(el, c, on) {
    if (on) el.classList.add(c); else el.classList.remove(c);
  }

  // Safari 9 interpreta "2026-10-21T16:00" como UTC; lo parseamos a mano como hora local.
  function parseLocal(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s || '');
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  }

  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function fmtDuration(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    return h > 0 ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  function durationLabel(sec) {
    if (sec % 60 === 0) {
      var min = sec / 60;
      if (min >= 60 && min % 60 === 0) return (min / 60) + ' h';
      return min + ' min';
    }
    return fmtDuration(sec);
  }

  var store = {
    get: function (key, fallback) {
      try {
        var v = window.localStorage.getItem('casa.' + key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) {
        return fallback;
      }
    },
    set: function (key, value) {
      // En modo privado de iOS 9 setItem lanza excepción.
      try { window.localStorage.setItem('casa.' + key, JSON.stringify(value)); } catch (e) { /* sin persistencia */ }
    }
  };

  function getJSON(url, cb) {
    var xhr = new XMLHttpRequest();
    var done = false;
    function finish(err, data) {
      if (done) return;
      done = true;
      cb(err, data);
    }
    xhr.open('GET', url, true);
    xhr.timeout = 15000;
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        var data;
        try { data = JSON.parse(xhr.responseText); } catch (e) { return finish(e); }
        finish(null, data);
      } else {
        finish(new Error('HTTP ' + xhr.status));
      }
    };
    xhr.ontimeout = function () { finish(new Error('timeout')); };
    xhr.send();
  }

  function q(params) {
    var out = [];
    for (var k in params) {
      if (params[k] != null) out.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    }
    return out.join('&');
  }

  function playSafe(media) {
    var p = media.play();
    if (p && typeof p.then === 'function') p.then(null, function () {});
  }

  var settings = extend({}, DEFAULT_SETTINGS, store.get('settings', null));
  function saveSettings() { store.set('settings', settings); }

  /* ------------------------------------------------------------------ */
  /* Íconos del clima (SVG propio: los emoji de clima no existen en iOS 9) */
  /* ------------------------------------------------------------------ */

  var SUN_RAYS = (function () {
    var s = '';
    for (var i = 0; i < 8; i++) {
      var a = i * Math.PI / 4;
      var x1 = 32 + Math.cos(a) * 18, y1 = 32 + Math.sin(a) * 18;
      var x2 = 32 + Math.cos(a) * 25, y2 = 32 + Math.sin(a) * 25;
      s += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
    }
    return s;
  })();

  function svgSun() {
    return '<g stroke="#FFC93C" stroke-width="4" stroke-linecap="round">' + SUN_RAYS + '</g>' +
      '<circle cx="32" cy="32" r="12" fill="#FFC93C"/>';
  }
  function svgMoon() {
    return '<path fill="#F4E7B4" d="M38 10a22 22 0 1 0 16 36A18 18 0 0 1 38 10z"/>';
  }
  function svgCloud(fill, dy) {
    return '<g fill="' + fill + '" transform="translate(0 ' + (dy || 0) + ')">' +
      '<circle cx="22" cy="38" r="12"/><circle cx="36" cy="30" r="15"/><circle cx="48" cy="40" r="10"/>' +
      '<rect x="14" y="36" width="42" height="14" rx="7"/></g>';
  }
  function svgDrops(color) {
    return '<g stroke="' + color + '" stroke-width="4" stroke-linecap="round">' +
      '<line x1="22" y1="48" x2="19" y2="56"/><line x1="33" y1="48" x2="30" y2="56"/><line x1="44" y1="48" x2="41" y2="56"/></g>';
  }
  function svgFlakes() {
    return '<g fill="#fff"><circle cx="21" cy="52" r="3"/><circle cx="32" cy="57" r="3"/><circle cx="43" cy="52" r="3"/></g>';
  }
  function svgBolt() {
    return '<polygon fill="#FFD43B" points="34,38 25,52 32,52 28,62 42,46 35,46 39,38"/>';
  }
  function svgFog() {
    return '<g stroke="#E6ECF2" stroke-width="4" stroke-linecap="round">' +
      '<line x1="12" y1="26" x2="52" y2="26"/><line x1="8" y1="36" x2="48" y2="36"/><line x1="16" y1="46" x2="56" y2="46"/></g>';
  }
  function svgPeek(isDay) {
    // sol o luna asomándose detrás de una nube
    return '<g transform="translate(-6 -8) scale(.78)">' + (isDay ? svgSun() : svgMoon()) + '</g>';
  }

  // Códigos WMO de Open-Meteo → texto, ícono y fondo de la tarjeta.
  function weatherInfo(code, isDay) {
    var day = isDay !== 0 && isDay !== false;
    var text, kind;
    if (code === 0) { text = 'Despejado'; kind = 'clear'; }
    else if (code === 1) { text = 'Mayormente despejado'; kind = 'mostly'; }
    else if (code === 2) { text = 'Parcialmente nublado'; kind = 'partly'; }
    else if (code === 3) { text = 'Nublado'; kind = 'cloudy'; }
    else if (code === 45 || code === 48) { text = 'Niebla'; kind = 'fog'; }
    else if (code >= 51 && code <= 57) { text = 'Llovizna'; kind = 'rain'; }
    else if (code === 61) { text = 'Lluvia débil'; kind = 'rain'; }
    else if (code === 63) { text = 'Lluvia'; kind = 'rain'; }
    else if (code === 65) { text = 'Lluvia intensa'; kind = 'rain'; }
    else if (code === 66 || code === 67) { text = 'Lluvia helada'; kind = 'rain'; }
    else if (code >= 71 && code <= 77) { text = 'Nieve'; kind = 'snow'; }
    else if (code >= 80 && code <= 82) { text = 'Chubascos'; kind = 'showers'; }
    else if (code === 85 || code === 86) { text = 'Chubascos de nieve'; kind = 'snow'; }
    else if (code >= 95) { text = 'Tormenta'; kind = 'storm'; }
    else { text = '—'; kind = 'cloudy'; }

    var body, theme;
    switch (kind) {
      case 'clear':
        body = day ? svgSun() : svgMoon();
        theme = day ? 'w-clear-day' : 'w-clear-night';
        break;
      case 'mostly':
      case 'partly':
        body = svgPeek(day) + svgCloud('#fff', kind === 'mostly' ? 8 : 4);
        theme = day ? 'w-clear-day' : 'w-cloudy-night';
        break;
      case 'fog':
        body = svgFog();
        theme = 'w-fog';
        break;
      case 'rain':
        body = svgCloud('#E6ECF2', -8) + svgDrops('#5AC8FA');
        theme = 'w-rain';
        break;
      case 'showers':
        body = svgPeek(day) + svgCloud('#E6ECF2', -6) + svgDrops('#5AC8FA');
        theme = 'w-rain';
        break;
      case 'snow':
        body = svgCloud('#fff', -8) + svgFlakes();
        theme = 'w-snow';
        break;
      case 'storm':
        body = svgCloud('#9AA5B8', -8) + svgBolt();
        theme = 'w-storm';
        break;
      default:
        body = svgCloud('#E6ECF2', 0);
        theme = day ? 'w-cloudy' : 'w-cloudy-night';
    }
    return {
      text: text,
      theme: theme,
      svg: '<svg class="wi" viewBox="0 0 64 64">' + body + '</svg>'
    };
  }

  /* ------------------------------------------------------------------ */
  /* Reloj                                                               */
  /* ------------------------------------------------------------------ */

  var Clock = {
    el: { time: $('clockTime'), sec: $('clockSec'), date: $('clockDate'), greet: $('clockGreeting') },
    last: {},

    set: function (key, value) {
      if (this.last[key] !== value) {
        this.last[key] = value;
        this.el[key].textContent = value;
      }
    },

    render: function (d) {
      var h = d.getHours();
      this.set('time', hhmm(d));
      this.set('sec', pad(d.getSeconds()));
      this.set('date', cap(DAYS[d.getDay()]) + ' ' + d.getDate() + ' de ' + MONTHS[d.getMonth()]);
      this.set('greet', h < 6 ? 'Buenas noches' : h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches');
    }
  };

  /* ------------------------------------------------------------------ */
  /* Clima                                                               */
  /* ------------------------------------------------------------------ */

  var Weather = {
    data: store.get('weather', null),
    failed: false,
    loading: false,

    load: function () {
      if (Weather.loading) return;
      Weather.loading = true;
      getJSON('/api/weather?' + q({ lat: settings.lat, lon: settings.lon }), function (err, data) {
        Weather.loading = false;
        if (err || !data || !data.current) {
          Weather.failed = true;
        } else {
          Weather.failed = false;
          data.fetchedAt = Date.now();
          data.forCity = settings.city;
          Weather.data = data;
          store.set('weather', data);
        }
        Weather.render();
      });
    },

    isStale: function () {
      return !this.data || Date.now() - (this.data.fetchedAt || 0) > WEATHER_EVERY;
    },

    render: function () {
      var d = this.data;
      $('wCity').textContent = settings.city;
      if (!d || !d.current) {
        $('wCond').textContent = this.failed ? 'Sin conexión' : 'Cargando clima…';
        return;
      }
      var c = d.current;
      var info = weatherInfo(c.code, c.isDay);
      var card = $('weatherCard');
      card.className = 'card card-weather ' + info.theme;
      $('wCond').textContent = info.text;
      $('wIcon').innerHTML = info.svg;
      $('wTemp').textContent = Math.round(c.temp) + '°';

      var today = d.daily && d.daily[0];
      $('wHiLo').innerHTML = today
        ? 'Máx <b>' + Math.round(today.max) + '°</b> &nbsp;Mín <b>' + Math.round(today.min) + '°</b>'
        : '&nbsp;';
      $('wFeels').innerHTML = 'Sensación ' + Math.round(c.feels) + '°<br>Humedad ' + Math.round(c.humidity) + '%';

      this.renderHourly(d.hourly || []);
      this.renderDaily(d.daily || []);
      this.renderChips(today);
      this.renderUpdated();
    },

    renderHourly: function (hours) {
      var now = new Date();
      now.setMinutes(0, 0, 0);
      var html = '';
      var shown = 0;
      for (var i = 0; i < hours.length && shown < 6; i++) {
        var h = hours[i];
        var t = parseLocal(h.time);
        if (!t || t < now) continue;
        var info = weatherInfo(h.code, h.isDay);
        html += '<div class="hour">' +
          '<div class="h-time">' + (shown === 0 ? 'Ahora' : pad(t.getHours())) + '</div>' +
          '<div class="h-icon">' + info.svg + '</div>' +
          '<div class="h-temp">' + Math.round(h.temp) + '°</div>' +
          '<div class="h-pop">' + (h.pop >= 20 ? h.pop + '%' : '') + '</div>' +
          '</div>';
        shown++;
      }
      $('wHourly').innerHTML = html;
    },

    renderDaily: function (days) {
      var todayKey = (function (n) { return n.getFullYear() + '-' + pad(n.getMonth() + 1) + '-' + pad(n.getDate()); })(new Date());
      var list = [];
      for (var i = 0; i < days.length; i++) {
        if (days[i].date >= todayKey) list.push(days[i]);
      }
      list = list.slice(0, 5);
      if (!list.length) { $('wDaily').innerHTML = ''; return; }

      var lo = Infinity, hi = -Infinity;
      for (i = 0; i < list.length; i++) {
        lo = Math.min(lo, list[i].min);
        hi = Math.max(hi, list[i].max);
      }
      var span = Math.max(1, hi - lo);

      var html = '';
      for (i = 0; i < list.length; i++) {
        var day = list[i];
        var date = parseLocal(day.date);
        var info = weatherInfo(day.code, 1);
        var left = ((day.min - lo) / span) * 100;
        var width = Math.max(6, ((day.max - day.min) / span) * 100);
        html += '<div class="day">' +
          '<div class="d-name">' + (day.date === todayKey ? 'Hoy' : DAYS_SHORT[date.getDay()]) + '</div>' +
          '<div class="d-icon">' + info.svg +
            (day.pop >= 20 ? '<div class="d-pop">' + day.pop + '%</div>' : '') + '</div>' +
          '<div class="d-min">' + Math.round(day.min) + '°</div>' +
          '<div class="d-bar"><i style="left:' + left.toFixed(1) + '%;width:' + width.toFixed(1) + '%"></i></div>' +
          '<div class="d-max">' + Math.round(day.max) + '°</div>' +
          '</div>';
      }
      $('wDaily').innerHTML = html;
    },

    renderChips: function (today) {
      var chips = [];
      if (today) {
        var rise = parseLocal(today.sunrise), set = parseLocal(today.sunset);
        if (today.pop >= 20) chips.push(chip(ICON_DROP, 'Lluvia', today.pop + '%'));
        if (rise) chips.push(chip(ICON_SUNRISE, 'Amanece', hhmm(rise)));
        if (set) chips.push(chip(ICON_SUNSET, 'Atardece', hhmm(set)));
        if (today.uv != null) chips.push(chip(ICON_UV, 'UV', String(Math.round(today.uv))));
      }
      Weather.chips = chips;
      renderClockChips();
    },

    renderUpdated: function () {
      var d = this.data;
      if (!d) return;
      var mins = Math.floor((Date.now() - d.fetchedAt) / 60000);
      $('wUpdated').textContent = (this.failed ? 'Sin conexión · ' : '') +
        (mins < 1 ? 'Actualizado recién' : 'Actualizado hace ' + mins + ' min');
    },

    chips: []
  };

  var ICON_SUNRISE = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#FFC93C" d="M12 10a5 5 0 0 1 5 5H7a5 5 0 0 1 5-5zM3 17h18v2H3zM11 3h2v4h-2zM4.2 7.6l1.4-1.4 2.1 2.1-1.4 1.4zM16.3 8.3l2.1-2.1 1.4 1.4-2.1 2.1z"/></svg>';
  var ICON_SUNSET = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#FF8A3D" d="M12 10a5 5 0 0 1 5 5H7a5 5 0 0 1 5-5zM3 17h18v2H3zM11 3h2v4h-2zM4.2 7.6l1.4-1.4 2.1 2.1-1.4 1.4zM16.3 8.3l2.1-2.1 1.4 1.4-2.1 2.1z"/></svg>';
  var ICON_UV = '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="5" fill="#FFD60A"/></svg>';
  var ICON_DROP = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="#5AC8FA" d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/></svg>';
  var ICON_TIMER = '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M9 2h6v2H9zM12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm1 8.4V9h-2v6.6l4 2.4 1-1.7z"/></svg>';

  function chip(icon, label, value, extraClass) {
    return '<div class="chip' + (extraClass ? ' ' + extraClass : '') + '">' + icon + esc(label) + '<b>' + esc(value) + '</b></div>';
  }

  var lastChipsHtml = null;
  function renderClockChips() {
    var chips = [];
    var next = Timers.nextRunning();
    if (next) chips.push(chip(ICON_TIMER, 'Temporizador', fmtDuration(Timers.leftMs(next, Date.now()) / 1000), 'hot'));
    chips = chips.concat(Weather.chips);
    // Una sola fila: con un temporizador corriendo caben tres.
    var html = chips.slice(0, next ? 3 : 4).join('');
    if (html !== lastChipsHtml) {
      lastChipsHtml = html;
      $('clockChips').innerHTML = html;
    }
  }

  /* ------------------------------------------------------------------ */
  /* Reproductor: un solo <audio> para radio y alarma.                    */
  /* iOS solo deja reproducir audio desde un toque; al reutilizar el mismo */
  /* elemento, la alarma puede sonar después sin interacción.              */
  /* ------------------------------------------------------------------ */

  var audio = $('player');

  // Diagnóstico remoto: eventos del reproductor a los logs de Vercel (/api/log).
  var debugCount = 0;
  function debug(event, data) {
    if (debugCount++ > 200) return;
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', '/api/log?' + q({ e: event, d: JSON.stringify(data || {}) }), true);
      xhr.send();
    } catch (e) { /* solo diagnóstico */ }
  }
  function mediaState() {
    var err = audio.error;
    return {
      src: String(audio.currentSrc || audio.src || '').slice(-90),
      err: err ? err.code : null,
      net: audio.networkState,
      ready: audio.readyState,
      t: Math.round(audio.currentTime * 10) / 10,
      mode: Player.mode,
      state: Player.state
    };
  }
  ['loadstart', 'loadedmetadata', 'canplay', 'playing', 'waiting', 'stalled', 'suspend', 'error', 'ended', 'abort', 'emptied']
    .forEach(function (name) {
      audio.addEventListener(name, function () {
        if (Player.mode === 'radio' || name === 'error') debug('audio-' + name, mediaState());
      });
    });

  // Campana sintetizada con Web Audio. iOS exige crear/reanudar el contexto
  // dentro de un toque; después puede sonar sola desde un temporizador.
  var Chime = {
    Ctx: window.AudioContext || window.webkitAudioContext,
    ctx: null,
    loop: null,

    unlock: function () {
      if (!Chime.Ctx) return;
      try {
        if (!Chime.ctx) Chime.ctx = new Chime.Ctx();
        if (Chime.ctx.resume) Chime.ctx.resume();
        var src = Chime.ctx.createBufferSource();
        src.buffer = Chime.ctx.createBuffer(1, 1, 22050);
        src.connect(Chime.ctx.destination);
        Chime.startNode(src, 0);
      } catch (e) { /* sin Web Audio: queda el <audio> */ }
    },

    startNode: function (node, when) {
      if (node.start) node.start(when); else node.noteOn(when);
    },

    stopNode: function (node, when) {
      if (node.stop) node.stop(when); else node.noteOff(when);
    },

    bell: function (freq, at) {
      var ctx = Chime.ctx;
      var partials = [[1, 0.5, 1.6], [2.76, 0.18, 1.0], [5.4, 0.08, 0.5]];
      for (var i = 0; i < partials.length; i++) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.frequency.value = freq * partials[i][0];
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(partials[i][1], at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + partials[i][2]);
        osc.connect(gain);
        gain.connect(ctx.destination);
        Chime.startNode(osc, at);
        Chime.stopNode(osc, at + partials[i][2] + 0.05);
      }
    },

    ring: function () {
      if (!Chime.ctx) return;
      if (Chime.ctx.resume) Chime.ctx.resume();
      var t = Chime.ctx.currentTime + 0.05;
      Chime.bell(1318.5, t);
      Chime.bell(1046.5, t + 0.22);
      Chime.bell(1318.5, t + 0.44);
    },

    start: function () {
      Chime.stop();
      if (!Chime.ctx) return;
      Chime.ring();
      Chime.loop = setInterval(Chime.ring, 1800);
    },

    stop: function () {
      if (Chime.loop) clearInterval(Chime.loop);
      Chime.loop = null;
    }
  };

  var Player = {
    mode: 'idle',          // 'idle' | 'radio' | 'alarm'
    state: 'stopped',      // 'stopped' | 'loading' | 'playing' | 'error'
    station: store.get('station', DEFAULT_FAVORITES[0]),
    favorites: store.get('favorites', DEFAULT_FAVORITES),
    resumeRadio: false,
    retries: 0,
    track: '',
    unlocked: false,
    nowTimer: null,
    watchdog: null,
    // Emisoras que no conectaron directo y se escuchan vía /api/stream.
    relayed: store.get('relayed', {}),

    unlock: function () {
      Chime.unlock();
      if (Player.unlocked) return;
      Player.unlocked = true;
      if (Player.mode !== 'idle') return;
      audio.src = '/sounds/silence.wav';
      playSafe(audio);
    },

    play: function (station) {
      if (station) {
        Player.station = station;
        store.set('station', station);
      }
      if (!Player.station) return;
      Player.mode = 'radio';
      Player.retries = 0;
      Player.track = '';
      Player.setState('loading');
      debug('radio-play', { name: Player.station.name, url: Player.station.url, oldIos: OLD_IOS });
      Player.connect();
      Player.pollNowPlaying(true);
      Player.render();
    },

    connect: function () {
      var st = Player.station;
      audio.loop = false;
      audio.src = OLD_IOS || Player.relayed[st.id] ? '/api/stream?' + q({ url: st.url }) : st.url;
      playSafe(audio);
      Player.watch();
    },

    // Si en 12 s no empezó a sonar, se considera una falla (iOS a veces se queda colgado).
    watch: function () {
      clearTimeout(Player.watchdog);
      Player.watchdog = setTimeout(function () {
        if (Player.mode === 'radio' && Player.state === 'loading') {
          debug('watchdog', mediaState());
          Player.fail();
        }
      }, 12000);
    },

    fail: function () {
      if (Player.mode !== 'radio') return;
      var st = Player.station;
      if (!OLD_IOS && !Player.relayed[st.id]) {
        // Primer intento fallido: probablemente HTTPS que iOS 9 no soporta. Usar el relevo.
        Player.relayed[st.id] = true;
        store.set('relayed', Player.relayed);
        Player.setState('loading');
        Player.connect();
        return;
      }
      if (Player.retries < 3) {
        Player.retries++;
        Player.setState('loading');
        setTimeout(function () {
          if (Player.mode === 'radio' && Player.station === st) Player.connect();
        }, 2000 * Player.retries);
      } else {
        clearTimeout(Player.watchdog);
        Player.mode = 'idle';
        Player.pollNowPlaying(false);
        Player.setState('error');
      }
    },

    stop: function () {
      clearTimeout(Player.watchdog);
      Player.mode = 'idle';
      audio.pause();
      audio.removeAttribute('src');
      try { audio.load(); } catch (e) { /* algunos Safari lanzan al vaciar src */ }
      Player.setState('stopped');
      Player.pollNowPlaying(false);
      Player.track = '';
      Player.render();
    },

    toggle: function () {
      if (Player.mode === 'radio' && Player.state !== 'stopped') Player.stop();
      else Player.play();
    },

    step: function (dir) {
      var list = Player.favorites;
      if (!list.length) return;
      var idx = -1;
      for (var i = 0; i < list.length; i++) {
        if (Player.station && list[i].id === Player.station.id) { idx = i; break; }
      }
      idx = (idx + dir + list.length) % list.length;
      Player.play(list[idx]);
    },

    isFavorite: function (id) {
      for (var i = 0; i < Player.favorites.length; i++) {
        if (Player.favorites[i].id === id) return true;
      }
      return false;
    },

    toggleFavorite: function (station) {
      var out = [];
      var found = false;
      for (var i = 0; i < Player.favorites.length; i++) {
        if (Player.favorites[i].id === station.id) found = true;
        else out.push(Player.favorites[i]);
      }
      if (!found) out.push(station);
      Player.favorites = out;
      store.set('favorites', out);
    },

    setState: function (s) {
      Player.state = s;
      Player.render();
    },

    // --- alarma ---
    // Suena por dos vías a la vez: Web Audio (Chime) y el <audio>. En iOS 9 el
    // <audio> a veces no arranca sin un toque, y Web Audio calla con el
    // interruptor de silencio; con las dos, al menos una suena.
    alarmStart: function () {
      if (Player.mode === 'alarm') return;
      Player.resumeRadio = Player.mode === 'radio' && Player.state !== 'stopped';
      Player.pollNowPlaying(false);
      Player.mode = 'alarm';
      Chime.start();
      audio.loop = true;
      audio.src = '/sounds/alarm.wav';
      playSafe(audio);
      Player.render();
    },

    alarmSilence: function () {
      if (Player.mode !== 'alarm') return;
      Chime.stop();
      audio.pause();
      audio.loop = false;
      Player.mode = 'idle';
      Player.state = 'stopped';
    },

    alarmStop: function () {
      if (Player.mode !== 'alarm') return;
      Player.alarmSilence();
      if (Player.resumeRadio) Player.play();
      else Player.stop();
      Player.resumeRadio = false;
    },

    // --- "qué está sonando" vía metadatos ICY (lo resuelve /api/nowplaying) ---
    pollNowPlaying: function (on) {
      if (Player.nowTimer) {
        clearInterval(Player.nowTimer);
        Player.nowTimer = null;
      }
      if (!on) return;
      var fetchNow = function () {
        var st = Player.station;
        if (!st || Player.mode !== 'radio') return;
        getJSON('/api/nowplaying?' + q({ url: st.url }), function (err, data) {
          if (Player.station !== st || Player.mode !== 'radio') return;
          Player.track = !err && data && data.title ? data.title : '';
          Player.renderTrack();
        });
      };
      setTimeout(fetchNow, 2500);
      Player.nowTimer = setInterval(fetchNow, NOWPLAYING_EVERY);
    },

    renderTrack: function () {
      var t = Player.track;
      var parts = t.split(' - ');
      $('mTrack').innerHTML = !t ? (Player.station && Player.station.tags ? esc(Player.station.tags) : '&nbsp;')
        : parts.length > 1 ? '<b>' + esc(parts.slice(1).join(' - ')) + '</b><br>' + esc(parts[0])
        : esc(t);
    },

    render: function () {
      var st = Player.station;
      $('mStation').textContent = st ? st.name : 'Elige una emisora';
      renderArt($('mArt'), st);
      Player.renderTrack();

      var btn = $('mPlay');
      var radioOn = Player.mode === 'radio';
      toggleClass(btn, 'playing', radioOn && Player.state === 'playing');
      toggleClass(btn, 'loading', radioOn && Player.state === 'loading');

      var status = $('mStatus');
      var txt = '';
      if (radioOn && Player.state === 'playing') txt = 'En vivo';
      else if (radioOn && Player.state === 'loading') txt = 'Conectando…';
      else if (Player.state === 'error') txt = 'No se pudo conectar';
      status.textContent = txt || ' ';
      toggleClass(status, 'live', radioOn && Player.state === 'playing');
    }
  };

  audio.addEventListener('playing', function () {
    if (Player.mode === 'radio') {
      Player.retries = 0;
      Player.setState('playing');
    }
  });
  audio.addEventListener('waiting', function () {
    if (Player.mode !== 'radio') return;
    Player.setState('loading');
    Player.watch();
  });
  audio.addEventListener('ended', function () {
    // El relevo se corta cada ~5 min (límite de Vercel): reconectar sin que se note.
    if (Player.mode === 'radio') {
      Player.setState('loading');
      Player.connect();
    }
  });
  audio.addEventListener('pause', function () {
    // Pausa externa (p.ej. otra app tomó el audio): reflejarlo en la UI.
    if (audio.ended) return;
    if (Player.mode === 'radio' && Player.state === 'playing') {
      Player.mode = 'idle';
      Player.pollNowPlaying(false);
      Player.setState('stopped');
    }
  });
  audio.addEventListener('error', function () {
    Player.fail();
  });

  var ART_COLORS = [
    ['#ffb45e', '#ff5e62'], ['#7f7fd5', '#86a8e7'], ['#43cea2', '#185a9d'],
    ['#f7797d', '#c471ed'], ['#f2994a', '#f2c94c'], ['#56ccf2', '#2f80ed']
  ];

  function initials(name) {
    var words = String(name || '?').replace(/[^\w\sáéíóúñ]/gi, ' ').split(/\s+/);
    var s = '';
    for (var i = 0; i < words.length && s.length < 2; i++) {
      if (words[i]) s += words[i].charAt(0).toUpperCase();
    }
    return s || '♪';
  }

  function artColors(id) {
    var h = 0;
    id = String(id || '');
    for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
    return ART_COLORS[h % ART_COLORS.length];
  }

  function artHtml(st) {
    var c = artColors(st && st.id);
    var html = '<span>' + esc(initials(st && st.name)) + '</span>';
    if (st && st.favicon) html += '<img src="' + esc(st.favicon) + '" onerror="this.parentNode.removeChild(this)">';
    return { style: 'background-image:linear-gradient(135deg,' + c[0] + ',' + c[1] + ')', html: html };
  }

  function renderArt(el, st) {
    var key = st ? st.id : '';
    if (el.getAttribute('data-key') === key) return;
    el.setAttribute('data-key', key);
    var a = artHtml(st);
    el.setAttribute('style', a.style);
    el.innerHTML = a.html;
  }

  /* ------------------------------------------------------------------ */
  /* Temporizadores                                                      */
  /* ------------------------------------------------------------------ */

  var Timers = {
    // { id, total (s), endAt (ms) | null, left (ms, si está en pausa), done }
    list: store.get('timers', []),
    compose: 0,
    view: 'compose',
    nextId: 1,

    save: function () { store.set('timers', Timers.list); },

    leftMs: function (t, now) {
      return t.endAt ? Math.max(0, t.endAt - now) : t.left;
    },

    nextRunning: function () {
      var best = null;
      for (var i = 0; i < Timers.list.length; i++) {
        var t = Timers.list[i];
        if (t.endAt && !t.done && (!best || t.endAt < best.endAt)) best = t;
      }
      return best;
    },

    add: function (sec) {
      Timers.compose = Math.min(Timers.compose + sec, 99 * 60);
      Timers.renderCompose();
    },

    clear: function () {
      Timers.compose = 0;
      Timers.renderCompose();
    },

    start: function () {
      if (!Timers.compose || Timers.list.length >= MAX_TIMERS) return;
      Timers.create(Timers.compose);
      Timers.compose = 0;
      Timers.view = 'list';
      Timers.render();
    },

    create: function (sec) {
      Timers.list.push({
        id: Date.now() + '-' + (Timers.nextId++),
        total: sec,
        endAt: Date.now() + sec * 1000,
        left: sec * 1000,
        done: false
      });
      Timers.save();
    },

    find: function (id) {
      for (var i = 0; i < Timers.list.length; i++) if (Timers.list[i].id === id) return Timers.list[i];
      return null;
    },

    toggle: function (id) {
      var t = Timers.find(id);
      if (!t || t.done) return;
      var now = Date.now();
      if (t.endAt) { t.left = t.endAt - now; t.endAt = null; }
      else { t.endAt = now + t.left; }
      Timers.save();
      Timers.render();
    },

    cancel: function (id) {
      var out = [];
      for (var i = 0; i < Timers.list.length; i++) if (Timers.list[i].id !== id) out.push(Timers.list[i]);
      Timers.list = out;
      if (!out.length) Timers.view = 'compose';
      Timers.save();
      Timers.render();
    },

    removeDone: function () {
      var out = [];
      var done = [];
      for (var i = 0; i < Timers.list.length; i++) {
        (Timers.list[i].done ? done : out).push(Timers.list[i]);
      }
      Timers.list = out;
      if (!out.length) Timers.view = 'compose';
      Timers.save();
      Timers.render();
      return done;
    },

    tick: function (now) {
      var fired = [];
      for (var i = 0; i < Timers.list.length; i++) {
        var t = Timers.list[i];
        if (t.endAt && !t.done && t.endAt <= now) {
          t.done = true;
          fired.push(t);
        }
      }
      if (fired.length) {
        Timers.save();
        Alarm.fire();
      }
      Timers.updateLive(now);
    },

    // Solo cambia textos y barras; el DOM se reconstruye en render().
    updateLive: function (now) {
      var items = $('timerList').getElementsByClassName('timer-item');
      for (var i = 0; i < items.length; i++) {
        var t = Timers.find(items[i].getAttribute('data-id'));
        if (!t) continue;
        var left = Timers.leftMs(t, now);
        items[i].getElementsByClassName('t-left')[0].textContent = fmtDuration(left / 1000);
        items[i].getElementsByTagName('i')[0].style.width = (100 - (left / (t.total * 1000)) * 100).toFixed(2) + '%';
      }
      renderClockChips();
    },

    renderCompose: function () {
      var d = $('timerDisplay');
      d.textContent = fmtDuration(Timers.compose);
      toggleClass(d, 'has-time', Timers.compose > 0);
      $('timerStart').disabled = !Timers.compose || Timers.list.length >= MAX_TIMERS;
    },

    render: function () {
      var n = Timers.list.length;
      if (!n) Timers.view = 'compose';
      var listView = Timers.view === 'list';

      toggleClass($('timerCompose'), 'hidden', listView);
      toggleClass($('timerList'), 'hidden', !listView);

      var sw = $('timerSwitch');
      toggleClass(sw, 'hidden', !n);
      sw.textContent = listView ? 'Nuevo' : 'Activos (' + n + ')';

      var running = false;
      for (var i = 0; i < n; i++) if (Timers.list[i].endAt && !Timers.list[i].done) running = true;
      toggleClass($('timerCard'), 'running', running);

      var html = '';
      for (i = 0; i < n; i++) {
        var t = Timers.list[i];
        var paused = !t.endAt && !t.done;
        html += '<div class="timer-item' + (paused ? ' paused' : '') + '" data-id="' + esc(t.id) + '">' +
          '<div class="t-main"><div class="t-left"></div>' +
          '<div class="t-label">' + (paused ? 'En pausa · ' : '') + durationLabel(t.total) + '</div></div>' +
          '<button class="round-btn accent" data-action="timer-toggle" data-id="' + esc(t.id) + '" aria-label="Pausar">' +
            (paused
              ? '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>'
              : '<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>') +
          '</button>' +
          '<button class="round-btn" data-action="timer-cancel" data-id="' + esc(t.id) + '" aria-label="Cancelar">' +
            '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7l-1.4-1.4L9.2 12 2.9 5.7l1.4-1.4 6.3 6.3 6.3-6.3z" transform="translate(1.5 0)"/></svg>' +
          '</button>' +
          '<div class="t-bar"><i></i></div>' +
          '</div>';
      }
      if (n && n < MAX_TIMERS) {
        html += '<button class="timer-add" data-action="timer-view">+ Otro temporizador</button>';
      }
      var listEl = $('timerList');
      listEl.className = 'timer-list count-' + n + (listView ? '' : ' hidden');
      listEl.innerHTML = html;

      Timers.renderCompose();
      Timers.updateLive(Date.now());
    }
  };

  /* ------------------------------------------------------------------ */
  /* Alarma                                                              */
  /* ------------------------------------------------------------------ */

  var Alarm = {
    active: false,
    silenceTimer: null,

    fire: function () {
      var done = [];
      for (var i = 0; i < Timers.list.length; i++) if (Timers.list[i].done) done.push(durationLabel(Timers.list[i].total));
      $('alarmLabel').textContent = 'Temporizador de ' + done.join(' y ');
      if (Alarm.active) return;
      Alarm.active = true;
      $('alarm').classList.remove('hidden');
      Night.apply();
      Player.alarmStart();
      clearTimeout(Alarm.silenceTimer);
      Alarm.silenceTimer = setTimeout(Player.alarmSilence, ALARM_SOUND_MAX);
    },

    stop: function (snooze) {
      clearTimeout(Alarm.silenceTimer);
      Alarm.active = false;
      $('alarm').classList.add('hidden');
      var done = Timers.removeDone();
      if (snooze) {
        for (var i = 0; i < done.length && Timers.list.length < MAX_TIMERS; i++) Timers.create(60);
        Timers.view = 'list';
        Timers.render();
      }
      if (Player.mode === 'alarm') Player.alarmStop();
      Night.apply();
    }
  };

  /* ------------------------------------------------------------------ */
  /* Selector de emisoras                                                */
  /* ------------------------------------------------------------------ */

  var Sheet = {
    tab: 'fav',
    items: [],
    cache: {},

    open: function () {
      $('sheet').classList.remove('hidden');
      Sheet.show(Sheet.tab);
    },

    close: function () {
      $('sheet').classList.add('hidden');
      $('searchInput').blur();
    },

    show: function (tab) {
      Sheet.tab = tab;
      var tabs = $('sheetTabs').getElementsByClassName('tab');
      for (var i = 0; i < tabs.length; i++) toggleClass(tabs[i], 'active', tabs[i].getAttribute('data-tab') === tab);
      toggleClass($('searchForm'), 'hidden', tab !== 'search');

      if (tab === 'fav') {
        Sheet.renderList(Player.favorites, 'Aún no tienes favoritas. Toca la ★ en cualquier emisora.');
      } else if (tab === 'cl') {
        Sheet.fetch('cl', { country: 'CL' });
      } else if (tab === 'chill') {
        Sheet.fetch('chill', { tag: 'chillout' }, SOMA_FAVORITES);
      } else {
        var last = Sheet.cache['search'];
        Sheet.renderList(last || [], 'Escribe el nombre de una radio o un estilo.');
      }
    },

    fetch: function (key, params, prepend) {
      if (Sheet.cache[key]) return Sheet.renderList(Sheet.cache[key]);
      $('sheetList').innerHTML = '<div class="empty">Cargando emisoras…</div>';
      getJSON('/api/radio?' + q(params), function (err, data) {
        if (err || !data || !data.stations) {
          if (Sheet.tab === key) $('sheetList').innerHTML = '<div class="empty">No se pudo cargar la lista. Revisa la conexión.</div>';
          return;
        }
        var list = (prepend || []).concat(data.stations);
        Sheet.cache[key] = list;
        if (Sheet.tab === key) Sheet.renderList(list, 'Sin resultados.');
      });
    },

    search: function (text) {
      text = (text || '').replace(/^\s+|\s+$/g, '');
      if (!text) return;
      Sheet.cache['search'] = null;
      Sheet.fetch('search', { q: text });
    },

    renderList: function (list, emptyText) {
      Sheet.items = list;
      if (!list.length) {
        $('sheetList').innerHTML = '<div class="empty">' + esc(emptyText || 'Sin emisoras.') + '</div>';
        return;
      }
      var html = '';
      for (var i = 0; i < list.length; i++) {
        var st = list[i];
        var a = artHtml(st);
        var cur = Player.station && Player.station.id === st.id;
        html += '<div class="st' + (cur ? ' current' : '') + '">' +
          '<button class="st-play" data-action="station-play" data-idx="' + i + '">' +
            '<div class="art small" style="' + a.style + '">' + a.html + '</div>' +
            '<div class="st-text"><div class="st-name">' + esc(st.name) + '</div>' +
            '<div class="st-tags">' + esc(st.tags || '') + '</div></div>' +
          '</button>' +
          '<button class="star' + (Player.isFavorite(st.id) ? ' on' : '') + '" data-action="station-fav" data-idx="' + i + '" aria-label="Favorita">' +
            '<svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>' +
          '</button>' +
          '</div>';
      }
      $('sheetList').innerHTML = html;
    }
  };

  /* ------------------------------------------------------------------ */
  /* Ajustes                                                             */
  /* ------------------------------------------------------------------ */

  var Settings = {
    results: [],

    open: function () {
      $('settings').classList.remove('hidden');
      Settings.render();
    },

    close: function () {
      $('settings').classList.add('hidden');
      $('cityInput').blur();
    },

    render: function () {
      $('setCity').textContent = settings.city;
      toggleClass($('setSeconds'), 'on', settings.seconds);
      toggleClass($('setNight'), 'on', settings.nightDim);
    },

    toggle: function (key) {
      settings[key] = !settings[key];
      saveSettings();
      Settings.render();
      applySettings();
    },

    searchCity: function (text) {
      text = (text || '').replace(/^\s+|\s+$/g, '');
      if (!text) return;
      var box = $('cityResults');
      box.innerHTML = '<div class="empty">Buscando…</div>';
      getJSON('/api/geocode?' + q({ q: text }), function (err, data) {
        Settings.results = (!err && data && data.results) || [];
        if (!Settings.results.length) {
          box.innerHTML = '<div class="empty">' + (err ? 'No se pudo buscar.' : 'No encontré esa ciudad.') + '</div>';
          return;
        }
        var html = '';
        for (var i = 0; i < Settings.results.length; i++) {
          var r = Settings.results[i];
          html += '<button class="city" data-action="city-pick" data-idx="' + i + '">' + esc(r.name) +
            '<small>' + esc([r.admin1, r.country].join(', ').replace(/^, |, $/g, '')) + '</small></button>';
        }
        box.innerHTML = html;
      });
    },

    pickCity: function (idx) {
      var r = Settings.results[idx];
      if (!r) return;
      settings.city = r.name;
      settings.lat = r.lat;
      settings.lon = r.lon;
      saveSettings();
      $('cityResults').innerHTML = '';
      $('cityInput').value = '';
      Weather.data = null;
      Weather.render();
      Weather.load();
      Settings.render();
    }
  };

  function applySettings() {
    toggleClass(document.body, 'no-seconds', !settings.seconds);
    Night.apply();
  }

  /* ------------------------------------------------------------------ */
  /* Modo noche y mantenimiento                                          */
  /* ------------------------------------------------------------------ */

  var Night = {
    apply: function () {
      var h = new Date().getHours();
      var night = settings.nightDim && (h >= 23 || h < 7) && !Alarm.active &&
        $('sheet').className.indexOf('hidden') > -1 && $('settings').className.indexOf('hidden') > -1;
      toggleClass($('dim'), 'on', night);
    }
  };

  // Recarga diaria (4 AM) para tomar nuevas versiones, solo si no hay nada en curso.
  function maybeReload(now) {
    var d = new Date(now);
    if (d.getHours() !== 4 || now - bootAt < 60 * 60 * 1000) return;
    if (Timers.list.length || Player.mode !== 'idle' || Alarm.active) return;
    window.location.reload();
  }

  /* ------------------------------------------------------------------ */
  /* Eventos                                                             */
  /* ------------------------------------------------------------------ */

  function findAction(node) {
    while (node && node !== document) {
      if (node.getAttribute && node.getAttribute('data-action')) return node;
      node = node.parentNode;
    }
    return null;
  }

  var actions = {
    'settings-open': function () { Settings.open(); Night.apply(); },
    'settings-close': function () { Settings.close(); Night.apply(); },
    'toggle-setting': function (el) { Settings.toggle(el.getAttribute('data-key')); },
    'city-pick': function (el) { Settings.pickCity(+el.getAttribute('data-idx')); },
    'reload': function () { window.location.reload(); },

    'timer-add': function (el) { Timers.add(+el.getAttribute('data-sec')); },
    'timer-clear': function () { Timers.clear(); },
    'timer-start': function () { Timers.start(); },
    'timer-toggle': function (el) { Timers.toggle(el.getAttribute('data-id')); },
    'timer-cancel': function (el) { Timers.cancel(el.getAttribute('data-id')); },
    'timer-view': function () {
      Timers.view = Timers.view === 'list' ? 'compose' : 'list';
      Timers.render();
    },

    'alarm-stop': function () { Alarm.stop(false); },
    'alarm-snooze': function () { Alarm.stop(true); },
    'alarm-test': function () {
      if (Alarm.active || Player.mode === 'alarm') return;
      Player.unlock();
      Player.alarmStart();
      setTimeout(function () { if (!Alarm.active) Player.alarmStop(); }, 4000);
    },

    'radio-toggle': function () { Player.toggle(); },
    'radio-next': function () { Player.step(1); },
    'radio-prev': function () { Player.step(-1); },

    'sheet-open': function () { Sheet.open(); Night.apply(); },
    'sheet-close': function () { Sheet.close(); Night.apply(); },
    'sheet-tab': function (el) { Sheet.show(el.getAttribute('data-tab')); },
    'station-play': function (el) {
      var st = Sheet.items[+el.getAttribute('data-idx')];
      if (!st) return;
      Player.play(st);
      Sheet.close();
      Night.apply();
    },
    'station-fav': function (el) {
      var st = Sheet.items[+el.getAttribute('data-idx')];
      if (!st) return;
      Player.toggleFavorite(st);
      toggleClass(el, 'on', Player.isFavorite(st.id));
    }
  };

  document.addEventListener('click', function (e) {
    var el = findAction(e.target);
    if (!el || el.disabled) return;
    var fn = actions[el.getAttribute('data-action')];
    if (fn) fn(el, e);
  }, false);

  // Tocar el fondo oscuro cierra las hojas.
  $('sheet').addEventListener('click', function (e) { if (e.target === this) { Sheet.close(); Night.apply(); } }, false);
  $('settings').addEventListener('click', function (e) { if (e.target === this) { Settings.close(); Night.apply(); } }, false);

  $('searchForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('searchInput').blur();
    Sheet.search($('searchInput').value);
  }, false);

  $('cityForm').addEventListener('submit', function (e) {
    e.preventDefault();
    $('cityInput').blur();
    Settings.searchCity($('cityInput').value);
  }, false);

  // Primer toque: habilita el audio para que la alarma pueda sonar sola después.
  document.addEventListener('touchend', Player.unlock, false);
  document.addEventListener('click', Player.unlock, false);

  // Activa los estados :active en iOS.
  document.addEventListener('touchstart', function () {}, false);

  // Evita el rebote/scroll de la página completa, salvo dentro de listas.
  document.addEventListener('touchmove', function (e) {
    var n = e.target;
    while (n && n !== document.body) {
      if (n.nodeType === 1 && hasClass(n, 'scroll')) return;
      n = n.parentNode;
    }
    e.preventDefault();
  }, false);

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */

  if (window.navigator.standalone) document.documentElement.classList.add('standalone');

  // Limpia temporizadores que terminaron mientras la app estaba cerrada.
  (function () {
    var now = Date.now();
    var out = [];
    for (var i = 0; i < Timers.list.length; i++) {
      var t = Timers.list[i];
      if (!(t.endAt && t.endAt < now - 5 * 60 * 1000)) out.push(t);
    }
    Timers.list = out;
    if (out.length) Timers.view = 'list';
  })();

  // Agrega las favoritas nuevas a quienes ya tenían una lista guardada.
  if (store.get('favVersion', 1) < FAVORITES_VERSION) {
    var oldDefault = !Player.station || Player.station.id === 'soma-groovesalad';
    var additions = [];
    for (var f = 0; f < NEW_FAVORITES.length; f++) {
      if (!Player.isFavorite(NEW_FAVORITES[f].id)) additions.push(NEW_FAVORITES[f]);
    }
    Player.favorites = additions.concat(Player.favorites);
    store.set('favorites', Player.favorites);
    if (oldDefault) {
      Player.station = NEW_FAVORITES[0];
      store.set('station', Player.station);
    }
    store.set('favVersion', FAVORITES_VERSION);
  }

  applySettings();
  Clock.render(new Date());
  Weather.render();
  Timers.render();
  Player.render();
  Weather.load();

  var lastMinute = -1;
  function tick() {
    var now = Date.now();
    var d = new Date(now);
    Clock.render(d);
    Timers.tick(now);
    if (d.getMinutes() !== lastMinute) {
      lastMinute = d.getMinutes();
      Night.apply();
      Weather.renderUpdated();
      if (Weather.isStale()) Weather.load();
      maybeReload(now);
    }
    setTimeout(tick, 1000 - (Date.now() % 1000) + 10);
  }
  tick();

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Weather.isStale()) Weather.load();
  }, false);
})();
