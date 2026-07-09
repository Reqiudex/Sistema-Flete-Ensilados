const axios = require('axios');
const fleteModel = require('../models/fleteModel');

/**
 * Endpoint controller: calculates flete based on coordinates and items.
 */
async function getFleteEstimation(req, res) {
  const { lat, lng, total_weight_tons, items } = req.body;

  if (lat === undefined || lng === undefined) {
    return res.status(400).json({ error: 'Las coordenadas (lat, lng) son requeridas.' });
  }

  const destLat = parseFloat(lat);
  const destLng = parseFloat(lng);

  let distanceKm = 0;
  let calculationSource = 'haversine';
  let googleApiSuccess = false;

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (apiKey && apiKey !== 'YOUR_GOOGLE_MAPS_API_KEY_HERE' && apiKey.trim() !== '') {
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${fleteModel.ORIGIN_LAT},${fleteModel.ORIGIN_LNG}&destinations=${destLat},${destLng}&key=${apiKey}&mode=driving`;
      const response = await axios.get(url);

      if (response.data.status === 'OK' && response.data.rows[0].elements[0].status === 'OK') {
        const element = response.data.rows[0].elements[0];
        distanceKm = element.distance.value / 1000; // meters to km
        calculationSource = 'google';
        googleApiSuccess = true;
      }
    } catch (error) {
      console.error('Error al consultar Google Maps API, usando contingencia Haversine:', error.message);
    }
  }

  const calculationResult = fleteModel.calculateFleteCost(
    destLat,
    destLng,
    distanceKm,
    calculationSource,
    items
  );

  return res.json(calculationResult);
}

module.exports = {
  getFleteEstimation
};
