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
  const estado = { fallo: null }; // { status, code, retryAfter } para simular 503/429
  let n = 0;
  const respuesta = (status, cuerpo, retry = null) => ({
    ok: status < 400, status, json: async () => cuerpo, headers: { get: (k) => (k === 'Retry-After' ? retry : null) },
  });
  const fn = async (url, opts) => {
    llamadas.push({ url, ...opts });
    const ruta = url.replace('https://apipagos.test', '');
    if (estado.fallo) return respuesta(estado.fallo.status, { error: { code: estado.fallo.code } }, estado.fallo.retryAfter || '30');
    const mc = ruta.match(/^\/v1\/payments\/([^/]+)\/cancel$/);
    if (opts.method === 'POST' && mc) {
      const c = cobros.get(mc[1]);
      if (!c) return respuesta(404, { error: { code: 'not_found' } });
      if (c.obj.status !== 'pending') return respuesta(409, { error: { code: 'conflict' } });
      c.obj = { ...c.obj, status: 'cancelled' };
      return respuesta(200, c.obj);
    }
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
  return { fn, cobros, llamadas, estado };
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

const ADMIN = { email: 'admin@test.com', rol: 'Admin' };
const ultimo = (f) => [...f.cobros.values()].at(-1).obj;
const historialPagos = async (id) => (await llamar(admin.historialPedido, { params: { id } })).body.filter((h) => h.tipo === 'pago');

test('Centavos exactos sin errores de coma flotante', () => {
  const pagoService = require('../src/services/pagoService');
  for (const [bs, c] of [[0.07, 7], [0.29, 29], [1.005, 101], [19.99, 1999], [4500.1, 450010], [123456.78, 12345678], ['50.01', 5001], [0, 0]]) {
    assert.equal(pagoService.aCentavos(bs), c, `${bs} -> ${c}`);
  }
  assert.throws(() => pagoService.aCentavos(-1));
  assert.throws(() => pagoService.aCentavos('abc'));
});

test('Al crear el pedido se crea el cobro con el monto calculado en el servidor aunque el cliente envíe otro', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const pedido = await pedidoQr({ total_bs: 1, amount_cents: 1, subtotal_bs: 1, costo_flete_bs: 0, pago_total_bs: 0.01 });
  assert.ok(pedido.total_bs > 1000, 'el total lo recalcula el servidor');
  assert.equal(f.llamadas.length, 1, 'el cobro se crea al registrar el pedido (opción A)');
  const enviado = JSON.parse(f.llamadas[0].body);
  assert.equal(enviado.amount_cents, require('../src/services/pagoService').aCentavos(pedido.total_bs));
  assert.ok(Number.isInteger(enviado.amount_cents));
  assert.equal(enviado.idempotency_key, pedido.id);
  assert.equal(enviado.reference, pedido.codigo_pedido);
  assert.match(enviado.return_url, new RegExp(`pedido=${pedido.codigo_pedido}$`));
  assert.equal(pedido.pago.pago_estado, 'Pendiente');
  assert.equal(pedido.pago.monto_a_pagar_bs, ultimo(f).total_amount_cents / 100);
  assert.ok(pedido.pago.checkout_url);
  assert.equal(pedido.pago_id, ultimo(f).id);
});

test('Si la pasarela responde 503 o 429 el pedido igual se crea como Pendiente de pago y se puede reintentar', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  f.estado.fallo = { status: 503, code: 'gateway_degraded' };
  const pedido = await pedidoQr();
  assert.equal(pedido.estado, 'Pendiente');
  assert.equal(pedido.pago_estado, 'Pendiente');
  assert.equal(pedido.pago.error.codigo, 'PAGO_QR_NO_DISPONIBLE');
  assert.equal(pedido.pago.tiene_cobro, false);
  const r503 = await llamar(pagoCtl.iniciar, { params: { codigo: pedido.codigo_pedido } });
  assert.equal(r503.status, 503);

  f.estado.fallo = { status: 429, code: 'no_free_cents' };
  const r429 = await llamar(pagoCtl.iniciar, { params: { codigo: pedido.codigo_pedido } });
  assert.equal(r429.status, 429);
  assert.equal(r429.body.codigo, 'PAGO_QR_OCUPADO');

  f.estado.fallo = null; // la pasarela se recupera: "Reintentar pago"
  const ok = await llamar(pagoCtl.iniciar, { params: { codigo: pedido.codigo_pedido } });
  assert.equal(ok.status, 201);
  assert.ok(ok.body.checkout_url);
  assert.equal(JSON.parse(f.llamadas.at(-1).body).idempotency_key, pedido.id, 'el primer cobro real usa el id del pedido');
});

test('Cancelar un pedido con cobro pendiente cancela el cobro en la pasarela y repone stock', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const pedido = await pedidoQr();
  const cobro = ultimo(f);
  const r = await llamar(admin.cambiarEstado, { params: { id: pedido.id }, body: { estado: 'Cancelado' }, usuario: ADMIN });
  assert.equal(r.body.estado, 'Cancelado');
  assert.equal(r.body.pago_estado, 'Cancelado');
  assert.ok(f.llamadas.some((l) => l.method === 'POST' && l.url.endsWith(`/v1/payments/${cobro.id}/cancel`)));
  assert.equal(f.cobros.get(cobro.id).obj.status, 'cancelled');
  // el webhook payment.cancelled posterior es inocuo
  const wh = webhookFirmado('payment.cancelled', { ...cobro, status: 'cancelled' });
  assert.equal((await llamar(pagoCtl.webhook, { body: wh.cuerpo, headers: wh.headers })).status, 200);
  // y si igual llegara dinero, queda en Revisión (posible devolución), nunca Pagado
  const pagado = webhookFirmado('payment.paid', { ...cobro, status: 'paid' });
  assert.equal((await llamar(pagoCtl.webhook, { body: pagado.cuerpo, headers: pagado.headers })).body.pago_estado, 'Revision');
});

test('Pago tardío de un cobro vencido (aprobado a mano) se acepta y cancela el cobro nuevo pendiente', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const p = await pedidoQr();
  const c1 = ultimo(f);
  const exp = webhookFirmado('payment.expired', { ...c1, status: 'expired' });
  await llamar(pagoCtl.webhook, { body: exp.cuerpo, headers: exp.headers });
  await llamar(pagoCtl.iniciar, { params: { codigo: p.codigo_pedido } });
  const c2 = ultimo(f);
  assert.notEqual(c1.id, c2.id);
  assert.equal(JSON.parse(f.llamadas.at(-1).body).idempotency_key, `${p.id}-2`);

  const tarde = webhookFirmado('payment.paid', { ...c1, status: 'paid', paid_at: new Date().toISOString() });
  const r = await llamar(pagoCtl.webhook, { body: tarde.cuerpo, headers: tarde.headers });
  assert.equal(r.body.pago_estado, 'Pagado');
  const final = await orderRepo.obtenerPorId(p.id);
  assert.equal(final.pago_id, c1.id);
  assert.equal(f.cobros.get(c2.id).obj.status, 'cancelled', 'no se debe cobrar dos veces');
});

test('Webhook real por HTTP en /api/pagos/webhook: cuerpo crudo, firma e idempotencia', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const p = await pedidoQr();
  const cobro = ultimo(f);
  const { crearApp } = require('../src/app');
  const servidor = crearApp().listen(0);
  await new Promise((ok) => servidor.once('listening', ok));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const fetchReal = globalThis.fetch;
  try {
    const wh = webhookFirmado('payment.paid', { ...cobro, status: 'paid' }, { entrega: 'http-1' });
    const enviar = (cuerpo, headers) => fetchReal(`${base}/api/pagos/webhook`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: cuerpo,
    });
    const r1 = await enviar(wh.cuerpo, wh.headers);
    assert.equal(r1.status, 200);
    assert.equal((await r1.json()).pago_estado, 'Pagado');
    const r2 = await enviar(wh.cuerpo, wh.headers);
    assert.equal((await r2.json()).motivo, 'duplicado');
    const malo = await enviar(wh.cuerpo, { ...wh.headers, 'x-pasarela-signature': '00'.repeat(32) });
    assert.equal(malo.status, 401);
    const compat = await enviar(wh.cuerpo, { ...wh.headers, 'x-pasarela-delivery': 'http-2' });
    assert.equal(compat.status, 200);
    const viejo = await fetchReal(`${base}/api/webhooks/pasarela`, { method: 'POST', headers: wh.headers, body: wh.cuerpo });
    assert.equal(viejo.status, 200, 'la ruta anterior sigue funcionando');
  } finally {
    servidor.close();
  }
  const pagos = (await historialPagos(p.id)).filter((h) => h.estado_nuevo === 'Pagado');
  assert.equal(pagos.length, 1, 'las entregas repetidas no duplican el historial');
});

test('Marcar pagado en efectivo exige nota, cancela el cobro pendiente y queda en el historial', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const p = await pedidoQr();
  const cobro = ultimo(f);
  const sinNota = await llamar(admin.confirmarPago, { params: { id: p.id }, body: { pago_estado: 'Pagado en efectivo' }, usuario: ADMIN });
  assert.equal(sinNota.status, 400);
  assert.equal(sinNota.body.codigo, 'NOTA_OBLIGATORIA');
  const mal = await llamar(admin.confirmarPago, { params: { id: p.id }, body: { pago_estado: 'Vencido', nota: 'xxx' }, usuario: ADMIN });
  assert.equal(mal.status, 400);

  const ok = await llamar(admin.confirmarPago, {
    params: { id: p.id }, body: { pago_estado: 'Pagado en efectivo', nota: 'Recibido en planta por Juan, recibo 0042' }, usuario: ADMIN,
  });
  assert.equal(ok.body.pago_estado, 'Pagado en efectivo');
  assert.ok(ok.body.pagado_en);
  assert.equal(f.cobros.get(cobro.id).obj.status, 'cancelled');
  const h = await historialPagos(p.id);
  const linea = h.find((x) => x.estado_nuevo === 'Pagado en efectivo');
  assert.equal(linea.usuario, ADMIN.email);
  assert.match(linea.nota, /recibo 0042/);
  // un webhook de vencimiento posterior no degrada el pago
  const exp = webhookFirmado('payment.expired', { ...cobro, status: 'expired' });
  await llamar(pagoCtl.webhook, { body: exp.cuerpo, headers: exp.headers });
  assert.equal((await orderRepo.obtenerPorId(p.id)).pago_estado, 'Pagado en efectivo');
  assert.equal((await llamar(pagoCtl.iniciar, { params: { codigo: p.codigo_pedido } })).body.pago_estado, 'Pagado en efectivo');
});

test('Confirmación manual de transferencia (con nota) y estadísticas/reporte de cobranza', async () => {
  const antes = (await llamar(admin.estadisticas, { query: {}, usuario: ADMIN })).body; // incluye pedidos de demostración
  const p = await pedidoQr({ metodo_pago: 'Transferencia' });
  const ok = await llamar(admin.confirmarPago, { params: { id: p.id }, body: { pago_estado: 'Pagado', nota: 'Transferencia BNB verificada' }, usuario: ADMIN });
  assert.equal(ok.body.pago_estado, 'Pagado');
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const q = await pedidoQr();
  const st = await llamar(admin.estadisticas, { query: {}, usuario: ADMIN });
  const d = (k) => Math.round((st.body[k] - antes[k]) * 100) / 100;
  assert.equal(d('pedidos_pagados'), 1);
  assert.equal(d('cobrado_bs'), p.total_bs);
  assert.equal(d('pedidos_por_cobrar'), 1);
  assert.equal(d('por_cobrar_bs'), q.total_bs);
  assert.equal(st.body.por_estado_pago.Pagado.pedidos, (antes.por_estado_pago.Pagado?.pedidos || 0) + 1);

  const filtrado = await llamar(admin.listarPedidos, { query: { pago_estado: 'Pendiente' }, usuario: ADMIN });
  assert.ok(filtrado.body.some((x) => x.id === q.id));
  assert.ok(filtrado.body.every((x) => x.pago_estado === 'Pendiente'));
  assert.equal((await llamar(admin.listarPedidos, { query: { pago_estado: 'Inventado' }, usuario: ADMIN })).status, 400);

  const csv = await llamar(admin.reporteCobranzaCsv, { query: {}, usuario: ADMIN });
  assert.match(csv.headers['Content-Type'], /text\/csv/);
  assert.match(csv.body, /Pendiente de pago;\d+;/);
  assert.match(csv.body, /Total pagado/);
  const pedidosCsv = await llamar(admin.reporteCsv, { query: {}, usuario: ADMIN });
  assert.match(pedidosCsv.body, /Monto QR exacto/);
});

test('Regenerar cobro desde administración cancela el anterior y crea uno nuevo', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const p = await pedidoQr();
  const c1 = ultimo(f);
  const r = await llamar(admin.regenerarCobro, { params: { id: p.id }, usuario: ADMIN });
  assert.equal(r.status, 200);
  const c2 = ultimo(f);
  assert.notEqual(c1.id, c2.id);
  assert.equal(r.body.pago_id, c2.id);
  assert.equal(f.cobros.get(c1.id).obj.status, 'cancelled');
  // el vencimiento del cobro reemplazado no afecta al pedido
  const exp = webhookFirmado('payment.expired', { ...c1, status: 'expired' });
  assert.equal((await llamar(pagoCtl.webhook, { body: exp.cuerpo, headers: exp.headers })).body.motivo, 'cobro_anterior');
  assert.equal((await orderRepo.obtenerPorId(p.id)).pago_estado, 'Pendiente');
});

test('Respaldo por consulta: los cobros pendientes se actualizan aunque no llegue el webhook', async () => {
  const pagoService = require('../src/services/pagoService');
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  const a = await pedidoQr();
  const ca = [...f.cobros.values()].at(-1);
  const b = await pedidoQr();
  const cb = [...f.cobros.values()].at(-1);
  ca.obj = { ...ca.obj, status: 'paid', paid_at: new Date().toISOString() };
  cb.obj = { ...cb.obj, status: 'expired' };
  const r = await pagoService.reconciliarPendientes();
  assert.equal(r.revisados, 2);
  assert.equal(r.actualizados, 2);
  assert.equal((await orderRepo.obtenerPorId(a.id)).pago_estado, 'Pagado');
  assert.equal((await orderRepo.obtenerPorId(b.id)).pago_estado, 'Vencido');
  assert.equal((await historialPagos(a.id)).at(-1).usuario, 'consulta');
});

test('PAGOS_QR_HABILITADO=false desactiva el cobro aunque haya credenciales; PASARELA_API_URL es la variable principal', async () => {
  const f = pasarelaFalsa(); pasarela.__setFetch(f.fn);
  process.env.PAGOS_QR_HABILITADO = 'false';
  try {
    assert.equal(pasarela.habilitada(), false);
    const p = await pedidoQr();
    assert.equal(p.pago, null);
    assert.equal(f.llamadas.length, 0);
    assert.equal((await llamar(pub.parametros)).body.pagos_qr, false);
  } finally {
    delete process.env.PAGOS_QR_HABILITADO;
  }
  delete process.env.PASARELA_BASE_URL;
  process.env.PASARELA_API_URL = 'https://apipagos.test/';
  try {
    assert.equal(pasarela.habilitada(), true);
    await pedidoQr();
    assert.ok(f.llamadas[0].url.startsWith('https://apipagos.test/v1/payments'));
  } finally {
    delete process.env.PASARELA_API_URL;
  }
});

test('Integración por HTTP con la pasarela simulada: firma real, nonce, centavo único, checkout y webhook firmado', async () => {
  const { crearApp } = require('../src/app');
  const api = crearApp().listen(0);
  await new Promise((ok) => api.once('listening', ok));
  process.env.SIM_SECRET = 'sk_integracion';
  process.env.SIM_API_KEY = 'pk_integracion';
  process.env.SIM_WEBHOOK_URL = `http://127.0.0.1:${api.address().port}/api/pagos/webhook`;
  delete require.cache[require.resolve('../scripts/pasarela-simulada')];
  const { servidor: sim } = require('../scripts/pasarela-simulada');
  sim.listen(0);
  await new Promise((ok) => sim.once('listening', ok));
  const simUrl = `http://127.0.0.1:${sim.address().port}`;
  process.env.PASARELA_BASE_URL = simUrl;
  process.env.PASARELA_API_KEY = 'pk_integracion';
  process.env.PASARELA_SECRET = 'sk_integracion';
  pasarela.__setFetch(null); // fetch real
  try {
    const st = await pasarela.estadoPasarela();
    assert.equal(st.accepting_payments, true, 'la firma de la petición es aceptada por el simulador');

    const a = await pedidoQr();
    const b = await pedidoQr();
    assert.equal(a.pago.pago_estado, 'Pendiente');
    assert.notEqual(a.pago.monto_a_pagar_bs, b.pago.monto_a_pagar_bs, 'mismo monto base → centavo distinto');
    assert.equal(Math.round(a.pago.monto_a_pagar_bs * 100) - require('../src/services/pagoService').aCentavos(a.total_bs), 1);

    const pagina = await (await fetch(simUrl + new URL(a.pago.checkout_url).pathname)).text();
    assert.match(pagina, new RegExp(`Bs ${a.pago.monto_a_pagar_bs.toFixed(2)}`));

    const cobroId = (await orderRepo.obtenerPorId(a.id)).pago_id;
    const r = await fetch(`${simUrl}/simular/pagar/${cobroId}`, { method: 'POST', redirect: 'manual' });
    assert.equal(r.status, 303);
    assert.equal((await orderRepo.obtenerPorId(a.id)).pago_estado, 'Pagado', 'el webhook firmado llegó y se aplicó');

    // cancelar el otro pedido anula su cobro en el simulador
    await llamar(admin.cambiarEstado, { params: { id: b.id }, body: { estado: 'Cancelado' }, usuario: ADMIN });
    const cobroB = await pasarela.obtenerCobro((await orderRepo.obtenerPorId(b.id)).pago_id);
    assert.equal(cobroB.status, 'cancelled');

    // credenciales incorrectas → 401 del simulador → error controlado
    process.env.PASARELA_SECRET = 'sk_otro';
    await assert.rejects(pasarela.estadoPasarela(), (e) => e.status === 502 || e.codigo === 'PAGO_QR_ERROR');
  } finally {
    sim.close();
    api.close();
    for (const k of ['SIM_SECRET', 'SIM_API_KEY', 'SIM_WEBHOOK_URL']) delete process.env[k];
  }
});
