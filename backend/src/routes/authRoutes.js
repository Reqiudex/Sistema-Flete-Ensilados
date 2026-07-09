const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');

router.post('/login', authController.login);
router.post('/verify-2fa', authController.verifyTwoFactor);
router.get('/profile', authenticateToken, authController.getProfile);
router.post('/setup-2fa', authenticateToken, authController.generateTwoFactorSetup);
router.post('/enable-2fa', authenticateToken, authController.enableTwoFactor);
router.post('/disable-2fa', authenticateToken, authController.disableTwoFactor);

module.exports = router;
