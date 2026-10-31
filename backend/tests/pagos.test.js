'use strict';
const { llamar, reiniciarTodo } = require('./helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const pub = require('../src/controllers/publicController');
const pagoCtl = require('../src/controllers/pagoController');
const admin = require('../src/controllers/adminController');
const pasarela = require('../src/services/pasarelaService');
const orderRepo = require('../src/models/orderRepository');

const SECRETO = 'sk_prueba';
function activarPasarela() {
  process.env.PASARELA_BASE_URL = 'https://apipagos.test';
  process.env.PASARELA_API_KEY = 'pk_prueba';
  process.env.PASARELA_SECRET = SECRETO;
}
function desactivarPasarela() {
  delete process.env.PASARELA_BASE_URL; delete process.env.PASARELA_API_KEY; delete process.env.PASARELA_SECRET;
}

/** Pasarela simulada: guarda los cobros y registra las peticiones recibidas. */
function pasarelaFalsa() {
  const cobros = new Map();
  const llamadas = [];
  let n = 0;
  const respuesta = (status, cuerpo) => ({ ok: status < 400, status, json: async () => cuerpo, headers: { get: () => null } });
  const fn = async (url, opts) => {
    llamadas.push({ url, ...opts });
    const ruta = url.replace('https://apipagos.test', '');
    if (opts.method === 'POST' && ruta === '/v1/payments') {
      const b = JSON.parse(opts.body);
      const previo = [...cobros.values()].find((c) => c.idem === b.idempotency_key);
      if (previo) return respuesta(200, previo.obj);
      n += 1;
      const obj = {
        id: `cobro-${n}`, status: 'pending', reference: b.reference, base_amount_cents: b.amount_cents,
        total_amount_cents: b.amount_cents + 1, total_amount: ((b.amount_cents + 1) / 100).toFixed(2),
        currency: 'BOB', created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + b.expires_in_seconds * 1000).toISOString(),
        seconds_remaining: b.expires_in_seconds, paid_at: null, checkout_url: `https://apipagos.test/pay/cobro-${n}`,
      };
      cobros.set(obj.id, { obj, idem: b.idempotency_key });
      return respuesta(201, obj);
    }
    const m = ruta.match(/^\/v1\/payments\/([^/]+)$/);
    if (opts.method === 'GET' && m && cobros.has(m[1])) return respuesta(200, cobros.get(m[1]).obj);
    return respuesta(404, { error: { code: 'not_found' } });
  };
  return { fn, cobros, llamadas };
}

/** Construye un webhook firmado como lo hace la pasarela. */
function webhookFirmado(evento, cobro, { entrega = crypto.randomUUID(), ts = Math.floor(Date.now() / 1000), secreto = SECRETO } = {}) {
  const cuerpo = Buffer.from(JSON.stringify({ event: evento, created_at: new Date().toISOString(), data: cobro }));
  const firma = crypto.createHmac('sha256', secreto).update(`${ts}.`).update(cuerpo).digest('hex');
  return {
    cuerpo,
    headers: { 'x-pasarela-event': evento, 'x-pasarela-delivery': entrega, 'x-pasarela-timestamp': String(ts), 'x-pasarela-signature': firma },
  };
}

async function pedidoQr(total = {}) {
  const r = await llamar(pub.crearPedido, { body: {
    cliente_nombre: 'Juan Pérez', cliente_telefono: '78911223', latitud: -17.78, longitud: -63.18,
    metodo_pago: 'QR', items: [{ producto_id: 'prod-silo-maiz', cantidad_tons: 10 }], ...total,
  } });
  assert.equal(r.status, 201);
  return r.body;
}

test.beforeEach(() => { reiniciarTodo(); activarPasarela(); pasarela.__setFetch(null); });
test.after(() => { desactivarPasarela(); pasarela.__setFetch(null); });

test('Firma de peticiones y de webhooks coincide con los vectores oficiales de la pasarela', () => {
  const firma = pasarela.firmarPeticion('sk_prueba', {
    timestamp: 1700000000, nonce: 'abcdefghijklmnop', metodo: 'POST', ruta: '/v1/payments',
    cuerpo: '{"amount_cents":5000,"reference":"pedido-1"}',
  });
  assert.equal(firma, '0abf4c9be73cf5686da7efc05835610282d4aef69e4d611ff7b998558c4988fa');

  const cuerpo = Buffer.from('{"event":"payment.paid"}');
  const hdr = { 'X-Pasarela-Timestamp': '1700000000', 'X-Pasarela-Signature': '2a78b2a2626d360999c122239b0be4842ce690c7f0c3a8e04f6d9925a122bed4' };
  const r = pasarela.verificarWebhook(hdr, cuerpo, { ahoraSeg: 1700000000 });
  assert.equal(r.evento.event, 'payment.paid');
  assert.throws(() => pasarela.verificarWebhook(hdr, cuerpo, { ahoraSeg: 1700000000 + 3600 }), /Webhook no autorizado/);
  assert.throws(() => pasarela.verificarWebhook(hdr, Buffer.from('{"event":"payment.paid" }'), { ahoraSeg: 1700000000 }), /Webhook no autorizado/);
});

test('Iniciar pago: monto en centavos desde el servidor, petición firmada y cobro reutilizado', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const pedido = await pedidoQr();
  const r1 = await llamar(pagoCtl.iniciar, { params: { codigo: pedido.codigo_pedido } });
  assert.equal(r1.status, 201);
  assert.equal(r1.body.pago_estado, 'Pendiente');
  assert.equal(r1.body.monto_a_pagar_bs, (Math.round(pedido.total_bs * 100) + 1) / 100);
  assert.ok(r1.body.checkout_url.startsWith('https://apipagos.test/pay/'));
  assert.ok(r1.body.segundos_restantes > 0);

  const enviado = JSON.parse(f.llamadas[0].body);
  assert.equal(enviado.amount_cents, Math.round(pedido.total_bs * 100));
  assert.equal(enviado.reference, pedido.codigo_pedido);
  const h = f.llamadas[0].headers;
  assert.equal(h['X-Api-Key'], 'pk_prueba');
  assert.match(h['X-Nonce'], /^[A-Za-z0-9_-]{16,64}$/);
  assert.equal(h['X-Signature'], pasarela.firmarPeticion(SECRETO, {
    timestamp: h['X-Timestamp'], nonce: h['X-Nonce'], metodo: 'POST', ruta: '/v1/payments', cuerpo: f.llamadas[0].body,
  }));
  // no se filtra el secreto ni datos del cliente
  assert.ok(!JSON.stringify(f.llamadas[0]).includes(SECRETO));
  assert.ok(!f.llamadas[0].body.includes('Juan'));

  const r2 = await llamar(pagoCtl.iniciar, { params: { codigo: pedido.codigo_pedido } });
  assert.equal(r2.body.checkout_url, r1.body.checkout_url);
  assert.equal(f.llamadas.length, 1, 'no crea un segundo cobro mientras el primero esté vigente');
});

test('Iniciar pago: rechaza métodos distintos de QR, pedidos cancelados y pasarela no configurada', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const transf = await pedidoQr({ metodo_pago: 'Transferencia' });
  const a = await llamar(pagoCtl.iniciar, { params: { codigo: transf.codigo_pedido } });
  assert.equal(a.status, 409);

  const qr = await pedidoQr();
  await orderRepo.actualizarEstado(qr.id, 'Cancelado', 'test');
  const b = await llamar(pagoCtl.iniciar, { params: { codigo: qr.codigo_pedido } });
  assert.equal(b.body.codigo, 'PEDIDO_NO_COBRABLE');

  const c = await llamar(pagoCtl.iniciar, { params: { codigo: 'ESC-9999' } });
  assert.equal(c.status, 404);
  const d = await llamar(pagoCtl.iniciar, { params: { codigo: "ESC-1'; drop" } });
  assert.equal(d.status, 404);

  desactivarPasarela();
  const e = await llamar(pagoCtl.iniciar, { params: { codigo: qr.codigo_pedido } });
  assert.equal(e.status, 503);
  const p = await llamar(pub.parametros);
  assert.equal(p.body.pagos_qr, false);
});

test('Webhook payment.paid con firma válida marca el pedido como Pagado (idempotente)', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const pedido = await pedidoQr();
  const ini = await llamar(pagoCtl.iniciar, { params: { codigo: pedido.codigo_pedido } });
  const cobro = [...f.cobros.values()][0].obj;
  const wh = webhookFirmado('payment.paid', { ...cobro, status: 'paid', paid_at: new Date().toISOString() }, { entrega: 'entrega-1' });

  const r = await llamar(pagoCtl.webhook, { body: wh.cuerpo, headers: wh.headers });
  assert.equal(r.status, 200);
  assert.equal(r.body.pago_estado, 'Pagado');
  const rep = await llamar(pagoCtl.webhook, { body: wh.cuerpo, headers: wh.headers });
  assert.equal(rep.status, 200);
  assert.equal(rep.body.motivo, 'duplicado');

  const estado = await llamar(pagoCtl.consultar, { params: { codigo: pedido.codigo_pedido } });
  assert.equal(estado.body.pago_estado, 'Pagado');
  assert.equal(estado.body.checkout_url, null);
  assert.ok(ini.body.monto_a_pagar_bs > 0);
});

test('Webhook con firma inválida, timestamp viejo o secreto ajeno se rechaza y no cambia nada', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const pedido = await pedidoQr();
  await llamar(pagoCtl.iniciar, { params: { codigo: pedido.codigo_pedido } });
  const cobro = [...f.cobros.values()][0].obj;

  for (const opts of [{ secreto: 'otro-secreto' }, { ts: Math.floor(Date.now() / 1000) - 3600 }]) {
    const wh = webhookFirmado('payment.paid', { ...cobro, status: 'paid' }, opts);
    const r = await llamar(pagoCtl.webhook, { body: wh.cuerpo, headers: wh.headers });
    assert.equal(r.status, 401);
  }
  const alterado = webhookFirmado('payment.paid', { ...cobro, status: 'paid' });
  const r = await llamar(pagoCtl.webhook, { body: Buffer.from(alterado.cuerpo.toString().replace('"paid"', '"paid" ')), headers: alterado.headers });
  assert.equal(r.status, 401);
  const sin = await llamar(pagoCtl.webhook, { body: Buffer.from('{}'), headers: {} });
  assert.equal(sin.status, 401);

  const estado = await orderRepo.obtenerPorCodigo(pedido.codigo_pedido);
  assert.equal(estado.pago_estado, 'Pendiente');
});

test('Pago con monto distinto o sobre un pedido cancelado pasa a Revisión (nunca se confirma solo)', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const a = await pedidoQr();
  await llamar(pagoCtl.iniciar, { params: { codigo: a.codigo_pedido } });
  const cobroA = [...f.cobros.values()][0].obj;
  const whA = webhookFirmado('payment.paid', { ...cobroA, status: 'paid', base_amount_cents: cobroA.base_amount_cents - 100 });
  assert.equal((await llamar(pagoCtl.webhook, { body: whA.cuerpo, headers: whA.headers })).body.pago_estado, 'Revision');

  const b = await pedidoQr();
  await llamar(pagoCtl.iniciar, { params: { codigo: b.codigo_pedido } });
  const cobroB = [...f.cobros.values()][1].obj;
  await orderRepo.actualizarEstado(b.id, 'Cancelado', 'test');
  const whB = webhookFirmado('payment.paid', { ...cobroB, status: 'paid' });
  assert.equal((await llamar(pagoCtl.webhook, { body: whB.cuerpo, headers: whB.headers })).body.pago_estado, 'Revision');
});

test('Vencimiento, nuevo cobro tras vencer y un Pagado nunca se degrada', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const p = await pedidoQr();
  await llamar(pagoCtl.iniciar, { params: { codigo: p.codigo_pedido } });
  const c1 = [...f.cobros.values()][0].obj;
  const exp = webhookFirmado('payment.expired', { ...c1, status: 'expired' });
  assert.equal((await llamar(pagoCtl.webhook, { body: exp.cuerpo, headers: exp.headers })).body.pago_estado, 'Vencido');

  const r2 = await llamar(pagoCtl.iniciar, { params: { codigo: p.codigo_pedido } });
  assert.equal(r2.status, 201);
  assert.equal(f.cobros.size, 2, 'tras vencer se crea un cobro nuevo con otra clave de idempotencia');
  const c2 = [...f.cobros.values()][1].obj;

  const pagado = webhookFirmado('payment.paid', { ...c2, status: 'paid' });
  await llamar(pagoCtl.webhook, { body: pagado.cuerpo, headers: pagado.headers });
  const tarde = webhookFirmado('payment.expired', { ...c2, status: 'expired' });
  await llamar(pagoCtl.webhook, { body: tarde.cuerpo, headers: tarde.headers });
  assert.equal((await orderRepo.obtenerPorCodigo(p.codigo_pedido)).pago_estado, 'Pagado');
});

test('Consulta de estado contrasta con la pasarela (fuente de verdad) y verifica desde administración', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const p = await pedidoQr();
  await llamar(pagoCtl.iniciar, { params: { codigo: p.codigo_pedido } });
  const entrada = [...f.cobros.values()][0];
  entrada.obj = { ...entrada.obj, status: 'paid', paid_at: new Date().toISOString() };
  const r = await llamar(pagoCtl.consultar, { params: { codigo: p.codigo_pedido } });
  assert.equal(r.body.pago_estado, 'Pagado');

  const q = await pedidoQr();
  await llamar(pagoCtl.iniciar, { params: { codigo: q.codigo_pedido } });
  const e2 = [...f.cobros.values()][1];
  e2.obj = { ...e2.obj, status: 'paid' };
  const v = await llamar(admin.verificarPago, { params: { id: q.id }, usuario: { email: 'a@test.com', rol: 'Admin' } });
  assert.equal(v.body.pago_estado, 'Pagado');
});

test('Si la pasarela no responde, la consulta devuelve el último estado conocido', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const p = await pedidoQr();
  await llamar(pagoCtl.iniciar, { params: { codigo: p.codigo_pedido } });
  pasarela.__setFetch(async () => { throw new Error('red caída'); });
  const r = await llamar(pagoCtl.consultar, { params: { codigo: p.codigo_pedido } });
  assert.equal(r.status, 200);
  assert.equal(r.body.pago_estado, 'Pendiente');
});

test('Confirmación manual de pago (transferencia) y estadísticas de cobranza', async () => {
  const p = await pedidoQr({ metodo_pago: 'Transferencia' });
  const mal = await llamar(admin.confirmarPago, { params: { id: p.id }, body: { pago_estado: 'Vencido' }, usuario: { email: 'a@test.com' } });
  assert.equal(mal.status, 400);
  const ok = await llamar(admin.confirmarPago, { params: { id: p.id }, body: { pago_estado: 'Pagado' }, usuario: { email: 'a@test.com' } });
  assert.equal(ok.body.pago_estado, 'Pagado');
  assert.ok(ok.body.pagado_en);
  const st = await llamar(admin.estadisticas, { query: {}, usuario: { email: 'a@test.com' } });
  assert.ok(st.body.cobrado_bs >= p.total_bs);
  assert.ok(st.body.pedidos_pagados >= 1);
});
