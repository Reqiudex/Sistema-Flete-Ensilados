/** Cabeceras de seguridad básicas (sin dependencias externas). */
'use strict';

function cabecerasSeguridad(req, res, next) {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
  });
  next();
}

module.exports = { cabecerasSeguridad };
