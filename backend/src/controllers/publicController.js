/** Endpoints públicos: catálogo, parámetros de flete, cálculo y registro de pedidos. */
'use strict';

const productRepo = require('../models/productRepository');
const parametrosRepo = require('../models/parametrosFleteRepo');
const { ORIGEN } = require('../models/fleteModel');
const orderService = require('../services/orderService');
const { responderError } = require('../utils/errors');
const pasarela = require('../services/pasarelaService');
const pagoService = require('../services/pagoService');
const orderRepo = require('../models/orderRepository');

async function productos(req, res) {
  try {
    res.json(await productRepo.listarActivos());
  } catch (e) {
    responderError(res, e, 'productos');
  }
}

async function parametros(req, res) {
  try {
    res.json({ origen: ORIGEN, ...(await parametrosRepo.obtener()), pagos_qr: pasarela.habilitada() });
  } catch (e) {
    responderError(res, e, 'parametros');
  }
}

async function calcularFlete(req, res) {
  try {
    const r = await orderService.calcularFlete({ lat: req.body?.lat, lng: req.body?.lng, items: req.body?.items });
    res.json({ ...r.flete, subtotal_bs: r.subtotal_bs, total_bs: r.total_bs });
  } catch (e) {
    responderError(res, e, 'calcularFlete');
  }
}

async function crearPedido(req, res) {
  try {
    const pedido = await orderService.crearPedido(req.body, 'cliente');
    // Opción A: el cobro QR se crea en el servidor justo después de registrar el pedido.
    // Si la pasarela falla, el pedido queda igual "Pendiente de pago" y `pago.error` lo indica.
    const pago = await pagoService.cobroInicial(pedido);
    const actual = pago && !pago.error ? await orderRepo.obtenerPorId(pedido.id) : pedido;
    res.status(201).json({ ...actual, pago });
  } catch (e) {
    responderError(res, e, 'crearPedido');
  }
}

module.exports = { productos, parametros, calcularFlete, crearPedido };
