/**
 * Cliente de la pasarela de pagos QR (repositorio Reqiudex/pasarela-pagos, QR estático de Banco Ganadero).
 *
 * Firma de cada petición:
 *   X-Signature = hex(HMAC_SHA256(secreto, ts \n nonce \n MÉTODO \n ruta_con_query \n sha256_hex(cuerpo)))
 * Firma de webhooks:
 *   X-Pasarela-Signature = hex(HMAC_SHA256(secreto, X-Pasarela-Timestamp + "." + cuerpo_crudo))
 * El secreto solo existe en el servidor (variables de entorno); nunca se envía al navegador.
 */
'use strict';

const crypto = require('crypto');
const { pasarelaConfig } = require('../config/env');
const { ErrorNegocio } = require('../utils/errors');

let fetchImpl = null; // inyectable en pruebas
function __setFetch(fn) { fetchImpl = fn; }
const hacerFetch = (...a) => (fetchImpl || globalThis.fetch)(...a);

const sha256Hex = (d) => crypto.createHash('sha256').update(d).digest('hex');

function firmarPeticion(secreto, { timestamp, nonce, metodo, ruta, cuerpo = '' }) {
  const cadena = [String(timestamp), nonce, metodo.toUpperCase(), ruta, sha256Hex(cuerpo)].join('\n');
  return crypto.createHmac('sha256', secreto).update(cadena).digest('hex');
}

function cabecerasFirmadas(cfg, metodo, ruta, cuerpo) {
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(18).toString('base64url');
  return {
    'X-Api-Key': cfg.apiKey,
    'X-Timestamp': String(timestamp),
    'X-Nonce': nonce,
    'X-Signature': firmarPeticion(cfg.secret, { timestamp, nonce, metodo, ruta, cuerpo }),
    'Content-Type': 'application/json',
  };
}

function habilitada() {
  return pasarelaConfig() !== null;
}

function exigirConfig() {
  const cfg = pasarelaConfig();
  if (!cfg) throw new ErrorNegocio('El pago por QR no está habilitado en este momento.', 'PAGO_QR_NO_DISPONIBLE', 503);
  return cfg;
}

function traducirError(status, cuerpo, retryAfter) {
  const codigo = cuerpo?.error?.code;
  if (status === 429 && codigo === 'no_free_cents') {
    return new ErrorNegocio('Hay muchos cobros QR en curso para ese monto. Intente de nuevo en unos segundos.', 'PAGO_QR_OCUPADO', 429);
  }
  if (status === 429) return new ErrorNegocio('Demasiadas solicitudes de pago. Intente en un minuto.', 'PAGO_QR_LIMITE', 429);
  if (status === 503) {
    return new ErrorNegocio('La pasarela de pagos no puede confirmar cobros en este momento. Intente en unos minutos o elija otro método de pago.', 'PAGO_QR_NO_DISPONIBLE', 503);
  }
  if (status === 400) {
    return new ErrorNegocio(cuerpo?.error?.message || 'La pasarela rechazó los datos del cobro.', 'PAGO_QR_RECHAZADO', 400);
  }
  console.error('[Pasarela] Error inesperado', status, codigo, retryAfter || '');
  return new ErrorNegocio('No se pudo contactar con la pasarela de pagos.', 'PAGO_QR_ERROR', 502);
}

async function solicitar(metodo, ruta, payload) {
  const cfg = exigirConfig();
  const cuerpo = payload === undefined ? '' : JSON.stringify(payload);
  let res;
  try {
    res = await hacerFetch(cfg.baseUrl + ruta, {
      method: metodo,
      headers: cabecerasFirmadas(cfg, metodo, ruta, cuerpo),
      body: cuerpo || undefined,
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    console.error('[Pasarela] Sin conexión:', e.message);
    throw new ErrorNegocio('No se pudo contactar con la pasarela de pagos.', 'PAGO_QR_ERROR', 502);
  }
  const datos = await res.json().catch(() => null);
  if (!res.ok) throw traducirError(res.status, datos, res.headers?.get?.('Retry-After'));
  return datos;
}

/** @param {{amount_cents:number, reference:string, idempotency_key:string, description?:string, metadata?:object, return_url?:string}} p */
function crearCobro(p) {
  const cfg = exigirConfig();
  return solicitar('POST', '/v1/payments', { expires_in_seconds: cfg.expiraSegundos, ...p });
}
const obtenerCobro = (id) => solicitar('GET', `/v1/payments/${encodeURIComponent(id)}`);
const cancelarCobro = (id) => solicitar('POST', `/v1/payments/${encodeURIComponent(id)}/cancel`);
const estadoPasarela = () => solicitar('GET', '/v1/status');

/**
 * Verifica un webhook. `cuerpoCrudo` debe ser el Buffer/string EXACTO recibido.
 * Lanza ErrorNegocio 401 si la firma o el timestamp no son válidos (nunca revela el motivo exacto).
 */
function verificarWebhook(cabeceras, cuerpoCrudo, { ahoraSeg = Math.floor(Date.now() / 1000), toleranciaSeg = 300 } = {}) {
  const cfg = exigirConfig();
  const get = (k) => cabeceras[k] ?? cabeceras[k.toLowerCase()];
  const ts = get('X-Pasarela-Timestamp');
  const firma = get('X-Pasarela-Signature');
  const invalido = () => new ErrorNegocio('Webhook no autorizado.', 'WEBHOOK_NO_AUTORIZADO', 401);
  if (!ts || !firma || !Number.isFinite(Number(ts)) || Math.abs(ahoraSeg - Number(ts)) > toleranciaSeg) throw invalido();
  const crudo = Buffer.isBuffer(cuerpoCrudo) ? cuerpoCrudo : Buffer.from(String(cuerpoCrudo ?? ''));
  const esperado = crypto.createHmac('sha256', cfg.secret).update(`${ts}.`).update(crudo).digest();
  let recibido;
  try { recibido = Buffer.from(String(firma), 'hex'); } catch { throw invalido(); }
  if (recibido.length !== esperado.length || !crypto.timingSafeEqual(recibido, esperado)) throw invalido();
  let evento;
  try { evento = JSON.parse(crudo.toString('utf8')); } catch { throw invalido(); }
  return { entrega: get('X-Pasarela-Delivery') || null, evento };
}

module.exports = {
  habilitada, crearCobro, obtenerCobro, cancelarCobro, estadoPasarela, verificarWebhook,
  firmarPeticion, __setFetch,
};
