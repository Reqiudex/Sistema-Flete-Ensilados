/**
 * Lógica de negocio de pedidos y fletes (HU03, HU05).
 * Regla central: el servidor recalcula SIEMPRE precios, peso, flete y totales a partir del
 * catálogo y de los parámetros vigentes; nunca confía en los importes que envía el cliente.
 */
'use strict';

const productRepo = require('../models/productRepository');
const orderRepo = require('../models/orderRepository');
const parametrosRepo = require('../models/parametrosFleteRepo');
const { calcularCostoFlete, redondear } = require('../models/fleteModel');
const { obtenerDistanciaRuta } = require('./distanceService');
const v = require('../utils/validators');
const { ErrorNegocio } = require('../utils/errors');

function exigir(resultado) {
  if (!resultado.ok) throw new ErrorNegocio(resultado.error, resultado.codigo, 400);
  return resultado.value;
}

/** Valida ítems contra el catálogo y devuelve líneas con precio y factor reales. */
async function resolverItems(itemsEntrada, { exigirStock = true } = {}) {
  const items = exigir(v.validarItems(itemsEntrada));
  const productos = await productRepo.obtenerPorIds(items.map((i) => i.producto_id));
  const lineas = items.map((it) => {
    const p = productos.find((x) => x.id === it.producto_id);
    if (!p || !p.activo) {
      throw new ErrorNegocio('Uno de los productos no existe o no está disponible.', 'PRODUCTO_NO_DISPONIBLE', 409);
    }
    if (exigirStock && p.stock_tons < it.cantidad_tons) {
      throw new ErrorNegocio(
        `Stock insuficiente de ${p.nombre}: disponible ${p.stock_tons} TM.`,
        'STOCK_INSUFICIENTE',
        409
      );
    }
    return {
      producto_id: p.id,
      nombre: p.nombre,
      cantidad_tons: it.cantidad_tons,
      precio_ton_bs: p.precio_ton,
      factor_flete: p.factor_flete,
      subtotal_bs: redondear(it.cantidad_tons * p.precio_ton),
    };
  });
  return lineas;
}

async function calcularFlete({ lat, lng, items }) {
  const coord = exigir(v.validarCoordenadas(lat, lng));
  const params = await parametrosRepo.obtener();
  const lineas = await resolverItems(items, { exigirStock: false });

  const peso = lineas.reduce((a, l) => a + l.cantidad_tons, 0);
  if (peso < params.peso_minimo_tons) {
    throw new ErrorNegocio(`El pedido mínimo es de ${params.peso_minimo_tons} TM.`, 'PESO_MINIMO', 400);
  }

  const ruta = await obtenerDistanciaRuta(coord.lat, coord.lng);
  const flete = calcularCostoFlete(params, {
    destLat: coord.lat,
    destLng: coord.lng,
    distanciaKm: ruta?.distanciaKm || 0,
    fuente: ruta ? 'google' : 'haversine',
    items: lineas,
  });
  if (ruta) flete.duracion_min = ruta.duracionMin;

  const subtotal = redondear(lineas.reduce((a, l) => a + l.subtotal_bs, 0));
  return { flete, lineas, subtotal_bs: subtotal, total_bs: redondear(subtotal + flete.costo_flete_bs), parametros: params };
}

async function crearPedido(body, usuario = 'cliente') {
  const nombre = exigir(v.validarNombre(body?.cliente_nombre));
  const telefono = exigir(v.validarTelefono(body?.cliente_telefono));
  const pago = exigir(v.validarMetodoPago(body?.metodo_pago));

  const calc = await calcularFlete({ lat: body?.latitud, lng: body?.longitud, items: body?.items });

  const pedido = {
    cliente_nombre: nombre,
    cliente_telefono: telefono,
    latitud: calc.flete.destino.lat,
    longitud: calc.flete.destino.lng,
    distancia_km: calc.flete.distancia_km,
    fuente_calculo: calc.flete.fuente_calculo,
    viajes: calc.flete.viajes,
    peso_total_tons: calc.flete.peso_total_tons,
    subtotal_bs: calc.subtotal_bs,
    costo_flete_bs: calc.flete.costo_flete_bs,
    total_bs: calc.total_bs,
    metodo_pago: pago,
  };
  const items = calc.lineas.map((l) => ({
    producto_id: l.producto_id,
    cantidad_tons: l.cantidad_tons,
    precio_ton_bs: l.precio_ton_bs,
    subtotal_bs: l.subtotal_bs,
  }));

  return orderRepo.crear({ pedido, items, usuario });
}

async function cambiarEstado(id, estadoEntrada, usuario) {
  const estado = exigir(v.validarEstado(estadoEntrada));
  return orderRepo.actualizarEstado(id, estado, usuario);
}

module.exports = { calcularFlete, crearPedido, cambiarEstado, resolverItems };
