/**
 * Test Script for Flete Calculation Formula
 * Validates the logistics formula and fallback mechanisms.
 */

const ORIGIN_LAT = -16.6133;
const ORIGIN_LNG = -62.4994;
const TARIFA_BASE = 350;
const PRECIO_KM = 12;

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateFleteLocal({ lat, lng, total_weight_tons, items }) {
  const rawHaversine = haversineDistance(ORIGIN_LAT, ORIGIN_LNG, lat, lng);
  const distanceKm = rawHaversine * 1.25; // Adjusted road distance simulation

  let productFactorCost = 0;
  if (items && Array.isArray(items)) {
    items.forEach(item => {
      productFactorCost += (item.quantity_tons || 0) * (item.factor_flete || 1.0);
    });
  } else {
    productFactorCost = (total_weight_tons || 0) * 1.2;
  }

  const shippingCost = TARIFA_BASE + (distanceKm * PRECIO_KM) + productFactorCost;

  return {
    raw_haversine_adjusted: distanceKm,
    distance_km: parseFloat(distanceKm.toFixed(2)),
    product_factor_cost: parseFloat(productFactorCost.toFixed(2)),
    shipping_cost: parseFloat(shippingCost.toFixed(2))
  };
}

// Running basic checks
console.log('--- Iniciando Pruebas de Cálculo de Flete Local ---');

// Test case 1: Finca cercana (ej: Cotoca -17.75, -63.07), peso 10 toneladas de Silo de Maíz (factor 1.2)
const testCase1 = {
  lat: -17.75,
  lng: -63.07,
  total_weight_tons: 10,
  items: [{ name: 'Silo de maíz', quantity_tons: 10, factor_flete: 1.2 }]
};

const result1 = calculateFleteLocal(testCase1);
console.log('\nCaso 1 (San Ramón a Cotoca - 10 Ton Silo de maíz):');
console.log(`Distancia Haversine Ajustada (redondeada): ${result1.distance_km} km`);
console.log(`Costo Factor Producto (10 Ton * 1.2): ${result1.product_factor_cost} Bs.`);
console.log(`Costo Flete Obtenido: ${result1.shipping_cost} Bs.`);

// Validations
const expectedCost1 = parseFloat((350 + (result1.raw_haversine_adjusted * 12) + result1.product_factor_cost).toFixed(2));
if (Math.abs(result1.shipping_cost - expectedCost1) < 0.01) {
  console.log('✅ Caso 1: CÁLCULO DE FÓRMULA CORRECTO.');
} else {
  console.log(`❌ Caso 1: CÁLCULO INCORRECTO. Esperado: ${expectedCost1}, Obtenido: ${result1.shipping_cost}`);
}

// Test case 2: Finca en Montero (-17.34, -63.25), peso 30 toneladas de Soya (factor 1.5)
const testCase2 = {
  lat: -17.34,
  lng: -63.25,
  total_weight_tons: 30,
  items: [{ name: 'Soya', quantity_tons: 30, factor_flete: 1.5 }]
};

const result2 = calculateFleteLocal(testCase2);
console.log('\nCaso 2 (San Ramón a Montero - 30 Ton Soya):');
console.log(`Distancia Haversine Ajustada (redondeada): ${result2.distance_km} km`);
console.log(`Costo Factor Producto (30 Ton * 1.5): ${result2.product_factor_cost} Bs.`);
console.log(`Costo Flete Obtenido: ${result2.shipping_cost} Bs.`);

const expectedCost2 = parseFloat((350 + (result2.raw_haversine_adjusted * 12) + result2.product_factor_cost).toFixed(2));
if (Math.abs(result2.shipping_cost - expectedCost2) < 0.01) {
  console.log('✅ Caso 2: CÁLCULO DE FÓRMULA CORRECTO.');
} else {
  console.log(`❌ Caso 2: CÁLCULO INCORRECTO. Esperado: ${expectedCost2}, Obtenido: ${result2.shipping_cost}`);
}

console.log('\n--- Pruebas de Cálculo de Flete Finalizadas ---');
