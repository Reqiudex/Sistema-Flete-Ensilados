'use strict';
require('./helpers/entorno');
const test = require('node:test');
const assert = require('node:assert/strict');
const m = require('../src/models/fleteModel');

const P = m.PARAMETROS_POR_DEFECTO;

test('Haversine: distancia nula entre el mismo punto y simetría', () => {
  assert.equal(m.calcularDistanciaHaversine(-17.78, -63.18, -17.78, -63.18), 0);
  const ab = m.calcularDistanciaHaversine(-17.78, -63.18, -16.6133, -62.4994);
  const ba = m.calcularDistanciaHaversine(-16.6133, -62.4994, -17.78, -63.18);
  assert.ok(Math.abs(ab - ba) < 1e-9);
  assert.ok(ab > 140 && ab < 170, `Santa Cruz–San Ramón ≈ 150 km, obtuvo ${ab}`);
});

test('Flete con Google: 1 viaje, 10 TM a 100 km', () => {
  const r = m.calcularCostoFlete(P, {
    destLat: -17.5, destLng: -63, distanciaKm: 100, fuente: 'google',
    items: [{ cantidad_tons: 10, factor_flete: 1.2 }],
  });
  // viaje = 350 + 100×12 = 1550 ; factor = 10×1,2 = 12
  assert.equal(r.viajes, 1);
  assert.equal(r.costo_viaje_bs, 1550);
  assert.equal(r.costo_factor_bs, 12);
  assert.equal(r.costo_flete_bs, 1562);
  assert.equal(r.fuente_calculo, 'google');
});

test('Más de 30 TM requiere más viajes (ceil)', () => {
  const r = m.calcularCostoFlete(P, {
    destLat: -17.5, destLng: -63, distanciaKm: 50, fuente: 'google',
    items: [{ cantidad_tons: 61, factor_flete: 1 }],
  });
  assert.equal(r.viajes, 3);
  assert.equal(r.costo_transporte_bs, 3 * (350 + 50 * 12));
});

test('Contingencia: sin distancia de Google usa Haversine × 1,25', () => {
  const r = m.calcularCostoFlete(P, { destLat: -17.78, destLng: -63.18, fuente: 'google', distanciaKm: 0, items: [{ cantidad_tons: 1, factor_flete: 1 }] });
  const lineal = m.calcularDistanciaHaversine(m.ORIGEN.lat, m.ORIGEN.lng, -17.78, -63.18);
  assert.equal(r.fuente_calculo, 'haversine');
  assert.equal(r.distancia_km, m.redondear(lineal * 1.25));
});

test('Parámetros personalizados cambian el resultado', () => {
  const r = m.calcularCostoFlete({ ...P, tarifa_base_bs: 0, precio_km_bs: 10, capacidad_vehiculo_tons: 10 }, {
    destLat: 0, destLng: 0, distanciaKm: 20, fuente: 'google', items: [{ cantidad_tons: 25, factor_flete: 1 }],
  });
  assert.equal(r.viajes, 3);
  assert.equal(r.costo_flete_bs, 3 * 200 + 25);
});

test('Financieros: 60 % mercadería y 70 % del flete', () => {
  const f = m.calcularFinancieros({ subtotal_bs: 1000, costo_flete_bs: 200, total_bs: 1200 });
  assert.equal(f.costo_mercaderia_bs, 600);
  assert.equal(f.costo_logistico_bs, 140);
  assert.equal(f.ganancia_neta_bs, 460);
});
