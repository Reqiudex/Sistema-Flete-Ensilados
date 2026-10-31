/** Operaciones administrativas: pedidos, productos, usuarios, parámetros, estadísticas y reportes. */
'use strict';

const bcrypt = require('bcryptjs');
const orderRepo = require('../models/orderRepository');
const productRepo = require('../models/productRepository');
const userRepo = require('../models/userRepository');
const parametrosRepo = require('../models/parametrosFleteRepo');
const orderService = require('../services/orderService');
const pagoService = require('../services/pagoService');
const statsService = require('../services/statsService');
const { pedidosACsv } = require('../utils/csv');
const v = require('../utils/validators');
const { responderError, ErrorNegocio } = require('../utils/errors');
const { COSTO_BCRYPT } = require('./authController');

const exigir = (r) => {
  if (!r.ok) throw new ErrorNegocio(r.error, r.codigo, 400);
  return r.value;
};
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
function filtros(q) {
  const f = {};
  if (q.estado) f.estado = exigir(v.validarEstado(q.estado));
  if (q.desde) {
    if (!FECHA.test(q.desde)) throw new ErrorNegocio('Fecha "desde" inválida (AAAA-MM-DD).', 'FECHA_INVALIDA', 400);
    f.desde = q.desde;
  }
  if (q.hasta) {
    if (!FECHA.test(q.hasta)) throw new ErrorNegocio('Fecha "hasta" inválida (AAAA-MM-DD).', 'FECHA_INVALIDA', 400);
    f.hasta = q.hasta;
  }
  return f;
}
const envolver = (nombre, fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    responderError(res, e, nombre);
  }
};

/* ---- Pedidos ---- */
const listarPedidos = envolver('listarPedidos', async (req, res) => res.json(await orderRepo.listar(filtros(req.query))));
const obtenerPedido = envolver('obtenerPedido', async (req, res) => {
  const p = await orderRepo.obtenerPorId(req.params.id);
  if (!p) throw new ErrorNegocio('Pedido no encontrado.', 'PEDIDO_NO_ENCONTRADO', 404);
  res.json(p);
});
const crearPedidoManual = envolver('crearPedidoManual', async (req, res) => {
  res.status(201).json(await orderService.crearPedido(req.body, req.usuario.email));
});
const cambiarEstado = envolver('cambiarEstado', async (req, res) =>
  res.json(await orderService.cambiarEstado(req.params.id, req.body?.estado, req.usuario.email)));
const verificarPago = envolver('verificarPago', async (req, res) => res.json(await pagoService.verificarAdmin(req.params.id)));
const confirmarPago = envolver('confirmarPago', async (req, res) => {
  if (req.body?.pago_estado !== 'Pagado') throw new ErrorNegocio('Solo se puede confirmar el pago ("Pagado").', 'PAGO_ESTADO_INVALIDO', 400);
  res.json(await pagoService.confirmarManual(req.params.id));
});
const historialPedido = envolver('historialPedido', async (req, res) => res.json(await orderRepo.historial(req.params.id)));
const estadisticas = envolver('estadisticas', async (req, res) => {
  const f = filtros(req.query);
  res.json(await statsService.resumen({ desde: f.desde, hasta: f.hasta }));
});
const reporteCsv = envolver('reporteCsv', async (req, res) => {
  const pedidos = await orderRepo.listar(filtros(req.query));
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="pedidos-${new Date().toISOString().slice(0, 10)}.csv"`,
  });
  res.send(pedidosACsv(pedidos));
});

/* ---- Productos ---- */
const listarProductos = envolver('listarProductos', async (req, res) => res.json(await productRepo.listarTodos()));
const crearProducto = envolver('crearProducto', async (req, res) =>
  res.status(201).json(await productRepo.crear(exigir(v.validarProducto(req.body)))));
const actualizarProducto = envolver('actualizarProducto', async (req, res) => {
  const p = await productRepo.actualizar(req.params.id, exigir(v.validarProducto(req.body, { parcial: true })));
  if (!p) throw new ErrorNegocio('Producto no encontrado.', 'PRODUCTO_NO_ENCONTRADO', 404);
  res.json(p);
});
const desactivarProducto = envolver('desactivarProducto', async (req, res) => {
  const p = await productRepo.desactivar(req.params.id);
  if (!p) throw new ErrorNegocio('Producto no encontrado.', 'PRODUCTO_NO_ENCONTRADO', 404);
  res.json(p);
});

/* ---- Parámetros de flete (Superadmin) ---- */
const actualizarParametros = envolver('actualizarParametros', async (req, res) =>
  res.json(await parametrosRepo.actualizar(exigir(v.validarParametrosFlete(req.body)))));

/* ---- Usuarios (Superadmin) ---- */
const listarUsuarios = envolver('listarUsuarios', async (req, res) => res.json(await userRepo.listar()));
const crearUsuario = envolver('crearUsuario', async (req, res) => {
  const email = exigir(v.validarEmail(req.body?.email));
  const password = exigir(v.validarPassword(req.body?.password));
  const rol = exigir(v.validarRol(req.body?.rol));
  const u = await userRepo.crear({ email, password_hash: await bcrypt.hash(password, COSTO_BCRYPT), rol });
  res.status(201).json(userRepo.publico(u));
});
const actualizarUsuario = envolver('actualizarUsuario', async (req, res) => {
  const objetivo = await userRepo.buscarPorId(req.params.id);
  if (!objetivo) throw new ErrorNegocio('Usuario no encontrado.', 'USUARIO_NO_ENCONTRADO', 404);
  const cambios = {};
  if (req.body?.rol !== undefined) {
    cambios.rol = exigir(v.validarRol(req.body.rol));
    if (objetivo.rol === 'Superadmin' && cambios.rol !== 'Superadmin' && (await userRepo.contarSuperadmins()) <= 1) {
      throw new ErrorNegocio('Debe existir al menos un Superadmin.', 'ULTIMO_SUPERADMIN', 409);
    }
  }
  if (req.body?.password !== undefined) {
    cambios.password_hash = await bcrypt.hash(exigir(v.validarPassword(req.body.password)), COSTO_BCRYPT);
  }
  if (Object.keys(cambios).length === 0) throw new ErrorNegocio('No hay cambios que aplicar.', 'SIN_CAMBIOS', 400);
  res.json(userRepo.publico(await userRepo.actualizar(objetivo.id, cambios)));
});
const eliminarUsuario = envolver('eliminarUsuario', async (req, res) => {
  const objetivo = await userRepo.buscarPorId(req.params.id);
  if (!objetivo) throw new ErrorNegocio('Usuario no encontrado.', 'USUARIO_NO_ENCONTRADO', 404);
  if (objetivo.id === req.usuario.id) throw new ErrorNegocio('No puede eliminar su propia cuenta.', 'AUTOELIMINACION', 409);
  if (objetivo.rol === 'Superadmin' && (await userRepo.contarSuperadmins()) <= 1) {
    throw new ErrorNegocio('Debe existir al menos un Superadmin.', 'ULTIMO_SUPERADMIN', 409);
  }
  await userRepo.eliminar(objetivo.id);
  res.json({ mensaje: 'Usuario eliminado.' });
});

module.exports = {
  listarPedidos, obtenerPedido, crearPedidoManual, cambiarEstado, historialPedido, verificarPago, confirmarPago, estadisticas, reporteCsv,
  listarProductos, crearProducto, actualizarProducto, desactivarProducto,
  actualizarParametros, listarUsuarios, crearUsuario, actualizarUsuario, eliminarUsuario,
};
