// GET /api/weather?lat=..&lon=..
// Pronóstico de Open-Meteo (sin API key), recortado a lo que muestra el dashboard.
const { fetchJSON, send, num } = require('./_lib');

module.exports = async (req, res) => {
  const lat = num(req.query.lat, -90, 90) ?? -33.4489;
  const lon = num(req.query.lon, -180, 180) ?? -70.6693;

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max',
    timezone: 'auto',
    forecast_days: '7',
  });

  try {
    const d = await fetchJSON(`https://api.open-meteo.com/v1/forecast?${params}`);
    const c = d.current;

    // Las horas vienen en hora local de la ciudad: empezamos en la hora actual.
    const hourKey = `${c.time.slice(0, 13)}:00`;
    let start = d.hourly.time.indexOf(hourKey);
    if (start < 0) start = 0;
    const hourly = [];
    for (let i = start; i < Math.min(start + 24, d.hourly.time.length); i++) {
      hourly.push({
        time: d.hourly.time[i],
        temp: d.hourly.temperature_2m[i],
        code: d.hourly.weather_code[i],
        pop: d.hourly.precipitation_probability[i] ?? 0,
        isDay: d.hourly.is_day[i],
      });
    }

    const daily = d.daily.time.map((date, i) => ({
      date,
      code: d.daily.weather_code[i],
      max: d.daily.temperature_2m_max[i],
      min: d.daily.temperature_2m_min[i],
      pop: d.daily.precipitation_probability_max[i] ?? 0,
      sunrise: d.daily.sunrise[i],
      sunset: d.daily.sunset[i],
      uv: d.daily.uv_index_max[i],
    }));

    send(res, 200, {
      timezone: d.timezone,
      current: {
        time: c.time,
        temp: c.temperature_2m,
        feels: c.apparent_temperature,
        humidity: c.relative_humidity_2m,
        code: c.weather_code,
        isDay: c.is_day,
        wind: c.wind_speed_10m,
      },
      hourly,
      daily,
    }, 600);
  } catch (err) {
    send(res, 502, { error: 'weather_unavailable', detail: String(err.message || err) });
  }
};
