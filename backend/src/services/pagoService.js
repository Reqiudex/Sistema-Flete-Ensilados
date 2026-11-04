/**
 * Cobro y validación de pagos por QR (HU10 – Pago con QR mediante la pasarela propia).
 *
 * Flujo: el pedido se registra (RPC crear_pedido; estado logístico Pendiente, pago Pendiente) → el servidor crea
 * el cobro en la pasarela con el total recalculado en centavos → el cliente paga EXACTAMENTE `total_amount` con el
 * QR del banco → la pasarela concilia el recibo y avisa por webhook firmado → el pedido queda con pago "Pagado".
 * Si un webhook no llega, el respaldo por consulta (GET /v1/payments/{id}) actualiza los cobros pendientes.
 * El estado de pago es independiente del estado logístico (Pendiente ⇄ En Camino → Entregado / Cancelado).
 */
'use strict';

const orderRepo = require('../models/orderRepository');
const pasarela = require('./pasarelaService');
const { urlPublica, pasarelaConfig } = require('../config/env');
const { ErrorNegocio } = require('../utils/errors');

const PAGO = Object.freeze({
  PENDIENTE: 'Pendiente', // "Pendiente de pago"
  PAGADO: 'Pagado',
  EFECTIVO: 'Pagado en efectivo',
  VENCIDO: 'Vencido',
  CANCELADO: 'Cancelado',
  REVISION: 'Revision',
});
const ESTADOS_PAGO = Object.values(PAGO);
const CONFIRMADO = [PAGO.PAGADO, PAGO.EFECTIVO];

const ESTADO_PASARELA = {
  pending: PAGO.PENDIENTE,
  paid: PAGO.PAGADO,
  expired: PAGO.VENCIDO,
  cancelled: PAGO.CANCELADO,
  late_payment: PAGO.REVISION,
};
const EVENTO_A_ESTADO = {
  'payment.paid': PAGO.PAGADO,
  'payment.expired': PAGO.VENCIDO,
  'payment.cancelled': PAGO.CANCELADO,
};

/**
 * Convierte bolivianos a centavos enteros SIN aritmética de coma flotante: se trabaja con la representación
 * decimal en texto (como la devuelve PostgreSQL para NUMERIC) y se redondea a 2 decimales "mitad hacia arriba"
 * con operaciones de enteros. Ej.: "1234.565" → 123457; 0.29 → 29.
 */
function aCentavos(bs) {
  let texto = typeof bs === 'string' ? bs.trim() : Number.isFinite(bs) ? String(bs) : '';
  if (/e/i.test(texto)) texto = Number(texto).toFixed(6); // notación científica (valores extremos)
  const m = /^(\d+)(?:\.(\d*))?$/.exec(texto);
  if (!m) throw new ErrorNegocio('Importe inválido.', 'IMPORTE_INVALIDO', 400);
  const dec = (m[2] || '').padEnd(3, '0');
  const centavos = Number.parseInt(m[1], 10) * 100 + Number.parseInt(dec.slice(0, 2), 10) + (Number(dec[2]) >= 5 ? 1 : 0);
  if (!Number.isSafeInteger(centavos)) throw new ErrorNegocio('Importe inválido.', 'IMPORTE_INVALIDO', 400);
  return centavos;
}

/** Vista pública y mínima del pago de un pedido (no expone datos del cliente). */
function vistaPublica(p, extra = {}) {
  const vence = p.pago_vence_en ? new Date(p.pago_vence_en).getTime() : null;
  const pendiente = p.pago_estado === PAGO.PENDIENTE;
  const segundos = pendiente && vence ? Math.max(0, Math.round((vence - Date.now()) / 1000)) : 0;
  return {
    codigo_pedido: p.codigo_pedido,
    pedido_estado: p.estado,
    metodo_pago: p.metodo_pago,
    pago_estado: p.pago_estado,
    total_bs: p.total_bs,
    monto_a_pagar_bs: p.pago_total_bs ?? null,
    checkout_url: pendiente && segundos > 0 ? p.pago_checkout_url || null : null,
    segundos_restantes: segundos,
    vence_en: pendiente ? p.pago_vence_en || null : null,
    pagado_en: p.pagado_en || null,
    tiene_cobro: !!p.pago_id,
    ...extra,
  };
}

async function exigirPedido(codigo) {
  const p = await orderRepo.obtenerPorCodigo(codigo);
  if (!p) throw new ErrorNegocio('Pedido no encontrado.', 'PEDIDO_NO_ENCONTRADO', 404);
  return p;
}
async function exigirPedidoId(id) {
  const p = await orderRepo.obtenerPorId(id);
  if (!p) throw new ErrorNegocio('Pedido no encontrado.', 'PEDIDO_NO_ENCONTRADO', 404);
  return p;
}

/** Cancela un cobro en la pasarela sin interrumpir el flujo si ya no estaba pendiente o la pasarela no responde. */
async function cancelarCobroSilencioso(id) {
  if (!id || !pasarela.habilitada()) return false;
  try {
    await pasarela.cancelarCobro(id);
    return true;
  } catch (e) {
    if (!(e instanceof ErrorNegocio)) throw e;
    console.warn('[Pagos] No se pudo cancelar el cobro en la pasarela:', e.codigo);
    return false;
  }
}

/**
 * Determina el estado final de un pago confirmado por la pasarela aplicando las reglas de seguridad:
 * el monto base del cobro debe coincidir con el total del pedido y el pedido no debe estar cancelado.
 */
function estadoSeguro(pedido, nuevo, cobro) {
  if (nuevo !== PAGO.PAGADO) return nuevo;
  const base = cobro?.base_amount_cents;
  if (base !== undefined && base !== aCentavos(pedido.total_bs)) return PAGO.REVISION;
  if (pedido.estado === 'Cancelado') return PAGO.REVISION; // recibió dinero: posible devolución
  return PAGO.PAGADO;
}

function camposDesdeCobro(pedido, nuevo, cobro) {
  const estado = estadoSeguro(pedido, nuevo, cobro);
  const campos = { pago_estado: estado };
  if (nuevo === PAGO.PAGADO) {
    campos.pagado_en = cobro?.paid_at || new Date().toISOString();
    if (cobro?.id && cobro.id !== pedido.pago_id) campos.pago_id = cobro.id; // pago tardío de un cobro anterior
    if (cobro?.total_amount !== undefined) campos.pago_total_bs = Number(cobro.total_amount);
  }
  return campos;
}

/**
 * Crea (o reutiliza) el cobro QR de un pedido. El monto SIEMPRE sale del total guardado en la base,
 * que el servidor recalculó al registrar el pedido; nunca de datos enviados por el navegador.
 */
async function iniciarPago(codigo, { usuario = 'cliente', forzarNuevo = false } = {}) {
  if (!pasarela.habilitada()) {
    throw new ErrorNegocio('El pago por QR no está habilitado en este momento.', 'PAGO_QR_NO_DISPONIBLE', 503);
  }
  let p = await exigirPedido(codigo);
  if (p.metodo_pago !== 'QR') throw new ErrorNegocio('Este pedido no es de pago por QR.', 'METODO_PAGO_INVALIDO', 409);
  if (p.estado === 'Cancelado' || p.estado === 'Entregado') {
    throw new ErrorNegocio(`No se puede cobrar un pedido ${p.estado.toLowerCase()}.`, 'PEDIDO_NO_COBRABLE', 409);
  }
  if (CONFIRMADO.includes(p.pago_estado)) return vistaPublica(p);
  if (p.pago_estado === PAGO.REVISION) {
    throw new ErrorNegocio('El pago de este pedido está en revisión por el administrador.', 'PAGO_EN_REVISION', 409);
  }

  // Reutiliza el cobro vigente (evita cobros duplicados por doble clic o recarga)
  const vigente = p.pago_estado === PAGO.PENDIENTE && p.pago_id && p.pago_vence_en
    && new Date(p.pago_vence_en).getTime() - Date.now() > 15000;
  if (vigente && !forzarNuevo) return vistaPublica(p);
  if (vigente && forzarNuevo) await cancelarCobroSilencioso(p.pago_id);

  const intento = (p.pago_intentos || 0) + 1;
  const cobro = await pasarela.crearCobro({
    amount_cents: aCentavos(p.total_bs),
    reference: p.codigo_pedido,
    // Primer cobro: el id del pedido (un doble clic o reintento de red devuelve el mismo cobro).
    // Cobros posteriores (tras vencer o regenerar) necesitan otra clave, si no la pasarela devolvería el vencido.
    idempotency_key: intento === 1 ? p.id : `${p.id}-${intento}`,
    description: `Pedido ${p.codigo_pedido} - Ensilados Santa Cruz`,
    metadata: { pedido_id: p.id, codigo: p.codigo_pedido },
    return_url: `${urlPublica()}/?pedido=${encodeURIComponent(p.codigo_pedido)}`,
  });
  if (!cobro?.id || cobro.total_amount === undefined) {
    throw new ErrorNegocio('La pasarela devolvió una respuesta incompleta.', 'PAGO_QR_ERROR', 502);
  }
  p = await orderRepo.actualizarPago(p.id, {
    pago_estado: PAGO.PENDIENTE,
    pago_id: cobro.id,
    pago_total_bs: Number(cobro.total_amount),
    pago_checkout_url: cobro.checkout_url || null,
    pago_vence_en: cobro.expires_at || null,
    pago_intentos: intento,
  }, { usuario });
  return vistaPublica(p);
}

/**
 * Se llama justo después de registrar un pedido (opción A). Si la pasarela falla (503/429/red),
 * el pedido queda igualmente registrado como "Pendiente de pago" y el cliente puede reintentar.
 */
async function cobroInicial(pedido) {
  if (pedido?.metodo_pago !== 'QR' || !pasarela.habilitada()) return null;
  try {
    return await iniciarPago(pedido.codigo_pedido, { usuario: 'cliente' });
  } catch (e) {
    if (!(e instanceof ErrorNegocio)) throw e;
    return vistaPublica(pedido, { error: { codigo: e.codigo, mensaje: e.message } });
  }
}

/**
 * El navegador consulta cada pocos segundos; para no agotar el límite de peticiones de la pasarela, cada cobro se
 * contrasta como máximo una vez cada CONSULTA_MIN_MS (el webhook suele llegar antes).
 */
const CONSULTA_MIN_MS = 15000;
const ultimaConsulta = new Map();
function tocaConsultar(pagoId) {
  const ahora = Date.now();
  if (ahora - (ultimaConsulta.get(pagoId) || 0) < CONSULTA_MIN_MS) return false;
  ultimaConsulta.set(pagoId, ahora);
  if (ultimaConsulta.size > 5000) for (const [k, t] of ultimaConsulta) if (ahora - t > CONSULTA_MIN_MS) ultimaConsulta.delete(k);
  return true;
}

/** Consulta el estado; si el cobro sigue pendiente lo contrasta con la pasarela (fuente de verdad). */
async function consultarPago(codigo, { forzar = false } = {}) {
  let p = await exigirPedido(codigo);
  if (pasarela.habilitada() && p.pago_id && ((p.pago_estado === PAGO.PENDIENTE && tocaConsultar(p.pago_id)) || forzar)) {
    p = await contrastar(p);
  }
  return vistaPublica(p);
}

/** Contrasta un pedido con su cobro en la pasarela. Devuelve el pedido (actualizado o no). */
async function contrastar(p, usuario = 'consulta') {
  try {
    const cobro = await pasarela.obtenerCobro(p.pago_id);
    const nuevo = ESTADO_PASARELA[cobro?.status];
    if (!nuevo) return p;
    const campos = camposDesdeCobro(p, nuevo, cobro);
    if (campos.pago_estado === p.pago_estado) return p;
    return await orderRepo.actualizarPago(p.id, campos, { usuario });
  } catch (e) {
    if (!(e instanceof ErrorNegocio)) throw e; // si la pasarela no responde se devuelve el último estado conocido
    return p;
  }
}

/**
 * Procesa un webhook firmado de la pasarela.
 * Idempotente: la entrega (X-Pasarela-Delivery) se registra en la MISMA transacción que el cambio de estado,
 * así un fallo de la base no "consume" la entrega y la pasarela la reintenta.
 */
async function procesarWebhook(cabeceras, cuerpoCrudo) {
  const { entrega, evento } = pasarela.verificarWebhook(cabeceras, cuerpoCrudo);
  const cobro = evento?.data;
  const nuevo = EVENTO_A_ESTADO[evento?.event];
  if (!nuevo || !cobro?.reference || !cobro?.id) return { procesado: false, motivo: 'evento_ignorado' };

  const p = await orderRepo.obtenerPorCodigo(cobro.reference);
  if (!p) return { procesado: false, motivo: 'pedido_desconocido' };
  // Vencimientos o cancelaciones de un cobro que ya fue reemplazado no afectan al pedido.
  // Un pago (incluso tardío, aprobado a mano en la pasarela) de un cobro anterior sí se acepta.
  if (p.pago_id && cobro.id !== p.pago_id && nuevo !== PAGO.PAGADO) return { procesado: false, motivo: 'cobro_anterior' };

  const campos = camposDesdeCobro(p, nuevo, cobro);
  const r = await orderRepo.registrarPago(p.id, campos, {
    usuario: 'pasarela', entrega: entrega || `${cobro.id}:${evento.event}`, evento: evento.event,
  });
  if (r.duplicado) return { procesado: false, motivo: 'duplicado' };

  // Pago tardío de un cobro anterior: el cobro nuevo que seguía pendiente ya no debe cobrarse
  if (r.aplicado && nuevo === PAGO.PAGADO && p.pago_id && cobro.id !== p.pago_id && p.pago_estado === PAGO.PENDIENTE) {
    await cancelarCobroSilencioso(p.pago_id);
  }
  return { procesado: r.aplicado, pago_estado: r.pedido?.pago_estado };
}

/* ------------------------------------- Administración ------------------------------------- */

/** Contrasta con la pasarela y devuelve el pedido completo. */
async function verificarAdmin(id, usuario = 'admin') {
  const p = await exigirPedidoId(id);
  if (!p.pago_id || !pasarela.habilitada()) return p;
  await contrastar(p, usuario);
  return orderRepo.obtenerPorId(id);
}

/** Genera un cobro nuevo (por ejemplo, tras vencer). Cancela en la pasarela el que siguiera pendiente. */
async function regenerarCobro(id, usuario) {
  const p = await exigirPedidoId(id);
  if (CONFIRMADO.includes(p.pago_estado)) throw new ErrorNegocio('El pedido ya está pagado.', 'PAGO_YA_CONFIRMADO', 409);
  if (p.pago_estado === PAGO.REVISION) {
    throw new ErrorNegocio('Resuelva primero el pago en revisión (verifíquelo o márquelo como pagado).', 'PAGO_EN_REVISION', 409);
  }
  await iniciarPago(p.codigo_pedido, { usuario, forzarNuevo: true });
  return orderRepo.obtenerPorId(id);
}

function validarNota(nota) {
  const n = typeof nota === 'string' ? nota.trim() : '';
  if (n.length < 3 || n.length > 500) {
    throw new ErrorNegocio('Escriba una nota de 3 a 500 caracteres (quién pagó, cómo y comprobante).', 'NOTA_OBLIGATORIA', 400);
  }
  return n;
}

/**
 * Registra un pago verificado fuera de la pasarela.
 *   'Pagado en efectivo' → dinero recibido en mano.
 *   'Pagado'             → transferencia o WhatsApp verificados por el administrador.
 * La nota es obligatoria y queda en el historial de pagos junto con el usuario.
 */
async function registrarPagoManual(id, { estado = PAGO.EFECTIVO, nota, usuario }) {
  if (!CONFIRMADO.includes(estado)) {
    throw new ErrorNegocio('Solo se puede registrar "Pagado" o "Pagado en efectivo".', 'PAGO_ESTADO_INVALIDO', 400);
  }
  const texto = validarNota(nota);
  const p = await exigirPedidoId(id);
  if (CONFIRMADO.includes(p.pago_estado)) return p;
  if (p.estado === 'Cancelado') throw new ErrorNegocio('El pedido está cancelado.', 'PEDIDO_NO_COBRABLE', 409);
  if (p.pago_estado === PAGO.PENDIENTE && p.pago_id) await cancelarCobroSilencioso(p.pago_id);
  return orderRepo.actualizarPago(id, { pago_estado: estado, pagado_en: new Date().toISOString() }, { usuario, nota: texto });
}

/**
 * Se llama cuando un pedido pasa a Cancelado: cancela en la pasarela el cobro pendiente y deja el pago en
 * Cancelado. Un pago ya recibido no se toca (el administrador gestiona la devolución).
 */
async function alCancelarPedido(pedido, usuario = 'sistema') {
  if (!pedido || ![PAGO.PENDIENTE, PAGO.VENCIDO].includes(pedido.pago_estado)) return pedido;
  if (pedido.pago_estado === PAGO.PENDIENTE && pedido.pago_id) await cancelarCobroSilencioso(pedido.pago_id);
  return orderRepo.actualizarPago(pedido.id, { pago_estado: PAGO.CANCELADO, pago_checkout_url: null }, {
    usuario, nota: 'Pedido cancelado',
  });
}

/* ---------------------------- Respaldo por consulta (si no llega un webhook) ---------------------------- */

let reconciliando = false;
async function reconciliarPendientes() {
  if (reconciliando || !pasarela.habilitada()) return { revisados: 0, actualizados: 0 };
  reconciliando = true;
  let revisados = 0;
  let actualizados = 0;
  try {
    for (const resumen of await orderRepo.listarCobrosPendientes({ limite: 50 })) {
      const p = await orderRepo.obtenerPorId(resumen.id);
      if (!p || p.pago_estado !== PAGO.PENDIENTE || !p.pago_id) continue;
      revisados += 1;
      const r = await contrastar(p, 'consulta');
      if (r.pago_estado !== p.pago_estado) actualizados += 1;
    }
  } catch (e) {
    console.error('[Pagos] Error en el respaldo por consulta:', e.message);
  } finally {
    reconciliando = false;
  }
  return { revisados, actualizados };
}

let temporizador = null;
function iniciarReconciliador() {
  const cfg = pasarelaConfig();
  if (!cfg || !cfg.reconciliarSegundos || temporizador) return false;
  temporizador = setInterval(() => { reconciliarPendientes(); }, cfg.reconciliarSegundos * 1000);
  temporizador.unref?.();
  return true;
}
function _reiniciarConsultas() { ultimaConsulta.clear(); }
function detenerReconciliador() {
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
}

module.exports = {
  PAGO, ESTADOS_PAGO, aCentavos, vistaPublica,
  iniciarPago, cobroInicial, consultarPago, procesarWebhook,
  verificarAdmin, regenerarCobro, registrarPagoManual, alCancelarPedido,
  reconciliarPendientes, iniciarReconciliador, detenerReconciliador, _reiniciarConsultas,
};
