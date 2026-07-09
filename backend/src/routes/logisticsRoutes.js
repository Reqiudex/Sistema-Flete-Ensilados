const express = require('express');
const router = express.Router();
const logisticsController = require('../controllers/logisticsController');

router.post('/calculate-flete', logisticsController.getFleteEstimation);

module.exports = router;
