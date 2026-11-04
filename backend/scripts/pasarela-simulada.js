#!/usr/bin/env node
/**
 * Pasarela de pagos SIMULADA (solo demostración y pruebas; nunca en producción).
 *
 * Reproduce el contrato de pasarela-pagos (docs/INTEGRACION.md):
 *   - Firma HMAC de cada petición (X-Api-Key, X-Timestamp ±5 min, X-Nonce único, X-Signature).
 *   - POST /v1/payments (centavo único sumado al monto base, idempotency_key), GET /v1/payments/{id},
 *     POST /v1/payments/{id}/cancel, GET /v1/status, GET /health.
 *   - Checkout GET /pay/{id} con el monto exacto y un botón "Simular pago".
 *   - Webhooks firmados payment.paid / payment.expired / payment.cancelled hacia SIM_WEBHOOK_URL.
 *
 * Variables: SIM_PORT (8099), SIM_API_KEY (pk_simulada), SIM_SECRET (sk_simulada),
 *            SIM_WEBHOOK_URL (http://backend:3001/api/pagos/webhook), SIM_PUBLIC_URL (http://localhost:8099).
 * Fallos a demanda: POST /simular/fallo {"status":503,"code":"gateway_degraded"} y {"status":null} para normalizar.
 */
'use strict';

const http = require('http');
const crypto = require('crypto');

const PUERTO = Number(process.env.SIM_PORT) || 8099;
const API_KEY = process.env.SIM_API_KEY || 'pk_simulada';
const SECRETO = process.env.SIM_SECRET || 'sk_simulada';
const WEBHOOK = process.env.SIM_WEBHOOK_URL || 'http://backend:3001/api/pagos/webhook';
const PUBLICA = (process.env.SIM_PUBLIC_URL || `http://localhost:${PUERTO}`).replace(/\/+$/, '');

const cobros = new Map();
const porIdem = new Map();
const nonces = new Map();
let fallo = null;

const sha256 = (d) => crypto.createHash('sha256').update(d).digest('hex');
const hmac = (s) => crypto.createHmac('sha256', SECRETO).update(s).digest('hex');
const ahoraSeg = () => Math.floor(Date.now() / 1000);
const igual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const escapar = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function json(res, status, cuerpo, extra = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extra });
  res.end(JSON.stringify(cuerpo));
}

function autorizado(req, ruta, cuerpo) {
  const h = req.headers;
  const ts = Number(h['x-timestamp']);
  const nonce = String(h['x-nonce'] || '');
  if (h['x-api-key'] !== API_KEY || !Number.isFinite(ts) || Math.abs(ahoraSeg() - ts) > 300) return false;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce) || nonces.has(nonce)) return false;
  const esperado = hmac([String(ts), nonce, req.method, ruta, sha256(cuerpo)].join('\n'));
  if (!igual(esperado, String(h['x-signature'] || ''))) return false;
  nonces.set(nonce, Date.now());
  for (const [n, t] of nonces) if (Date.now() - t > 600000) nonces.delete(n);
  return true;
}

function vista(c) {
  const restante = Math.max(0, Math.round((new Date(c.expires_at).getTime() - Date.now()) / 1000));
  return { ...c, seconds_remaining: c.status === 'pending' ? restante : 0 };
}

async function enviarWebhook(evento, c) {
  const cuerpo = JSON.stringify({ event: evento, created_at: new Date().toISOString(), data: vista(c) });
  const ts = String(ahoraSeg());
  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pasarela-Event': evento,
        'X-Pasarela-Delivery': crypto.randomUUID(),
        'X-Pasarela-Timestamp': ts,
        'X-Pasarela-Signature': hmac(`${ts}.${cuerpo}`),
      },
      body: cuerpo,
      redirect: 'manual',
    });
    console.log(`[Simulador] webhook ${evento} ${c.id} -> ${r.status}`);
  } catch (e) {
    console.log(`[Simulador] webhook ${evento} ${c.id} falló: ${e.message}`);
  }
}

function centavoLibre(base) {
  const ocupados = new Set([...cobros.values()].filter((c) => c.status === 'pending' && c.base_amount_cents === base).map((c) => c.total_amount_cents - base));
  for (let i = 1; i <= 99; i += 1) if (!ocupados.has(i)) return i;
  return null;
}

function crear(b) {
  if (!Number.isInteger(b.amount_cents) || b.amount_cents <= 0) return [400, { error: { code: 'invalid_request', message: 'amount_cents debe ser un entero positivo' } }];
  if (typeof b.reference !== 'string' || b.reference.length < 1 || b.reference.length > 128) return [400, { error: { code: 'invalid_request', message: 'reference inválida' } }];
  if (b.idempotency_key && porIdem.has(b.idempotency_key)) {
    const c = cobros.get(porIdem.get(b.idempotency_key));
    if (c.base_amount_cents !== b.amount_cents || c.reference !== b.reference) return [409, { error: { code: 'conflict' } }];
    return [200, vista(c)];
  }
  const centavo = centavoLibre(b.amount_cents);
  if (centavo === null) return [429, { error: { code: 'no_free_cents' } }, { 'Retry-After': '30' }];
  const exp = Math.min(900, Math.max(60, Number(b.expires_in_seconds) || 300));
  const id = crypto.randomUUID();
  const total = b.amount_cents + centavo;
  const c = {
    id, status: 'pending', reference: b.reference, base_amount_cents: b.amount_cents, total_amount_cents: total,
    total_amount: (total / 100).toFixed(2), currency: 'BOB', created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + exp * 1000).toISOString(), paid_at: null,
    checkout_url: `${PUBLICA}/pay/${id}`, return_url: b.return_url || null, metadata: b.metadata || {},
  };
  cobros.set(id, c);
  if (b.idempotency_key) porIdem.set(b.idempotency_key, id);
  return [201, vista(c)];
}

function paginaCheckout(c) {
  const v = vista(c);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pago simulado</title><style>body{font-family:system-ui,sans-serif;max-width:420px;margin:40px auto;padding:0 16px;text-align:center}
.m{font-size:2.6rem;font-weight:800;color:#2d6a4f}.b{display:block;width:100%;padding:14px;margin-top:12px;border:0;border-radius:12px;font-weight:700;font-size:1rem;cursor:pointer}
.p{background:#2d6a4f;color:#fff}.s{background:#eee}.aviso{background:#fff3cd;padding:10px;border-radius:10px;font-size:.85rem}</style></head><body>
<p class="aviso">PASARELA SIMULADA — modo demostración. No se mueve dinero real.</p>
<h1>Referencia ${escapar(v.reference)}</h1><p>Pague exactamente</p><div class="m">Bs ${escapar(v.total_amount)}</div>
<p>Estado: <b id="e">${escapar(v.status)}</b> · vence en ${v.seconds_remaining}s</p>
${v.status === 'pending' ? `<form method="post" action="/simular/pagar/${escapar(v.id)}"><button class="b p">Simular pago</button></form>
<form method="post" action="/simular/vencer/${escapar(v.id)}"><button class="b s">Simular vencimiento</button></form>` : ''}
${v.return_url ? `<p><a href="${escapar(v.return_url)}">Volver al comercio</a></p>` : ''}</body></html>`;
}

const servidor = http.createServer((req, res) => {
  const partes = [];
  req.on('data', (d) => partes.push(d));
  req.on('end', async () => {
    const cuerpo = Buffer.concat(partes).toString('utf8');
    const ruta = req.url;
    const [path] = ruta.split('?');
    try {
      if (path === '/health') return json(res, 200, { status: 'ok' });

      // Utilidades del simulador (sin firma: solo para demostración local)
      if (req.method === 'POST' && path === '/simular/fallo') {
        const b = JSON.parse(cuerpo || '{}');
        fallo = b.status ? { status: b.status, code: b.code || 'gateway_degraded' } : null;
        return json(res, 200, { fallo });
      }
      const sim = path.match(/^\/simular\/(pagar|vencer)\/([^/]+)$/);
      if (req.method === 'POST' && sim) {
        const c = cobros.get(sim[2]);
        if (!c) return json(res, 404, { error: { code: 'not_found' } });
        if (sim[1] === 'pagar') Object.assign(c, { status: 'paid', paid_at: new Date().toISOString() });
        else c.status = 'expired';
        await enviarWebhook(sim[1] === 'pagar' ? 'payment.paid' : 'payment.expired', c);
        res.writeHead(303, { Location: `/pay/${c.id}` });
        return res.end();
      }
      const pay = path.match(/^\/pay\/([^/]+)$/);
      if (req.method === 'GET' && pay) {
        const c = cobros.get(pay[1]);
        if (!c) { res.writeHead(404); return res.end('No encontrado'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" });
        return res.end(paginaCheckout(c));
      }

      if (!path.startsWith('/v1/')) return json(res, 404, { error: { code: 'not_found' } });
      if (!autorizado(req, ruta, cuerpo)) return json(res, 401, { error: { code: 'unauthorized' } });
      if (fallo) return json(res, fallo.status, { error: { code: fallo.code } }, { 'Retry-After': '30' });

      if (req.method === 'GET' && path === '/v1/status') {
        return json(res, 200, { status: 'ok', accepting_payments: true, payments_paused: false, gmail: { connected: true, stale: false } });
      }
      if (req.method === 'POST' && path === '/v1/payments') {
        let b;
        try { b = JSON.parse(cuerpo); } catch { return json(res, 400, { error: { code: 'invalid_request' } }); }
        const [st, out, h] = crear(b);
        return json(res, st, out, h);
      }
      const m = path.match(/^\/v1\/payments\/([^/]+)(\/cancel)?$/);
      if (m) {
        const c = cobros.get(m[1]);
        if (!c) return json(res, 404, { error: { code: 'not_found' } });
        if (req.method === 'GET' && !m[2]) return json(res, 200, vista(c));
        if (req.method === 'POST' && m[2]) {
          if (c.status !== 'pending') return json(res, 409, { error: { code: 'conflict' } });
          c.status = 'cancelled';
          enviarWebhook('payment.cancelled', c);
          return json(res, 200, vista(c));
        }
      }
      return json(res, 404, { error: { code: 'not_found' } });
    } catch (e) {
      console.error('[Simulador]', e);
      return json(res, 500, { error: { code: 'internal' } });
    }
  });
});

// Vencimiento automático (+90 s de gracia, como la pasarela real)
setInterval(() => {
  for (const c of cobros.values()) {
    if (c.status === 'pending' && Date.now() > new Date(c.expires_at).getTime() + 90000) {
      c.status = 'expired';
      enviarWebhook('payment.expired', c);
    }
  }
}, 5000).unref();

if (require.main === module) {
  servidor.listen(PUERTO, () => console.log(`[Simulador] Pasarela simulada en el puerto ${PUERTO} (webhook → ${WEBHOOK})`));
}
module.exports = { servidor };
