'use strict';

const express = require('express');
const { autenticar, requerirRol } = require('../middleware/auth');
const { crearLimitador } = require('../middleware/rateLimit');
const pub = require('../controllers/publicController');
const auth = require('../controllers/authController');
const admin = require('../controllers/adminController');

function crearRutas() {
  const r = express.Router();
  const limiteLogin = crearLimitador({ max: 10 });
  const limitePedidos = crearLimitador({ max: 60, ventanaMs: 60 * 60 * 1000 });
  const soloSuper = requerirRol('Superadmin');

  r.get('/health', (req, res) => res.json({ estado: 'ok', hora: new Date().toISOString() }));

  // Público
  r.get('/products', pub.productos);
  r.get('/flete-params', pub.parametros);
  r.post('/calculate-flete', pub.calcularFlete);
  r.post('/orders', limitePedidos, pub.crearPedido);

  // Autenticación
  r.post('/auth/login', limiteLogin, auth.login);
  r.post('/auth/verify-2fa', limiteLogin, auth.verificar2FA);
  r.get('/auth/me', autenticar, auth.perfil);
  r.post('/auth/2fa/setup', autenticar, auth.configurar2FA);
  r.post('/auth/2fa/enable', autenticar, auth.activar2FA);
  r.post('/auth/2fa/disable', autenticar, auth.desactivar2FA);
  r.post('/auth/change-password', autenticar, auth.cambiarPassword);

  // Administración (Admin y Superadmin)
  const a = express.Router();
  a.use(autenticar);
  a.get('/orders', admin.listarPedidos);
  a.post('/orders', admin.crearPedidoManual);
  a.get('/orders/:id', admin.obtenerPedido);
  a.patch('/orders/:id/status', admin.cambiarEstado);
  a.get('/orders/:id/history', admin.historialPedido);
  a.get('/stats', admin.estadisticas);
  a.get('/reports/orders.csv', admin.reporteCsv);
  a.get('/products', admin.listarProductos);
  a.post('/products', admin.crearProducto);
  a.put('/products/:id', admin.actualizarProducto);
  a.delete('/products/:id', soloSuper, admin.desactivarProducto);
  // Solo Superadmin
  a.put('/flete-params', soloSuper, admin.actualizarParametros);
  a.get('/users', soloSuper, admin.listarUsuarios);
  a.post('/users', soloSuper, admin.crearUsuario);
  a.patch('/users/:id', soloSuper, admin.actualizarUsuario);
  a.delete('/users/:id', soloSuper, admin.eliminarUsuario);
  r.use('/admin', a);

  return r;
}

module.exports = { crearRutas };
