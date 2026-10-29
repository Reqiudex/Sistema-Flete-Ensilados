/**
 * Modelo de cálculo de fletes – Ensilados Santa Cruz (HU05)
 *
 * Funciones puras (sin acceso a red ni a base de datos).
 *
 * Algoritmo:
 *   viajes          = ceil(peso_total / capacidad_vehiculo)          (mínimo 1)
 *   costo_viaje     = tarifa_base + distancia_km × precio_km
 *   costo_transporte = viajes × costo_viaje
 *   costo_factor    = Σ (toneladas_i × factor_flete_i)               (ajuste por tipo de producto)
 *   FLETE           = costo_transporte + costo_factor
 *
 * La distancia proviene de Google Maps (Distance Matrix) o, como contingencia,
 * de la fórmula de Haversine × factor de corrección rural.
 */
'use strict';

/** Origen fijo: planta de San Ramón, Santa Cruz, Bolivia. */
const ORIGEN = Object.freeze({
  nombre: 'Planta Ensilados Santa Cruz – San Ramón',
  lat: -16.6133,
  lng: -62.4994,
});

/** Parámetros por defecto (modificables por el Superadmin en la tabla parametros_flete). */
const PARAMETROS_POR_DEFECTO = Object.freeze({
  tarifa_base_bs: 350,
  precio_km_bs: 12,
  factor_correccion_rural: 1.25,
  capacidad_vehiculo_tons: 30,
  peso_minimo_tons: 0.5,
  pct_costo_mercaderia: 0.6,
  pct_costo_logistico: 0.7,
});

const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Distancia en línea recta (círculo máximo) entre dos coordenadas, en km. */
function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // radio medio de la Tierra (km)
  const aRad = (g) => (g * Math.PI) / 180;
  const dLat = aRad(lat2 - lat1);
  const dLon = aRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Σ (toneladas × factor_flete). El factor por defecto es 1.0. */
function calcularFactorProducto(items = []) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, item) => {
    const toneladas = parseFloat(item.cantidad_tons) || 0;
    const factor = parseFloat(item.factor_flete);
    return acc + toneladas * (Number.isFinite(factor) && factor > 0 ? factor : 1);
  }, 0);
}

function calcularPesoTotal(items = []) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((acc, item) => acc + (parseFloat(item.cantidad_tons) || 0), 0);
}

/**
 * @param {object} p                       Parámetros tarifarios (ver PARAMETROS_POR_DEFECTO)
 * @param {object} entrada
 * @param {number} entrada.destLat
 * @param {number} entrada.destLng
 * @param {number} [entrada.distanciaKm]   Distancia de ruta (Google). Si es 0/nula se usa Haversine.
 * @param {string} [entrada.fuente]        'google' | 'haversine'
 * @param {Array}  [entrada.items]         [{ cantidad_tons, factor_flete }]
 */
function calcularCostoFlete(p, { destLat, destLng, distanciaKm = 0, fuente = 'haversine', items = [] }) {
  const params = { ...PARAMETROS_POR_DEFECTO, ...(p || {}) };

  let distancia = parseFloat(distanciaKm);
  let fuenteFinal = fuente;
  if (fuente !== 'google' || !Number.isFinite(distancia) || distancia <= 0) {
    const lineal = calcularDistanciaHaversine(ORIGEN.lat, ORIGEN.lng, parseFloat(destLat), parseFloat(destLng));
    distancia = lineal * params.factor_correccion_rural;
    fuenteFinal = 'haversine';
  }

  const pesoTotal = calcularPesoTotal(items);
  const viajes = pesoTotal > 0 ? Math.max(1, Math.ceil(pesoTotal / params.capacidad_vehiculo_tons)) : 1;

  const costoViaje = params.tarifa_base_bs + distancia * params.precio_km_bs;
  const costoTransporte = viajes * costoViaje;
  const costoFactor = calcularFactorProducto(items);
  const costoFlete = costoTransporte + costoFactor;

  return {
    origen: { ...ORIGEN },
    destino: {
      lat: parseFloat(parseFloat(destLat).toFixed(7)),
      lng: parseFloat(parseFloat(destLng).toFixed(7)),
    },
    distancia_km: redondear(distancia),
    fuente_calculo: fuenteFinal,
    peso_total_tons: redondear(pesoTotal),
    viajes,
    capacidad_vehiculo_tons: params.capacidad_vehiculo_tons,
    tarifa_base_bs: params.tarifa_base_bs,
    precio_km_bs: params.precio_km_bs,
    costo_viaje_bs: redondear(costoViaje),
    costo_transporte_bs: redondear(costoTransporte),
    costo_factor_bs: redondear(costoFactor),
    costo_flete_bs: redondear(costoFlete),
  };
}

/**
 * Indicadores financieros estimados de un pedido (HU09).
 * Debe coincidir con el trigger fn_calcular_financieros de la base de datos.
 */
function calcularFinancieros({ subtotal_bs, costo_flete_bs, total_bs }, p = {}) {
  const params = { ...PARAMETROS_POR_DEFECTO, ...p };
  const costoMercaderia = redondear(subtotal_bs * params.pct_costo_mercaderia);
  const costoLogistico = redondear(costo_flete_bs * params.pct_costo_logistico);
  return {
    costo_mercaderia_bs: costoMercaderia,
    costo_logistico_bs: costoLogistico,
    ganancia_neta_bs: redondear(total_bs - costoMercaderia - costoLogistico),
  };
}

module.exports = {
  ORIGEN,
  PARAMETROS_POR_DEFECTO,
  redondear,
  calcularDistanciaHaversine,
  calcularFactorProducto,
  calcularPesoTotal,
  calcularCostoFlete,
  calcularFinancieros,
};
