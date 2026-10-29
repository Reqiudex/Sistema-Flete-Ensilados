/** Autenticación JWT y control de roles. Verifica además que el usuario siga existiendo. */
'use strict';

const jwt = require('jsonwebtoken');
const { obtenerJwtSecret } = require('../config/env');
const userRepo = require('../models/userRepository');

async function autenticar(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const [esquema, token] = cabecera.split(' ');
  if (esquema !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Se requiere autenticación.', codigo: 'NO_AUTENTICADO' });
  }
  try {
    const payload = jwt.verify(token, obtenerJwtSecret());
    if (payload.proposito !== 'acceso') throw new Error('token no válido para acceso');
    const usuario = await userRepo.buscarPorId(payload.sub);
    if (!usuario) return res.status(401).json({ error: 'La sesión ya no es válida.', codigo: 'SESION_INVALIDA' });
    req.usuario = usuario; // rol y datos siempre actuales (no los del token)
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o expirada.', codigo: 'SESION_INVALIDA' });
  }
}

function requerirRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ error: 'Se requiere autenticación.', codigo: 'NO_AUTENTICADO' });
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: `Acceso denegado. Se requiere rol: ${roles.join(' o ')}.`, codigo: 'ROL_INSUFICIENTE' });
    }
    return next();
  };
}

module.exports = { autenticar, requerirRol };
