/** Endpoints públicos: catálogo, parámetros de flete, cálculo y registro de pedidos. */
'use strict';

const productRepo = require('../models/productRepository');
const parametrosRepo = require('../models/parametrosFleteRepo');
const { ORIGEN } = require('../models/fleteModel');
const orderService = require('../services/orderService');
const { responderError } = require('../utils/errors');

async function productos(req, res) {
  try {
    res.json(await productRepo.listarActivos());
  } catch (e) {
    responderError(res, e, 'productos');
  }
}

async function parametros(req, res) {
  try {
    res.json({ origen: ORIGEN, ...(await parametrosRepo.obtener()) });
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
    res.status(201).json(pedido);
  } catch (e) {
    responderError(res, e, 'crearPedido');
  }
}

module.exports = { productos, parametros, calcularFlete, crearPedido };
