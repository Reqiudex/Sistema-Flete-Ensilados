const express = require('express');
const cors = require('cors');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const logisticsRoutes = require('./routes/logisticsRoutes');

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Ensilados Santa Cruz API (MVC)', time: new Date() });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', logisticsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Ruta ${req.method} ${req.url} no encontrada.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error del servidor:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

module.exports = app;
