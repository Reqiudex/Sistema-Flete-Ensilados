/**
 * Utilidades de prueba. Si bcryptjs/jsonwebtoken no están instaladas (entorno sin acceso a npm)
 * se registran sustitutos mínimos y funcionalmente equivalentes para las pruebas.
 * Con `npm ci` real se usan siempre las librerías verdaderas.
 */
'use strict';

const Module = require('module');
const crypto = require('crypto');

function disponible(nombre) {
  try { require.resolve(nombre); return true; } catch { return false; }
}

const sustitutos = {};
if (!disponible('bcryptjs')) {
  sustitutos.bcryptjs = {
    hash: async (p) => `$stub$${crypto.createHash('sha256').update(String(p)).digest('hex')}`,
    compare: async (p, h) => h === `$stub$${crypto.createHash('sha256').update(String(p)).digest('hex')}`,
  };
}
if (!disponible('jsonwebtoken')) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const firma = (d, s) => crypto.createHmac('sha256', s).update(d).digest('base64url');
  const seg = (t) => ({ '8h': 28800, '5m': 300 }[t] || Number(t) || 3600);
  sustitutos.jsonwebtoken = {
    sign: (payload, secret, opts = {}) => {
      const d = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...payload, exp: Math.floor(Date.now() / 1000) + seg(opts.expiresIn) })}`;
      return `${d}.${firma(d, secret)}`;
    },
    verify: (token, secret) => {
      const [h, p, s] = String(token).split('.');
      if (!s || firma(`${h}.${p}`, secret) !== s) throw new Error('firma inválida');
      const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
      if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('expirado');
      return payload;
    },
  };
}
const cargar = Module._load;
Module._load = function (request, ...resto) {
  if (sustitutos[request]) return sustitutos[request];
  return cargar.call(this, request, ...resto);
};

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'secreto-de-pruebas-con-mas-de-32-caracteres!!';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.GOOGLE_MAPS_API_KEY;

/** Ejecuta un controlador con req/res simulados y devuelve { status, body, headers }. */
async function llamar(handler, { body = {}, params = {}, query = {}, usuario, headers = {} } = {}) {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.send = (b) => { res.body = b; return res; };
  res.set = (h) => { Object.assign(res.headers, h); return res; };
  await handler({ body, params, query, usuario, headers, ip: '127.0.0.1' }, res, () => {});
  return { status: res.statusCode, body: res.body, headers: res.headers };
}

function reiniciarTodo() {
  require('../../src/models/productRepository')._reset();
  require('../../src/models/orderRepository')._reset();
  require('../../src/models/userRepository')._reset();
  require('../../src/models/parametrosFleteRepo')._reset();
}

module.exports = { llamar, reiniciarTodo };
