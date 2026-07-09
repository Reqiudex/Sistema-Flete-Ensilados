require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🌾 Ensilados Santa Cruz API corriendo en http://localhost:${PORT}`);
  console.log(`📡 Modo: ${process.env.GOOGLE_MAPS_API_KEY ? 'Google Maps + Haversine' : 'Solo Haversine (Contingencia)'}`);
  console.log(`🔐 Auth: JWT + TOTP 2FA`);
});
