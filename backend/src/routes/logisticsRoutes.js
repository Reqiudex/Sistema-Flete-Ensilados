/**
 * Rutas públicas de logística
 * No requieren autenticación (acceso de clientes anónimos)
 * HU03: Registro de pedidos sin login
 * HU05: Cálculo de flete
 */
const express          = require('express');
const router           = express.Router();
const logisticsController = require('../controllers/logisticsController');
const ordersController    = require('../controllers/ordersController');

// HU05 – Cálculo de flete desde San Ramón hasta el punto de entrega
router.post('/calculate-flete', logisticsController.calcularFlete);

// HU03 – Registro público de pedido anónimo (sin login)
router.post('/orders', ordersController.crearPedido);

module.exports = router;
