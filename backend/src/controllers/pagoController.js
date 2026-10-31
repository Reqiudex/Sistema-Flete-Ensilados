/** Endpoints de pago: cobro QR del cliente y webhook de la pasarela. */
'use strict';

const pagoService = require('../services/pagoService');
const { responderError } = require('../utils/errors');

async function iniciar(req, res) {
  try {
    res.status(201).json(await pagoService.iniciarPago(req.params.codigo));
  } catch (e) {
    responderError(res, e, 'iniciarPago');
  }
}

async function consultar(req, res) {
  try {
    res.json(await pagoService.consultarPago(req.params.codigo));
  } catch (e) {
    responderError(res, e, 'consultarPago');
  }
}

/** El cuerpo llega SIN parsear (Buffer) para poder verificar la firma sobre los bytes exactos. */
async function webhook(req, res) {
  try {
    const crudo = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {}));
    const r = await pagoService.procesarWebhook(req.headers, crudo);
    res.status(200).json({ recibido: true, ...r });
  } catch (e) {
    responderError(res, e, 'webhookPasarela');
  }
}

module.exports = { iniciar, consultar, webhook };
