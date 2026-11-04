/**
 * Generación de CSV (HU09) compatible con Excel: separador ";" y BOM UTF-8.
 * Neutraliza fórmulas ("=", "+", "-", "@") para evitar inyección de fórmulas.
 */
'use strict';

function escapar(valor) {
  if (valor === null || valor === undefined) return '';
  let texto = String(valor);
  if (/^[=+\-@\t\r]/.test(texto) && !/^-?\d+([.,]\d+)?$/.test(texto)) texto = `'${texto}`;
  if (/[";\n\r]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

const CABECERA = [
  'Código', 'Fecha', 'Cliente', 'Teléfono', 'Productos', 'Peso (TM)', 'Distancia (km)',
  'Fuente de cálculo', 'Subtotal (Bs)', 'Flete (Bs)', 'Total (Bs)', 'Ganancia neta est. (Bs)',
  'Método de pago', 'Estado', 'Pago', 'Monto QR exacto (Bs)', 'Pagado el',
];

function pedidosACsv(pedidos = []) {
  const filas = pedidos.map((p) => [
    p.codigo_pedido,
    p.creado_en ? new Date(p.creado_en).toISOString().slice(0, 10) : '',
    p.cliente_nombre,
    p.cliente_telefono,
    (p.detalle_pedido || []).map((d) => `${d.producto?.nombre || 'Producto'} (${d.cantidad_tons} TM)`).join(' | '),
    p.peso_total_tons,
    p.distancia_km,
    p.fuente_calculo,
    p.subtotal_bs,
    p.costo_flete_bs,
    p.total_bs,
    p.ganancia_neta_bs,
    p.metodo_pago,
    p.estado,
    p.pago_estado === 'Pendiente' ? 'Pendiente de pago' : p.pago_estado,
    p.pago_total_bs ?? '',
    p.pagado_en ? new Date(p.pagado_en).toISOString().slice(0, 10) : '',
  ]);
  const lineas = [CABECERA, ...filas].map((fila) => fila.map(escapar).join(';'));
  return '﻿' + lineas.join('\r\n') + '\r\n';
}

/** Reporte de cobranza: ventas pagadas vs. pendientes agrupadas por estado de pago (HU09 + HU10). */
function cobranzaACsv(resumen) {
  const filas = [['Estado de pago', 'Pedidos', 'Monto (Bs)']];
  for (const [estado, d] of Object.entries(resumen.por_estado_pago || {})) {
    filas.push([estado === 'Pendiente' ? 'Pendiente de pago' : estado, d.pedidos, d.monto_bs]);
  }
  filas.push([]);
  filas.push(['Total pagado (QR + efectivo + manual)', resumen.pedidos_pagados, resumen.cobrado_bs]);
  filas.push(['Total pendiente de cobro', resumen.pedidos_por_cobrar, resumen.por_cobrar_bs]);
  return '\uFEFF' + filas.map((f) => f.map(escapar).join(';')).join('\r\n') + '\r\n';
}

module.exports = { pedidosACsv, cobranzaACsv, escapar };
