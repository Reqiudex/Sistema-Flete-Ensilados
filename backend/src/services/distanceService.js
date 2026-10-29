/**
 * Distancia de ruta con Google Maps Distance Matrix (API legada) – HU05.
 * Devuelve null si no hay clave, hay error de red o la respuesta no es válida;
 * el llamador aplica entonces la contingencia Haversine × factor rural.
 * Usa fetch nativo (Node ≥ 18): no requiere dependencias adicionales.
 */
'use strict';

const { googleMapsKey } = require('../config/env');
const { ORIGEN } = require('../models/fleteModel');

const URL_BASE = 'https://maps.googleapis.com/maps/api/distancematrix/json';
let consultar = defaultConsultar;

async function defaultConsultar(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function obtenerDistanciaRuta(destLat, destLng) {
  const key = googleMapsKey();
  if (!key) return null;
  try {
    const params = new URLSearchParams({
      origins: `${ORIGEN.lat},${ORIGEN.lng}`,
      destinations: `${destLat},${destLng}`,
      mode: 'driving',
      language: 'es',
      units: 'metric',
      key,
    });
    const data = await consultar(`${URL_BASE}?${params}`);
    const el = data?.rows?.[0]?.elements?.[0];
    if (data?.status !== 'OK' || el?.status !== 'OK') {
      console.warn(`[Google Maps] Respuesta no válida (API: ${data?.status}, elemento: ${el?.status}). Se usa Haversine.`);
      return null;
    }
    return { distanciaKm: el.distance.value / 1000, duracionMin: Math.round(el.duration.value / 60) };
  } catch (e) {
    console.warn('[Google Maps] Error de consulta, se usa Haversine:', e.message);
    return null;
  }
}

/** Solo para pruebas: sustituye la consulta HTTP. */
function __setConsulta(fn) {
  consultar = fn || defaultConsultar;
}

module.exports = { obtenerDistanciaRuta, __setConsulta };
