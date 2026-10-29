/**
 * Repositorio de pedidos (tablas pedidos, detalle_pedido, historial_pedidos) – HU03 y HU08.
 *
 * Con Supabase, la creación y el cambio de estado se ejecutan mediante funciones SQL
 * (crear_pedido, actualizar_estado_pedido) que garantizan atomicidad: el pedido, su detalle,
 * el descuento de stock y el historial se confirman juntos o no se confirma nada.
 * Sin Supabase se usa memoria con la misma lógica (demostración y pruebas).
 *
 * Forma de un pedido (API):
 *   { id, codigo_pedido, cliente_nombre, cliente_telefono, latitud, longitud, distancia_km,
 *     fuente_calculo, viajes, peso_total_tons, subtotal_bs, costo_flete_bs, total_bs,
 *     costo_mercaderia_bs, costo_logistico_bs, ganancia_neta_bs, metodo_pago, estado,
 *     creado_en, actualizado_en,
 *     detalle_pedido: [{ id, producto_id, cantidad_tons, precio_ton_bs, subtotal_bs, producto:{id,nombre} }] }
 */
'use strict';

const crypto = require('crypto');
const { getSupabase } = require('../config/supabaseClient');
const { permitirUsuariosDemo } = require('../config/env');
const productRepo = require('./productRepository');
const parametrosRepo = require('./parametrosFleteRepo');
const { calcularFinancieros, PARAMETROS_POR_DEFECTO } = require('./fleteModel');
const { transicionPermitida } = require('../utils/validators');
const { ErrorNegocio } = require('../utils/errors');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SELECT_PEDIDO = `
  *,
  detalle_pedido (
    id, producto_id, cantidad_tons, precio_ton_bs, subtotal_bs,
    producto:producto_id ( id, nombre )
  )
`;

const CAMPOS_NUMERICOS = [
  'latitud', 'longitud', 'distancia_km', 'peso_total_tons', 'subtotal_bs', 'costo_flete_bs',
  'total_bs', 'costo_mercaderia_bs', 'costo_logistico_bs', 'ganancia_neta_bs', 'viajes',
];

function normalizar(fila) {
  if (!fila) return null;
  const pedido = { ...fila };
  for (const campo of CAMPOS_NUMERICOS) {
    if (pedido[campo] !== undefined && pedido[campo] !== null) pedido[campo] = Number(pedido[campo]);
  }
  pedido.detalle_pedido = (pedido.detalle_pedido || []).map((d) => ({
    ...d,
    cantidad_tons: Number(d.cantidad_tons),
    precio_ton_bs: Number(d.precio_ton_bs),
    subtotal_bs: Number(d.subtotal_bs),
  }));
  return pedido;
}

/* --------------------------- Rango de fechas (zona horaria de Bolivia, UTC-4) --------------------------- */

function rangoFechas(desde, hasta) {
  const rango = {};
  if (desde) rango.desde = new Date(`${desde}T00:00:00-04:00`).toISOString();
  if (hasta) rango.hasta = new Date(`${hasta}T23:59:59.999-04:00`).toISOString();
  return rango;
}

/* ------------------------------------------- Memoria ------------------------------------------- */

let memoria = [];
let historialMemoria = [];
let contador = 1000;
let sembrado = false;

function sembrarDemo() {
  if (sembrado) return;
  sembrado = true;
  if (!permitirUsuariosDemo()) return;

  const base = [
    { cliente: 'Ganadería El Trébol', tel: '78911223', lat: -17.75, lng: -63.07, km: 140, tons: 15, prod: ['prod-silo-maiz', 'Silo de Maíz', 450], flete: 2150, estado: 'Entregado', fecha: '2026-05-12T14:30:00Z', pago: 'Transferencia' },
    { cliente: 'Agrícola Los Girasoles', tel: '76543210', lat: -17.34, lng: -63.25, km: 120, tons: 25, prod: ['prod-soya', 'Soya', 1800], flete: 2420, estado: 'Entregado', fecha: '2026-05-24T09:15:00Z', pago: 'QR' },
    { cliente: 'Estancia La Esperanza', tel: '72109876', lat: -16.9, lng: -62.6, km: 40, tons: 40, prod: ['prod-sorgo', 'Sorgo', 350], flete: 1100, estado: 'En Camino', fecha: '2026-06-02T11:00:00Z', pago: 'WhatsApp' },
    { cliente: 'Hacienda El Prado', tel: '67854321', lat: -17.55, lng: -62.85, km: 110, tons: 12, prod: ['prod-silo-maiz', 'Silo de Maíz', 450], flete: 1800, estado: 'Pendiente', fecha: '2026-06-07T16:45:00Z', pago: 'Transferencia' },
  ];

  for (const d of base) {
    const subtotal = Math.round(d.tons * d.prod[2] * 100) / 100;
    const total = subtotal + d.flete;
    memoria.push({
      id: crypto.randomUUID(),
      codigo_pedido: `ESC-${contador++}`,
      cliente_nombre: d.cliente,
      cliente_telefono: d.tel,
      latitud: d.lat,
      longitud: d.lng,
      distancia_km: d.km,
      fuente_calculo: 'haversine',
      viajes: Math.ceil(d.tons / PARAMETROS_POR_DEFECTO.capacidad_vehiculo_tons),
      peso_total_tons: d.tons,
      subtotal_bs: subtotal,
      costo_flete_bs: d.flete,
      total_bs: total,
      ...calcularFinancieros({ subtotal_bs: subtotal, costo_flete_bs: d.flete, total_bs: total }),
      metodo_pago: d.pago,
      estado: d.estado,
      creado_en: d.fecha,
      actualizado_en: d.fecha,
      detalle_pedido: [
        {
          id: crypto.randomUUID(),
          producto_id: d.prod[0],
          cantidad_tons: d.tons,
          precio_ton_bs: d.prod[2],
          subtotal_bs: subtotal,
          producto: { id: d.prod[0], nombre: d.prod[1] },
        },
      ],
    });
  }
}

/* ------------------------------------------- API pública ------------------------------------------- */

/**
 * @param {object} args
 * @param {object} args.pedido  Campos del pedido ya calculados por el servicio (sin id ni código)
 * @param {Array}  args.items   [{ producto_id, cantidad_tons, precio_ton_bs, subtotal_bs }]
 * @param {string} [args.usuario] Quién registra el pedido ('cliente' o correo del administrador)
 */
async function crear({ pedido, items, usuario = 'cliente' }) {
  const db = getSupabase();

  if (db) {
    const { data: id, error } = await db.rpc('crear_pedido', {
      p_pedido: { ...pedido, usuario },
      p_items: items,
    });
    if (error) {
      const msg = error.message || '';
      if (msg.includes('STOCK_INSUFICIENTE')) {
        throw new ErrorNegocio(msg.replace(/^.*STOCK_INSUFICIENTE:\s*/, 'Stock insuficiente: '), 'STOCK_INSUFICIENTE', 409);
      }
      if (msg.includes('PRODUCTO_NO_DISPONIBLE')) {
        throw new ErrorNegocio('Uno de los productos ya no está disponible.', 'PRODUCTO_NO_DISPONIBLE', 409);
      }
      console.error('[Pedido] Error en crear_pedido:', msg);
      throw new ErrorNegocio('No se pudo registrar el pedido. Intente nuevamente.', 'ERROR_BASE_DATOS', 500);
    }
    return obtenerPorId(id);
  }

  sembrarDemo();
  productRepo.descontarStockMemoria(items);
  const productos = await productRepo.obtenerPorIds(items.map((i) => i.producto_id));
  const ahora = new Date().toISOString();
  const registro = {
    id: crypto.randomUUID(),
    codigo_pedido: `ESC-${contador++}`,
    ...pedido,
    ...calcularFinancieros(pedido, await parametrosRepo.obtener()),
    estado: 'Pendiente',
    creado_en: ahora,
    actualizado_en: ahora,
    detalle_pedido: items.map((i) => ({
      id: crypto.randomUUID(),
      producto_id: i.producto_id,
      cantidad_tons: i.cantidad_tons,
      precio_ton_bs: i.precio_ton_bs,
      subtotal_bs: i.subtotal_bs,
      producto: { id: i.producto_id, nombre: productos.find((p) => p.id === i.producto_id)?.nombre || 'Producto' },
    })),
  };
  memoria.unshift(registro);
  historialMemoria.push({ pedido_id: registro.id, estado_anterior: null, estado_nuevo: 'Pendiente', usuario, creado_en: ahora });
  return JSON.parse(JSON.stringify(registro));
}

async function listar({ estado, desde, hasta } = {}) {
  const db = getSupabase();
  const rango = rangoFechas(desde, hasta);

  if (db) {
    let consulta = db.from('pedidos').select(SELECT_PEDIDO).order('creado_en', { ascending: false });
    if (estado) consulta = consulta.eq('estado', estado);
    if (rango.desde) consulta = consulta.gte('creado_en', rango.desde);
    if (rango.hasta) consulta = consulta.lte('creado_en', rango.hasta);
    const { data, error } = await consulta;
    if (error) {
      console.error('[Pedidos] Error al listar:', error.message);
      throw new ErrorNegocio('Error al obtener los pedidos.', 'ERROR_CONSULTA', 500);
    }
    return (data || []).map(normalizar);
  }

  sembrarDemo();
  return memoria
    .filter((p) => (!estado || p.estado === estado))
    .filter((p) => (!rango.desde || p.creado_en >= rango.desde))
    .filter((p) => (!rango.hasta || p.creado_en <= rango.hasta))
    .sort((a, b) => (a.creado_en < b.creado_en ? 1 : -1))
    .map((p) => JSON.parse(JSON.stringify(p)));
}

async function obtenerPorId(id) {
  const db = getSupabase();
  if (db) {
    if (!UUID.test(String(id))) return null;
    const { data, error } = await db.from('pedidos').select(SELECT_PEDIDO).eq('id', id).maybeSingle();
    if (error) throw new ErrorNegocio('No se pudo consultar el pedido.', 'ERROR_CONSULTA', 500);
    return normalizar(data);
  }
  sembrarDemo();
  const p = memoria.find((x) => x.id === id);
  return p ? JSON.parse(JSON.stringify(p)) : null;
}

async function actualizarEstado(id, estado, usuario = 'sistema') {
  const db = getSupabase();

  if (db) {
    if (!UUID.test(String(id))) throw new ErrorNegocio('Pedido no encontrado.', 'PEDIDO_NO_ENCONTRADO', 404);
    const { error } = await db.rpc('actualizar_estado_pedido', { p_id: id, p_estado: estado, p_usuario: usuario });
    if (error) {
      const msg = error.message || '';
      if (msg.includes('PEDIDO_NO_ENCONTRADO')) throw new ErrorNegocio('Pedido no encontrado.', 'PEDIDO_NO_ENCONTRADO', 404);
      if (msg.includes('TRANSICION_INVALIDA')) throw new ErrorNegocio('Transición de estado no permitida.', 'TRANSICION_INVALIDA', 409);
      console.error('[Pedido] Error en actualizar_estado_pedido:', msg);
      throw new ErrorNegocio('Error al actualizar el estado del pedido.', 'ERROR_ACTUALIZACION', 500);
    }
    return obtenerPorId(id);
  }

  sembrarDemo();
  const pedido = memoria.find((p) => p.id === id);
  if (!pedido) throw new ErrorNegocio('Pedido no encontrado.', 'PEDIDO_NO_ENCONTRADO', 404);
  if (pedido.estado === estado) return JSON.parse(JSON.stringify(pedido));
  if (!transicionPermitida(pedido.estado, estado)) {
    throw new ErrorNegocio(`No se puede pasar de "${pedido.estado}" a "${estado}".`, 'TRANSICION_INVALIDA', 409);
  }
  if (estado === 'Cancelado') {
    productRepo.restaurarStockMemoria(pedido.detalle_pedido.map((d) => ({ producto_id: d.producto_id, cantidad_tons: d.cantidad_tons })));
  }
  const ahora = new Date().toISOString();
  historialMemoria.push({ pedido_id: id, estado_anterior: pedido.estado, estado_nuevo: estado, usuario, creado_en: ahora });
  pedido.estado = estado;
  pedido.actualizado_en = ahora;
  return JSON.parse(JSON.stringify(pedido));
}

async function historial(id) {
  const db = getSupabase();
  if (db) {
    if (!UUID.test(String(id))) return [];
    const { data, error } = await db.from('historial_pedidos').select('*').eq('pedido_id', id).order('creado_en');
    if (error) throw new ErrorNegocio('No se pudo consultar el historial.', 'ERROR_CONSULTA', 500);
    return data || [];
  }
  return historialMemoria.filter((h) => h.pedido_id === id).map((h) => ({ ...h }));
}

function _reset() {
  memoria = [];
  historialMemoria = [];
  contador = 1000;
  sembrado = false;
}

module.exports = { crear, listar, obtenerPorId, actualizarEstado, historial, rangoFechas, _reset };
