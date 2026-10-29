'use strict';
const { llamar, reiniciarTodo } = require('./helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const pub = require('../src/controllers/publicController');
const auth = require('../src/controllers/authController');
const admin = require('../src/controllers/adminController');
const { autenticar, requerirRol } = require('../src/middleware/auth');
const userRepo = require('../src/models/userRepository');
const productRepo = require('../src/models/productRepository');
const totp = require('../src/utils/totp');

const pedidoBase = (extra = {}) => ({
  cliente_nombre: 'Juan Pérez', cliente_telefono: '78911223', latitud: -17.78, longitud: -63.18,
  metodo_pago: 'QR', items: [{ producto_id: 'prod-silo-maiz', cantidad_tons: 10 }], ...extra,
});
async function crearAdmin(rol = 'Admin', email = `${rol.toLowerCase()}@test.com`) {
  return userRepo.crear({ email, password_hash: await bcrypt.hash('Clave12345', 10), rol });
}

test.beforeEach(() => reiniciarTodo());

test('Catálogo y parámetros públicos', async () => {
  const p = await llamar(pub.productos);
  assert.equal(p.body.length, 3);
  const f = await llamar(pub.parametros);
  assert.equal(f.body.tarifa_base_bs, 350);
  assert.equal(f.body.capacidad_vehiculo_tons, 30);
});

test('Cálculo de flete lo hace el servidor con precios reales', async () => {
  const r = await llamar(pub.calcularFlete, { body: { lat: -17.78, lng: -63.18, items: [{ producto_id: 'prod-silo-maiz', cantidad_tons: 10 }] } });
  assert.equal(r.status, 200);
  assert.equal(r.body.subtotal_bs, 4500);
  assert.equal(r.body.fuente_calculo, 'haversine');
  assert.ok(Math.abs(r.body.total_bs - (r.body.subtotal_bs + r.body.costo_flete_bs)) < 0.01);
});

test('Peso mínimo y coordenadas inválidas se rechazan', async () => {
  const a = await llamar(pub.calcularFlete, { body: { lat: -17.78, lng: -63.18, items: [{ producto_id: 'prod-silo-maiz', cantidad_tons: 0.1 }] } });
  assert.equal(a.status, 400); assert.equal(a.body.codigo, 'PESO_MINIMO');
  const b = await llamar(pub.calcularFlete, { body: { lat: 50, lng: 10, items: [{ producto_id: 'prod-silo-maiz', cantidad_tons: 1 }] } });
  assert.equal(b.status, 400);
});

test('Pedido: ignora importes del cliente, descuenta stock y registra historial', async () => {
  const antes = (await productRepo.obtenerPorId('prod-silo-maiz')).stock_tons;
  const r = await llamar(pub.crearPedido, { body: pedidoBase({ total_bs: 1, costo_flete_bs: 1 }) });
  assert.equal(r.status, 201);
  assert.match(r.body.codigo_pedido, /^ESC-\d+$/);
  assert.equal(r.body.estado, 'Pendiente');
  assert.equal(r.body.subtotal_bs, 4500);
  assert.ok(r.body.total_bs > 4500);
  assert.equal((await productRepo.obtenerPorId('prod-silo-maiz')).stock_tons, antes - 10);
  const h = await llamar(admin.historialPedido, { params: { id: r.body.id } });
  assert.equal(h.body.length, 1);
});

test('Pedido con stock insuficiente → 409 y sin cambios', async () => {
  await productRepo.actualizar('prod-soya', { stock_tons: 5 });
  const r = await llamar(pub.crearPedido, { body: pedidoBase({ items: [{ producto_id: 'prod-soya', cantidad_tons: 10 }] }) });
  assert.equal(r.status, 409); assert.equal(r.body.codigo, 'STOCK_INSUFICIENTE');
  assert.equal((await productRepo.obtenerPorId('prod-soya')).stock_tons, 5);
});

test('Pedido: valida teléfono y nombre', async () => {
  assert.equal((await llamar(pub.crearPedido, { body: pedidoBase({ cliente_telefono: '12' }) })).status, 400);
  assert.equal((await llamar(pub.crearPedido, { body: pedidoBase({ cliente_nombre: 'A' }) })).status, 400);
});

test('Estados: transiciones válidas, cancelar restaura stock, finales inmutables', async () => {
  const admin1 = await crearAdmin();
  const ped = (await llamar(pub.crearPedido, { body: pedidoBase() })).body;
  const stockTras = (await productRepo.obtenerPorId('prod-silo-maiz')).stock_tons;

  let r = await llamar(admin.cambiarEstado, { params: { id: ped.id }, body: { estado: 'En Camino' }, usuario: admin1 });
  assert.equal(r.body.estado, 'En Camino');
  r = await llamar(admin.cambiarEstado, { params: { id: ped.id }, body: { estado: 'Cancelado' }, usuario: admin1 });
  assert.equal(r.body.estado, 'Cancelado');
  assert.equal((await productRepo.obtenerPorId('prod-silo-maiz')).stock_tons, stockTras + 10);
  r = await llamar(admin.cambiarEstado, { params: { id: ped.id }, body: { estado: 'Pendiente' }, usuario: admin1 });
  assert.equal(r.status, 409);
  r = await llamar(admin.cambiarEstado, { params: { id: ped.id }, body: { estado: 'Inventado' }, usuario: admin1 });
  assert.equal(r.status, 400);
  const h = await llamar(admin.historialPedido, { params: { id: ped.id } });
  assert.equal(h.body.length, 3);
});

test('Estadísticas excluyen cancelados; CSV se genera', async () => {
  const a = await crearAdmin();
  const ped = (await llamar(pub.crearPedido, { body: pedidoBase() })).body;
  let s = await llamar(admin.estadisticas, { query: {} });
  const base = s.body.ingresos_bs;
  await llamar(admin.cambiarEstado, { params: { id: ped.id }, body: { estado: 'Cancelado' }, usuario: a });
  s = await llamar(admin.estadisticas, { query: {} });
  assert.equal(Math.round((base - s.body.ingresos_bs) * 100) / 100, ped.total_bs);
  const csv = await llamar(admin.reporteCsv, { query: {} });
  assert.ok(String(csv.body).includes(ped.codigo_pedido));
  assert.match(csv.headers['Content-Type'], /text\/csv/);
  assert.equal((await llamar(admin.listarPedidos, { query: { desde: 'ayer' } })).status, 400);
});

test('Login: credenciales incorrectas y correctas', async () => {
  await crearAdmin();
  assert.equal((await llamar(auth.login, { body: { email: 'admin@test.com', password: 'mala' } })).status, 401);
  assert.equal((await llamar(auth.login, { body: { email: 'no@existe.com', password: 'Clave12345' } })).status, 401);
  const ok = await llamar(auth.login, { body: { email: 'ADMIN@test.com', password: 'Clave12345' } });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.token);
  assert.equal(ok.body.usuario.password_hash, undefined);
});

test('2FA real: configurar, activar, login en dos pasos', async () => {
  let u = await crearAdmin();
  const setup = await llamar(auth.configurar2FA, { usuario: u });
  assert.ok(setup.body.secreto);
  u = await userRepo.buscarPorId(u.id);
  assert.equal((await llamar(auth.activar2FA, { usuario: u, body: { codigo: '000000' } })).status, 400);
  assert.equal((await llamar(auth.activar2FA, { usuario: u, body: { codigo: totp.generarCodigo(setup.body.secreto) } })).status, 200);

  const paso1 = await llamar(auth.login, { body: { email: 'admin@test.com', password: 'Clave12345' } });
  assert.equal(paso1.body.requiere_2fa, true);
  assert.equal(paso1.body.token, undefined);
  assert.equal((await llamar(auth.verificar2FA, { body: { token_preauth: paso1.body.token_preauth, codigo: '123456' === totp.generarCodigo(setup.body.secreto) ? '654321' : '123456' } })).status, 401);
  const paso2 = await llamar(auth.verificar2FA, { body: { token_preauth: paso1.body.token_preauth, codigo: totp.generarCodigo(setup.body.secreto) } });
  assert.equal(paso2.status, 200);
  assert.ok(paso2.body.token);
});

test('Middleware: token de pre-autenticación no sirve como sesión; roles', async () => {
  const sa = await crearAdmin('Superadmin');
  const ad = await crearAdmin('Admin');
  const jwt = require('jsonwebtoken');
  const { obtenerJwtSecret } = require('../src/config/env');
  const pre = jwt.sign({ sub: sa.id, proposito: 'pre2fa' }, obtenerJwtSecret(), { expiresIn: '5m' });
  const r1 = await llamar(autenticar, { headers: { authorization: `Bearer ${pre}` } });
  assert.equal(r1.status, 401);
  assert.equal((await llamar(autenticar, {})).status, 401);

  const solo = requerirRol('Superadmin');
  assert.equal((await llamar(solo, { usuario: ad })).status, 403);
  let siguio = false;
  await solo({ usuario: sa }, {}, () => { siguio = true; });
  assert.equal(siguio, true);
});

test('Usuarios: no se elimina el último Superadmin ni la propia cuenta', async () => {
  const sa = await crearAdmin('Superadmin');
  const r1 = await llamar(admin.eliminarUsuario, { params: { id: sa.id }, usuario: sa });
  assert.equal(r1.status, 409);
  const r2 = await llamar(admin.actualizarUsuario, { params: { id: sa.id }, body: { rol: 'Admin' }, usuario: sa });
  assert.equal(r2.body.codigo, 'ULTIMO_SUPERADMIN');
  const nuevo = await llamar(admin.crearUsuario, { usuario: sa, body: { email: 'n@x.com', password: 'Clave12345', rol: 'Admin' } });
  assert.equal(nuevo.status, 201);
  assert.equal(nuevo.body.password_hash, undefined);
  assert.equal((await llamar(admin.crearUsuario, { usuario: sa, body: { email: 'n@x.com', password: 'Clave12345', rol: 'Admin' } })).status, 409);
});

test('Cambio de contraseña exige la actual', async () => {
  const u = await crearAdmin();
  assert.equal((await llamar(auth.cambiarPassword, { usuario: u, body: { password_actual: 'x', password_nueva: 'NuevaClave123' } })).status, 401);
  assert.equal((await llamar(auth.cambiarPassword, { usuario: u, body: { password_actual: 'Clave12345', password_nueva: 'corta' } })).status, 400);
  assert.equal((await llamar(auth.cambiarPassword, { usuario: u, body: { password_actual: 'Clave12345', password_nueva: 'NuevaClave123' } })).status, 200);
});

test('Productos: CRUD con validación y desactivación', async () => {
  const sa = await crearAdmin('Superadmin');
  const c = await llamar(admin.crearProducto, { usuario: sa, body: { nombre: 'Heno', descripcion: 'x', precio_ton: 500, stock_tons: 100, factor_flete: 1.1 } });
  assert.equal(c.status, 201);
  assert.equal((await llamar(admin.crearProducto, { usuario: sa, body: { nombre: 'H', precio_ton: -1 } })).status, 400);
  const u = await llamar(admin.actualizarProducto, { usuario: sa, params: { id: c.body.id }, body: { precio_ton: 520 } });
  assert.equal(u.body.precio_ton, 520);
  await llamar(admin.desactivarProducto, { usuario: sa, params: { id: c.body.id } });
  const cat = await llamar(pub.productos);
  assert.ok(!cat.body.some((p) => p.id === c.body.id));
});

test('Parámetros de flete modificables y efectivos en el cálculo', async () => {
  const sa = await crearAdmin('Superadmin');
  const antes = (await llamar(pub.calcularFlete, { body: { lat: -17.78, lng: -63.18, items: [{ producto_id: 'prod-sorgo', cantidad_tons: 5 }] } })).body;
  await llamar(admin.actualizarParametros, { usuario: sa, body: { tarifa_base_bs: 1350 } });
  const despues = (await llamar(pub.calcularFlete, { body: { lat: -17.78, lng: -63.18, items: [{ producto_id: 'prod-sorgo', cantidad_tons: 5 }] } })).body;
  assert.equal(Math.round((despues.costo_flete_bs - antes.costo_flete_bs) * 100) / 100, 1000);
  assert.equal((await llamar(admin.actualizarParametros, { usuario: sa, body: { tarifa_base_bs: -5 } })).status, 400);
});
