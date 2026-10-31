/**
 * Cobro y validación de pagos por QR (HU03 ampliada).
 *
 * Flujo: el pedido se registra (estado Pendiente, pago Pendiente) → el cliente solicita el cobro QR →
 * la pasarela devuelve el monto exacto (con "centavo libre") y el checkout → el cliente paga con el QR del banco →
 * la pasarela concilia el recibo del banco y avisa por webhook firmado → el pedido queda con pago "Pagado".
 * La consulta directa a la pasarela (GET /v1/payments/{id}) es la fuente de verdad ante cualquier duda.
 */
'use strict';

const orderRepo = require('../models/orderRepository');
const pasarela = require('./pasarelaService');
const { urlPublica } = require('../config/env');
const { ErrorNegocio } = require('../utils/errors');

const ESTADO_PASARELA = {
  pending: 'Pendiente',
  paid: 'Pagado',
  expired: 'Vencido',
  cancelled: 'Cancelado',
  late_payment: 'Revision',
};
const EVENTO_A_ESTADO = {
  'payment.paid': 'Pagado',
  'payment.expired': 'Vencido',
  'payment.cancelled': 'Cancelado',
};

const aCentavos = (bs) => Math.round(Number(bs) * 100);

/** Vista pública y mínima del pago de un pedido (no expone datos del cliente). */
function vistaPublica(p) {
  const vence = p.pago_vence_en ? new Date(p.pago_vence_en).getTime() : null;
  const segundos = p.pago_estado === 'Pendiente' && vence ? Math.max(0, Math.round((vence - Date.now()) / 1000)) : 0;
  return {
    codigo_pedido: p.codigo_pedido,
    pedido_estado: p.estado,
    pago_estado: p.pago_estado,
    total_bs: p.total_bs,
    monto_a_pagar_bs: p.pago_total_bs ?? null,
    checkout_url: p.pago_estado === 'Pendiente' ? p.pago_checkout_url || null : null,
    segundos_restantes: segundos,
    pagado_en: p.pagado_en || null,
  };
}

async function exigirPedido(codigo) {
  const p = await orderRepo.obtenerPorCodigo(codigo);
  if (!p) throw new ErrorNegocio('Pedido no encontrado.', 'PEDIDO_NO_ENCONTRADO', 404);
  return p;
}

/** Aplica el estado de pago a un pedido respetando reglas de seguridad (monto exacto, pedido cancelado). */
async function aplicarEstadoPago(pedido, nuevo, cobro) {
  let estado = nuevo;
  const campos = {};
  if (nuevo === 'Pagado') {
    const base = cobro?.base_amount_cents;
    // Un pago solo se acepta si el monto base del cobro coincide con el total del pedido
    if (base !== undefined && base !== aCentavos(pedido.total_bs)) estado = 'Revision';
    // Un pedido cancelado que recibió dinero requiere atención del administrador (posible devolución)
    else if (pedido.estado === 'Cancelado') estado = 'Revision';
    campos.pagado_en = cobro?.paid_at || new Date().toISOString();
  }
  if (pedido.pago_estado === 'Pagado' && estado !== 'Pagado') return pedido; // nunca degradar un pago confirmado
  campos.pago_estado = estado;
  return orderRepo.actualizarPago(pedido.id, campos);
}

async function iniciarPago(codigo) {
  if (!pasarela.habilitada()) {
    throw new ErrorNegocio('El pago por QR no está habilitado en este momento.', 'PAGO_QR_NO_DISPONIBLE', 503);
  }
  let p = await exigirPedido(codigo);
  if (p.metodo_pago !== 'QR') throw new ErrorNegocio('Este pedido no es de pago por QR.', 'METODO_PAGO_INVALIDO', 409);
  if (p.estado === 'Cancelado' || p.estado === 'Entregado') {
    throw new ErrorNegocio(`No se puede cobrar un pedido ${p.estado.toLowerCase()}.`, 'PEDIDO_NO_COBRABLE', 409);
  }
  if (p.pago_estado === 'Pagado') return vistaPublica(p);

  // Reutiliza el cobro vigente (evita cobros duplicados por doble clic o recarga)
  if (p.pago_estado === 'Pendiente' && p.pago_id && p.pago_vence_en && new Date(p.pago_vence_en).getTime() - Date.now() > 15000) {
    return vistaPublica(p);
  }

  const intento = (p.pago_intentos || 0) + 1;
  const cobro = await pasarela.crearCobro({
    amount_cents: aCentavos(p.total_bs),
    reference: p.codigo_pedido,
    idempotency_key: `${p.codigo_pedido}-${intento}`,
    description: `Pedido ${p.codigo_pedido} - Ensilados Santa Cruz`,
    metadata: { pedido_id: p.id },
    return_url: `${urlPublica()}/?pedido=${encodeURIComponent(p.codigo_pedido)}`,
  });
  p = await orderRepo.actualizarPago(p.id, {
    pago_estado: 'Pendiente',
    pago_id: cobro.id,
    pago_total_bs: Number(cobro.total_amount),
    pago_checkout_url: cobro.checkout_url,
    pago_vence_en: cobro.expires_at,
    pago_intentos: intento,
  });
  return vistaPublica(p);
}

/** Consulta el estado; si el cobro sigue pendiente lo contrasta con la pasarela (fuente de verdad). */
async function consultarPago(codigo, { forzar = false } = {}) {
  let p = await exigirPedido(codigo);
  if (pasarela.habilitada() && p.pago_id && (p.pago_estado === 'Pendiente' || forzar)) {
    try {
      const cobro = await pasarela.obtenerCobro(p.pago_id);
      const nuevo = ESTADO_PASARELA[cobro.status];
      if (nuevo && nuevo !== p.pago_estado) p = await aplicarEstadoPago(p, nuevo, cobro);
    } catch (e) {
      if (!(e instanceof ErrorNegocio)) throw e; // si la pasarela no responde se devuelve el último estado conocido
    }
  }
  return vistaPublica(p);
}

/** Procesa un webhook firmado de la pasarela. Idempotente por X-Pasarela-Delivery. */
async function procesarWebhook(cabeceras, cuerpoCrudo) {
  const { entrega, evento } = pasarela.verificarWebhook(cabeceras, cuerpoCrudo);
  const cobro = evento?.data;
  const nuevo = EVENTO_A_ESTADO[evento?.event];
  if (!nuevo || !cobro?.reference) return { procesado: false, motivo: 'evento_ignorado' };

  const p = await orderRepo.obtenerPorCodigo(cobro.reference);
  if (!p) return { procesado: false, motivo: 'pedido_desconocido' };
  // El cobro debe ser el último emitido para este pedido (o uno anterior que se pagó tarde)
  if (p.pago_id && cobro.id !== p.pago_id && nuevo !== 'Pagado') return { procesado: false, motivo: 'cobro_anterior' };

  const clave = entrega || `${cobro.id}:${evento.event}`;
  if (!(await orderRepo.registrarEntregaWebhook(clave, evento.event, p.id))) return { procesado: false, motivo: 'duplicado' };

  if (nuevo === 'Pagado' && p.pago_id && cobro.id !== p.pago_id) {
    await orderRepo.actualizarPago(p.id, { pago_id: cobro.id });
  }
  const actualizado = await aplicarEstadoPago(p, nuevo, cobro);
  return { procesado: true, pago_estado: actualizado.pago_estado };
}

/** Administración: contrasta con la pasarela (devuelve el pedido completo). */
async function verificarAdmin(id) {
  const p = await orderRepo.obtenerPorId(id);
  if (!p) throw new ErrorNegocio('Pedido no encontrado.', 'PEDIDO_NO_ENCONTRADO', 404);
  if (!p.pago_id) return p;
  await consultarPago(p.codigo_pedido, { forzar: true });
  return orderRepo.obtenerPorId(id);
}

/** Administración: confirma manualmente un pago (transferencia o WhatsApp verificados fuera del sistema). */
async function confirmarManual(id) {
  const p = await orderRepo.obtenerPorId(id);
  if (!p) throw new ErrorNegocio('Pedido no encontrado.', 'PEDIDO_NO_ENCONTRADO', 404);
  if (p.pago_estado === 'Pagado') return p;
  if (p.estado === 'Cancelado') throw new ErrorNegocio('El pedido está cancelado.', 'PEDIDO_NO_COBRABLE', 409);
  return orderRepo.actualizarPago(id, { pago_estado: 'Pagado', pagado_en: new Date().toISOString() });
}

module.exports = { iniciarPago, consultarPago, procesarWebhook, verificarAdmin, confirmarManual, vistaPublica };
