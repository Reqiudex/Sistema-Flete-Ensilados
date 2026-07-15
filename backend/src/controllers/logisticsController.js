/**
 * ============================================================
 * CONTROLADOR: logisticsController.js
 * Sistema de Cálculo de Fletes – Ensilados Santa Cruz
 * ============================================================
 * HU05: Algoritmo de cálculo automático de flete considerando
 *       distancia calculada de Google Maps API y peso en TM.
 *
 * ENDPOINTS EXPUESTOS:
 *   POST /api/calculate-flete
 *     → Recibe coordenadas + ítems → Devuelve costo de flete
 *
 * FLUJO DE CÁLCULO:
 *   1. Recibe lat, lng del punto de entrega del cliente
 *   2. Intenta consultar Google Maps Distance Matrix API
 *      (requiere GOOGLE_MAPS_API_KEY en .env)
 *   3. Si Google Maps falla o no está configurado,
 *      usa la fórmula de Haversine con factor de corrección rural
 *   4. Aplica el algoritmo de tarifa y devuelve el desglose completo
 * ============================================================
 */

'use strict';

const axios      = require('axios');
const fleteModel = require('../models/fleteModel');

// URL de la Distance Matrix API de Google Maps
const GOOGLE_DISTANCE_MATRIX_URL =
  'https://maps.googleapis.com/maps/api/distancematrix/json';

/**
 * Consulta la Google Maps Distance Matrix API para obtener
 * la distancia de ruta terrestre real entre San Ramón y el destino.
 *
 * @param {number} destLat - Latitud del destino
 * @param {number} destLng - Longitud del destino
 * @param {string} apiKey  - Clave de API de Google Maps
 * @returns {Promise<{distanciaKm: number, duracionMin: number} | null>}
 */
async function consultarGoogleMapsAPI(destLat, destLng, apiKey) {
  const params = new URLSearchParams({
    origins:      `${fleteModel.ORIGEN_LAT},${fleteModel.ORIGEN_LNG}`,
    destinations: `${destLat},${destLng}`,
    mode:         'driving',   // Ruta terrestre (carretera)
    language:     'es',        // Respuesta en español
    units:        'metric',    // Kilómetros
    key:          apiKey,
  });

  const url = `${GOOGLE_DISTANCE_MATRIX_URL}?${params.toString()}`;
  const response = await axios.get(url, { timeout: 8000 }); // 8 segundos de timeout

  // Validar la respuesta de la API
  const apiStatus     = response.data?.status;
  const elementStatus = response.data?.rows?.[0]?.elements?.[0]?.status;

  if (apiStatus !== 'OK' || elementStatus !== 'OK') {
    console.warn(
      `[Google Maps] Estado de respuesta inesperado. API: ${apiStatus}, Elemento: ${elementStatus}`
    );
    return null;
  }

  const elemento = response.data.rows[0].elements[0];
  return {
    distanciaKm:  elemento.distance.value / 1000,       // Convertir metros → km
    duracionMin:  Math.round(elemento.duration.value / 60), // Convertir segundos → minutos
    textoDistancia: elemento.distance.text,
    textoDuracion:  elemento.duration.text,
  };
}

/**
 * POST /api/calculate-flete
 *
 * Calcula el costo de flete desde San Ramón hasta el punto
 * de entrega indicado por el cliente.
 *
 * @param {Object} req.body
 * @param {number} req.body.lat              - Latitud del destino (obligatorio)
 * @param {number} req.body.lng              - Longitud del destino (obligatorio)
 * @param {number} [req.body.total_weight_tons] - Peso total en TM (informativo)
 * @param {Array}  [req.body.items]          - Ítems del carrito con quantity_tons y factor_flete
 *
 * @returns {Object} Resultado del cálculo del flete con desglose completo
 */
async function calcularFlete(req, res) {
  const { lat, lng, items = [] } = req.body;

  // --------------------------------------------------------
  // 1. Validación de entrada
  // --------------------------------------------------------
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    return res.status(400).json({
      error: 'Las coordenadas de destino (lat, lng) son obligatorias.',
      codigo: 'COORDENADAS_REQUERIDAS',
    });
  }

  const destLat = parseFloat(lat);
  const destLng = parseFloat(lng);

  if (isNaN(destLat) || isNaN(destLng)) {
    return res.status(400).json({
      error: 'Las coordenadas (lat, lng) deben ser números válidos.',
      codigo: 'COORDENADAS_INVALIDAS',
    });
  }

  // Validar que el destino esté dentro de un rango geográfico razonable
  // (departamento de Santa Cruz y zonas limítrofes de Bolivia)
  const LAT_MIN = -22.0, LAT_MAX = -9.0;
  const LNG_MIN = -70.0, LNG_MAX = -57.0;
  if (destLat < LAT_MIN || destLat > LAT_MAX || destLng < LNG_MIN || destLng > LNG_MAX) {
    return res.status(400).json({
      error: 'Las coordenadas están fuera del área de cobertura de entrega (Bolivia).',
      codigo: 'COORDENADAS_FUERA_DE_RANGO',
    });
  }

  // --------------------------------------------------------
  // 2. Intentar cálculo con Google Maps Distance Matrix API
  // --------------------------------------------------------
  let distanciaKm   = 0;
  let fuenteCalculo = 'haversine';
  let infoRuta      = null;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const googleConfigurado = apiKey
    && apiKey !== 'YOUR_GOOGLE_MAPS_API_KEY_HERE'
    && apiKey.trim() !== '';

  if (googleConfigurado) {
    try {
      const resultadoGoogle = await consultarGoogleMapsAPI(destLat, destLng, apiKey);

      if (resultadoGoogle) {
        distanciaKm   = resultadoGoogle.distanciaKm;
        fuenteCalculo = 'google';
        infoRuta      = {
          duracion_min:      resultadoGoogle.duracionMin,
          texto_distancia:   resultadoGoogle.textoDistancia,
          texto_duracion:    resultadoGoogle.textoDuracion,
        };
        console.log(
          `[Flete] Google Maps OK – Distancia: ${distanciaKm.toFixed(1)} km ` +
          `(${resultadoGoogle.textoDistancia})`
        );
      }
    } catch (errorGoogle) {
      // Fallo silencioso: se activa la contingencia Haversine
      console.error(
        '[Flete] Error al consultar Google Maps API. Activando contingencia Haversine:',
        errorGoogle.message
      );
    }
  } else {
    console.warn(
      '[Flete] GOOGLE_MAPS_API_KEY no configurada. Usando contingencia Haversine.'
    );
  }

  // --------------------------------------------------------
  // 3. Aplicar el algoritmo de cálculo de flete
  //    (usa Haversine automáticamente si Google falló)
  // --------------------------------------------------------
  const resultadoFlete = fleteModel.calcularCostoFlete(
    destLat,
    destLng,
    distanciaKm,
    fuenteCalculo,
    items
  );

  // --------------------------------------------------------
  // 4. Respuesta completa al frontend
  // --------------------------------------------------------
  return res.json({
    ...resultadoFlete,
    // Información adicional de ruta (solo disponible con Google Maps)
    ...(infoRuta && { info_ruta: infoRuta }),
  });
}

module.exports = {
  calcularFlete,
};
