/** Limitador de intentos en memoria por IP+clave (protege login y verificación 2FA). */
'use strict';

function crearLimitador({ max = 10, ventanaMs = 15 * 60 * 1000, clave = (req) => req.ip } = {}) {
  const intentos = new Map();
  const limitador = (req, res, next) => {
    const k = clave(req);
    const ahora = Date.now();
    const reg = intentos.get(k);
    if (!reg || ahora > reg.expira) {
      intentos.set(k, { n: 1, expira: ahora + ventanaMs });
      return next();
    }
    reg.n += 1;
    if (reg.n > max) {
      res.set('Retry-After', String(Math.ceil((reg.expira - ahora) / 1000)));
      return res.status(429).json({ error: 'Demasiados intentos. Espere unos minutos.', codigo: 'DEMASIADOS_INTENTOS' });
    }
    return next();
  };
  limitador.reiniciar = () => intentos.clear();
  return limitador;
}

module.exports = { crearLimitador };
