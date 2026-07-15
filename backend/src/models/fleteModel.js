/**
 * ============================================================
 * MÓDULO: fleteModel.js
 * Sistema de Cálculo de Fletes – Ensilados Santa Cruz
 * ============================================================
 * HU05: Algoritmo de cálculo automático de flete considerando
 *       distancia calculada de Google Maps API y peso en TM.
 *
 * LÓGICA DEL ALGORITMO:
 *   Flete = Tarifa Base + (Distancia_km × Precio_km) + Factor_Producto
 *
 * Donde:
 *   - Tarifa Base:     Costo mínimo fijo del viaje (Bs.)
 *   - Distancia_km:    Ruta terrestre real por Google Maps API,
 *                      o Haversine × 1.25 como contingencia offline.
 *   - Precio_km:       Costo variable por kilómetro recorrido (Bs./km)
 *   - Factor_Producto: Ajuste logístico por tipo y densidad de producto
 *                      Σ(cantidad_tons_i × factor_flete_i)
 *
 * ORIGEN FIJO: Planta de San Ramón, Santa Cruz, Bolivia
 *   Latitud:  -16.6133
 *   Longitud: -62.4994
 * ============================================================
 */

'use strict';

// ------------------------------------------------------------
// Parámetros geográficos del punto de origen (San Ramón)
// ------------------------------------------------------------
const ORIGEN_LAT = -16.6133;
const ORIGEN_LNG = -62.4994;

// ------------------------------------------------------------
// Parámetros tarifarios (ajustables por la empresa)
// ------------------------------------------------------------
const TARIFA_BASE_BS = 350;   // Bs. – Costo mínimo fijo por viaje
const PRECIO_KM_BS   = 12;    // Bs. – Costo adicional por kilómetro recorrido
const FACTOR_CORRECCION_RURAL = 1.25; // Ajuste Haversine → ruta real estimada

// Peso mínimo aceptable para despacho (en Toneladas Métricas)
const PESO_MINIMO_TONS = 0.5;

/**
 * Calcula la distancia en línea recta entre dos coordenadas
 * usando la fórmula de Haversine.
 *
 * @param {number} lat1 - Latitud del punto origen
 * @param {number} lon1 - Longitud del punto origen
 * @param {number} lat2 - Latitud del punto destino
 * @param {number} lon2 - Longitud del punto destino
 * @returns {number} Distancia en kilómetros (línea recta)
 */
function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio medio de la Tierra en kilómetros
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Kilómetros en línea recta
}

/**
 * Calcula el costo adicional de flete según los productos del pedido.
 * Cada producto tiene un `factor_flete` que refleja su densidad
 * y dificultad logística de transporte.
 *
 * @param {Array<{quantity_tons: number, factor_flete: number}>} items
 * @returns {number} Costo adicional por factores de producto (Bs.)
 */
function calcularFactorProducto(items = []) {
  if (!Array.isArray(items) || items.length === 0) return 0;

  return items.reduce((acumulado, item) => {
    const toneladas = parseFloat(item.quantity_tons) || 0;
    const factor    = parseFloat(item.factor_flete)  || 1.0;
    return acumulado + (toneladas * factor);
  }, 0);
}

/**
 * FUNCIÓN PRINCIPAL – Calcula el costo completo del flete.
 *
 * Recibe la distancia (obtenida por Google Maps o calculada por
 * Haversine) y devuelve el desglose completo del costo logístico.
 *
 * @param {number} destLat         - Latitud del punto de entrega del cliente
 * @param {number} destLng         - Longitud del punto de entrega del cliente
 * @param {number} distanciaKm     - Distancia en km (0 si no fue calculada aún)
 * @param {string} fuenteCalculo   - 'google' | 'haversine'
 * @param {Array}  items           - Ítems del carrito con quantity_tons y factor_flete
 *
 * @returns {Object} Resultado completo del cálculo del flete
 */
function calcularCostoFlete(
  destLat,
  destLng,
  distanciaKm   = 0,
  fuenteCalculo = 'haversine',
  items         = []
) {
  // 1. Determinar distancia final a usar
  let distanciaFinal = parseFloat(distanciaKm);

  if (fuenteCalculo === 'haversine' || !distanciaFinal || distanciaFinal <= 0) {
    // Contingencia: Haversine con factor de corrección para rutas rurales
    const distanciaLineal = calcularDistanciaHaversine(
      ORIGEN_LAT, ORIGEN_LNG,
      parseFloat(destLat), parseFloat(destLng)
    );
    distanciaFinal = distanciaLineal * FACTOR_CORRECCION_RURAL;
    fuenteCalculo  = 'haversine';
  }

  // 2. Calcular el factor adicional de producto
  const costoFactor = calcularFactorProducto(items);

  // 3. Aplicar la fórmula principal del algoritmo de flete
  //    Flete = Tarifa_Base + (Distancia × Precio_km) + Factor_Producto
  const costoFlete = TARIFA_BASE_BS + (distanciaFinal * PRECIO_KM_BS) + costoFactor;

  // 4. Retornar el resultado completo con desglose para transparencia
  return {
    // Puntos geográficos involucrados
    origen: {
      nombre: 'Planta Ensilados Santa Cruz – San Ramón',
      lat: ORIGEN_LAT,
      lng: ORIGEN_LNG
    },
    destino: {
      lat: parseFloat(parseFloat(destLat).toFixed(7)),
      lng: parseFloat(parseFloat(destLng).toFixed(7))
    },

    // Resultado del cálculo de distancia
    distancia_km:     parseFloat(distanciaFinal.toFixed(2)),
    fuente_calculo:   fuenteCalculo,  // 'google' | 'haversine'

    // Desglose tarifario (para mostrar al cliente y para la tesis)
    tarifa_base_bs:   TARIFA_BASE_BS,
    precio_km_bs:     PRECIO_KM_BS,
    costo_factor_bs:  parseFloat(costoFactor.toFixed(2)),

    // Resultado final
    costo_flete_bs:   parseFloat(costoFlete.toFixed(2)),
  };
}

// Exportar constantes y funciones del módulo
module.exports = {
  ORIGEN_LAT,
  ORIGEN_LNG,
  TARIFA_BASE_BS,
  PRECIO_KM_BS,
  PESO_MINIMO_TONS,
  calcularDistanciaHaversine,
  calcularFactorProducto,
  calcularCostoFlete,
};
