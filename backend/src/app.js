'use strict';

const express = require('express');
const cors = require('cors');
const { origenesCors } = require('./config/env');
const { cabecerasSeguridad } = require('./middleware/seguridad');
const { crearRutas } = require('./routes');

function crearApp() {
  const app = express();
  app.set('trust proxy', 1); // detrás de Cloudflare Tunnel / nginx
  app.disable('x-powered-by');
  app.use(cabecerasSeguridad);
  app.use(cors({ origin: origenesCors(), methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));
  // El webhook de la pasarela se firma sobre los bytes exactos: se recibe sin parsear
  app.use('/api/webhooks/pasarela', express.raw({ type: '*/*', limit: '64kb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', crearRutas());
  app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta no encontrada.', codigo: 'NO_ENCONTRADO' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.', codigo: 'JSON_INVALIDO' });
    console.error('[Error]', err);
    return res.status(500).json({ error: 'Error interno del servidor.', codigo: 'ERROR_SERVIDOR' });
  });
  return app;
}

module.exports = { crearApp };
