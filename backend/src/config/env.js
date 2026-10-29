/**
 * Configuración centralizada a partir de variables de entorno.
 * Las funciones leen process.env en cada llamada (facilita las pruebas).
 */
'use strict';

const crypto = require('crypto');

let secretoTemporal = null;

function esProduccion() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Devuelve el secreto JWT.
 * - Producción: JWT_SECRET es obligatorio (mínimo 32 caracteres).
 * - Desarrollo: si falta, se genera un secreto aleatorio temporal
 *   (las sesiones se pierden al reiniciar el servidor).
 * Nunca existe un secreto "por defecto" escrito en el código.
 */
function obtenerJwtSecret() {
  const definido = (process.env.JWT_SECRET || '').trim();
  const esPlaceholder = /CAMBIE_ESTE/i.test(definido);

  if (definido && !esPlaceholder) {
    if (esProduccion() && definido.length < 32) {
      throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción.');
    }
    return definido;
  }

  if (esProduccion()) {
    throw new Error('JWT_SECRET es obligatorio en producción.');
  }

  if (!secretoTemporal) {
    secretoTemporal = crypto.randomBytes(32).toString('hex');
    console.warn('[Seguridad] JWT_SECRET no definido: se usa un secreto temporal (solo desarrollo).');
  }
  return secretoTemporal;
}

function jwtExpiraEn() {
  return process.env.JWT_EXPIRES_IN || '8h';
}

/** Las cuentas demo solo existen en modo memoria (sin Supabase) y fuera de producción. */
function permitirUsuariosDemo() {
  return process.env.ALLOW_DEMO_USERS === 'true' || !esProduccion();
}

function origenesCors() {
  const valor = (process.env.CORS_ORIGINS || '').trim();
  if (valor === '*') return '*';
  if (valor) return valor.split(',').map((o) => o.trim()).filter(Boolean);
  return [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://tesis.cherry.lat',
  ];
}

function googleMapsKey() {
  const k = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  if (!k || k === 'YOUR_GOOGLE_MAPS_API_KEY_HERE') return null;
  return k;
}

module.exports = {
  esProduccion,
  obtenerJwtSecret,
  jwtExpiraEn,
  permitirUsuariosDemo,
  origenesCors,
  googleMapsKey,
};
