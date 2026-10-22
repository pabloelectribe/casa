// GET /api/log?e=evento&d=json — diagnóstico remoto: el iPad reporta eventos del
// reproductor y quedan en los logs de Vercel (no se guardan en ningún otro lado).
const { send } = require('./_lib');

module.exports = (req, res) => {
  const event = String(req.query.e || '').slice(0, 40);
  const data = String(req.query.d || '').slice(0, 1500);
  console.log(`[ipad] ${event} ${data} ua=${String(req.headers['user-agent'] || '').slice(0, 120)}`);
  send(res, 204, {});
};
