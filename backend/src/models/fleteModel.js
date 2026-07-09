/**
 * Flete Model
 * Handles logistics constants and mathematical calculations.
 */

const ORIGIN_LAT = -16.6133;
const ORIGIN_LNG = -62.4994;
const TARIFA_BASE = 350; // Bs.
const PRECIO_KM = 12; // Bs.

/**
 * Calculates straight line (Haversine) distance in km between two coordinates.
 */
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculates flete details.
 * @param {number} lat - Destination Latitude
 * @param {number} lng - Destination Longitude
 * @param {number} distanceKm - Pre-calculated road distance (from Google)
 * @param {string} source - Calculation source ('google' or 'haversine')
 * @param {Array} items - List of items in the order
 */
function calculateFleteCost(lat, lng, distanceKm = 0, source = 'haversine', items = []) {
  let finalDistance = parseFloat(distanceKm);
  
  if (source === 'haversine' || !finalDistance) {
    const rawHaversine = getHaversineDistance(ORIGIN_LAT, ORIGIN_LNG, parseFloat(lat), parseFloat(lng));
    finalDistance = rawHaversine * 1.25; // Rural road correction factor
  }

  let productFactorCost = 0;
  if (items && Array.isArray(items)) {
    items.forEach(item => {
      const itemWeight = parseFloat(item.quantity_tons) || 0;
      const itemFactor = parseFloat(item.factor_flete) || 1.0;
      productFactorCost += itemWeight * itemFactor;
    });
  }

  const shippingCost = TARIFA_BASE + (finalDistance * PRECIO_KM) + productFactorCost;

  return {
    origin: { lat: ORIGIN_LAT, lng: ORIGIN_LNG },
    destination: { lat: parseFloat(lat), lng: parseFloat(lng) },
    distance_km: parseFloat(finalDistance.toFixed(2)),
    calculation_source: source,
    tarife_base: TARIFA_BASE,
    precio_km: PRECIO_KM,
    product_factor_cost: parseFloat(productFactorCost.toFixed(2)),
    shipping_cost: parseFloat(shippingCost.toFixed(2))
  };
}

module.exports = {
  ORIGIN_LAT,
  ORIGIN_LNG,
  TARIFA_BASE,
  PRECIO_KM,
  getHaversineDistance,
  calculateFleteCost
};
