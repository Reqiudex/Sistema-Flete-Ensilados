/**
 * Rutas del Panel Administrativo
 * Todas requieren autenticación JWT (HU06)
 * HU07: CRUD de productos
 * HU08: Gestión de pedidos y estados de despacho
 * HU09: Reportes financieros
 */
const express        = require('express');
const router         = express.Router();
const adminController  = require('../controllers/adminController');
const ordersController = require('../controllers/ordersController');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

// Todas las rutas del panel requieren autenticación JWT
router.use(authenticateToken);

// ─── Reportes financieros (HU09) ─────────────────────────────
// Admin y Superadmin pueden ver estadísticas
router.get('/stats', adminController.getFinancialStats);

// ─── Gestión de pedidos (HU08) ────────────────────────────────
// Listar todos los pedidos con filtros opcionales por estado y fecha
router.get('/orders', ordersController.listarPedidos);

// Actualizar el estado de despacho de un pedido
router.patch('/orders/:id/estado', ordersController.actualizarEstadoPedido);

// ─── Gestión de usuarios administrativos (HU06) ──────────────
// Solo Superadmin puede crear o eliminar otros administradores
router.get('/users', requireRole('Superadmin'), adminController.getAllAdmins);
router.post('/users', requireRole('Superadmin'), adminController.createAdmin);
router.put('/users/:id', adminController.updateAdmin);  // control de rol en el controller
router.delete('/users/:id', requireRole('Superadmin'), adminController.deleteAdmin);

module.exports = router;
