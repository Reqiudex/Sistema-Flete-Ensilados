const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

// All admin routes require authentication
router.use(authenticateToken);

// Financial stats: both Admin and Superadmin can view
router.get('/stats', adminController.getFinancialStats);

// User CRUD: only Superadmin can create/delete others, but any admin can update self
router.get('/users', requireRole('Superadmin'), adminController.getAllAdmins);
router.post('/users', requireRole('Superadmin'), adminController.createAdmin);
router.put('/users/:id', adminController.updateAdmin);       // role check in controller
router.delete('/users/:id', requireRole('Superadmin'), adminController.deleteAdmin);

module.exports = router;
