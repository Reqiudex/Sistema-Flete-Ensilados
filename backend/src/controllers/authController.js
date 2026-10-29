/** Autenticación de administradores: JWT + 2FA TOTP real (HU06). */
'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepo = require('../models/userRepository');
const totp = require('../utils/totp');
const v = require('../utils/validators');
const { obtenerJwtSecret, jwtExpiraEn } = require('../config/env');
const { responderError, ErrorNegocio } = require('../utils/errors');

const COSTO_BCRYPT = 10;

function emitirToken(usuario) {
  return jwt.sign({ sub: usuario.id, proposito: 'acceso' }, obtenerJwtSecret(), { expiresIn: jwtExpiraEn() });
}
function emitirPreAuth(usuario) {
  return jwt.sign({ sub: usuario.id, proposito: 'pre2fa' }, obtenerJwtSecret(), { expiresIn: '5m' });
}
const sesion = (u) => ({ token: emitirToken(u), usuario: userRepo.publico(u) });

async function login(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const usuario = email ? await userRepo.buscarPorEmail(email) : null;
    // Comparación siempre (hash ficticio si no existe) para no revelar qué correos existen.
    const hash = usuario?.password_hash || '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi';
    const valido = await bcrypt.compare(password, hash).catch(() => false);
    if (!usuario || !valido) {
      return res.status(401).json({ error: 'Credenciales incorrectas.', codigo: 'CREDENCIALES_INVALIDAS' });
    }
    if (usuario.dos_factores_activo) {
      return res.json({ requiere_2fa: true, token_preauth: emitirPreAuth(usuario) });
    }
    return res.json(sesion(usuario));
  } catch (e) {
    return responderError(res, e, 'login');
  }
}

async function verificar2FA(req, res) {
  try {
    let payload;
    try {
      payload = jwt.verify(String(req.body?.token_preauth || ''), obtenerJwtSecret());
    } catch {
      return res.status(401).json({ error: 'La verificación expiró. Inicie sesión de nuevo.', codigo: 'PREAUTH_INVALIDO' });
    }
    if (payload.proposito !== 'pre2fa') {
      return res.status(401).json({ error: 'Token no válido.', codigo: 'PREAUTH_INVALIDO' });
    }
    const usuario = await userRepo.buscarPorId(payload.sub);
    if (!usuario || !usuario.dos_factores_activo || !usuario.dos_factores_secreto) {
      return res.status(401).json({ error: 'Token no válido.', codigo: 'PREAUTH_INVALIDO' });
    }
    if (!totp.verificarCodigo(usuario.dos_factores_secreto, req.body?.codigo)) {
      return res.status(401).json({ error: 'Código de verificación incorrecto.', codigo: 'CODIGO_2FA_INVALIDO' });
    }
    return res.json(sesion(usuario));
  } catch (e) {
    return responderError(res, e, 'verificar2FA');
  }
}

function perfil(req, res) {
  res.json({ usuario: userRepo.publico(req.usuario) });
}

/** Genera un secreto nuevo (aún inactivo) y devuelve la URL otpauth para el código QR. */
async function configurar2FA(req, res) {
  try {
    if (req.usuario.dos_factores_activo) {
      throw new ErrorNegocio('La verificación en dos pasos ya está activa.', 'DOS_FACTORES_ACTIVO', 409);
    }
    const secreto = totp.generarSecreto();
    await userRepo.actualizar(req.usuario.id, { dos_factores_secreto: secreto });
    res.json({ secreto, otpauth_url: totp.generarUrlOtpauth(req.usuario.email, secreto) });
  } catch (e) {
    responderError(res, e, 'configurar2FA');
  }
}

async function activar2FA(req, res) {
  try {
    const u = req.usuario;
    if (!u.dos_factores_secreto) throw new ErrorNegocio('Primero genere el secreto.', 'SIN_SECRETO', 400);
    if (!totp.verificarCodigo(u.dos_factores_secreto, req.body?.codigo)) {
      throw new ErrorNegocio('Código de verificación incorrecto.', 'CODIGO_2FA_INVALIDO', 400);
    }
    await userRepo.actualizar(u.id, { dos_factores_activo: true });
    res.json({ mensaje: 'Verificación en dos pasos activada.' });
  } catch (e) {
    responderError(res, e, 'activar2FA');
  }
}

async function desactivar2FA(req, res) {
  try {
    const u = req.usuario;
    if (!(await bcrypt.compare(String(req.body?.password || ''), u.password_hash))) {
      throw new ErrorNegocio('Contraseña incorrecta.', 'CREDENCIALES_INVALIDAS', 401);
    }
    if (u.dos_factores_activo && !totp.verificarCodigo(u.dos_factores_secreto, req.body?.codigo)) {
      throw new ErrorNegocio('Código de verificación incorrecto.', 'CODIGO_2FA_INVALIDO', 400);
    }
    await userRepo.actualizar(u.id, { dos_factores_activo: false, dos_factores_secreto: null });
    res.json({ mensaje: 'Verificación en dos pasos desactivada.' });
  } catch (e) {
    responderError(res, e, 'desactivar2FA');
  }
}

async function cambiarPassword(req, res) {
  try {
    const u = req.usuario;
    if (!(await bcrypt.compare(String(req.body?.password_actual || ''), u.password_hash))) {
      throw new ErrorNegocio('La contraseña actual es incorrecta.', 'CREDENCIALES_INVALIDAS', 401);
    }
    const nueva = v.validarPassword(req.body?.password_nueva);
    if (!nueva.ok) throw new ErrorNegocio(nueva.error, nueva.codigo, 400);
    await userRepo.actualizar(u.id, { password_hash: await bcrypt.hash(nueva.value, COSTO_BCRYPT) });
    res.json({ mensaje: 'Contraseña actualizada.' });
  } catch (e) {
    responderError(res, e, 'cambiarPassword');
  }
}

module.exports = { login, verificar2FA, perfil, configurar2FA, activar2FA, desactivar2FA, cambiarPassword, COSTO_BCRYPT };
