/** Indicadores del panel administrativo (HU09), calculados a partir de los pedidos. */
'use strict';

const orderRepo = require('../models/orderRepository');
const { redondear } = require('../models/fleteModel');
const { PAGO_CONFIRMADO } = orderRepo;

async function resumen({ desde, hasta } = {}) {
  const pedidos = await orderRepo.listar({ desde, hasta });
  const validos = pedidos.filter((p) => p.estado !== 'Cancelado');

  const pagados = validos.filter((p) => PAGO_CONFIRMADO.includes(p.pago_estado));
  const porCobrar = validos.filter((p) => !PAGO_CONFIRMADO.includes(p.pago_estado));
  const porEstadoPago = {};
  for (const p of validos) {
    const e = p.pago_estado || 'Pendiente';
    const d = porEstadoPago[e] || { pedidos: 0, monto_bs: 0 };
    d.pedidos += 1;
    d.monto_bs = redondear(d.monto_bs + (Number(p.total_bs) || 0));
    porEstadoPago[e] = d;
  }
  const suma = (campo) => redondear(validos.reduce((a, p) => a + (Number(p[campo]) || 0), 0));
  const porEstado = {};
  for (const p of pedidos) porEstado[p.estado] = (porEstado[p.estado] || 0) + 1;

  const porProducto = {};
  for (const p of validos) {
    for (const d of p.detalle_pedido || []) {
      const nombre = d.producto?.nombre || 'Producto';
      porProducto[nombre] = redondear((porProducto[nombre] || 0) + d.cantidad_tons);
    }
  }

  return {
    total_pedidos: pedidos.length,
    pedidos_validos: validos.length,
    por_estado: porEstado,
    ingresos_bs: suma('total_bs'),
    subtotal_bs: suma('subtotal_bs'),
    fletes_bs: suma('costo_flete_bs'),
    toneladas: suma('peso_total_tons'),
    costo_mercaderia_bs: suma('costo_mercaderia_bs'),
    costo_logistico_bs: suma('costo_logistico_bs'),
    ganancia_neta_bs: suma('ganancia_neta_bs'),
    toneladas_por_producto: porProducto,
    pedidos_pagados: pagados.length,
    cobrado_bs: redondear(pagados.reduce((a, p) => a + (Number(p.total_bs) || 0), 0)),
    pagados_efectivo: pagados.filter((p) => p.pago_estado === 'Pagado en efectivo').length,
    pedidos_por_cobrar: porCobrar.length,
    por_cobrar_bs: redondear(porCobrar.reduce((a, p) => a + (Number(p.total_bs) || 0), 0)),
    por_estado_pago: porEstadoPago,
    pagos_por_revisar: pedidos.filter((p) => p.pago_estado === 'Revision').length,
  };
}

module.exports = { resumen };
