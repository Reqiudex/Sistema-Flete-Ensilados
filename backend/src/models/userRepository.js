/**
 * Repositorio de usuarios administrativos (tabla usuarios) – HU06 y HU10.
 * Sin Supabase usa memoria. No existen usuarios ni contraseñas escritos en el código:
 * la cuenta inicial se crea al arrancar el servidor con ADMIN_EMAIL / ADMIN_PASSWORD (ver server.js).
 *
 * Registro interno: { id, email, password_hash, rol, dos_factores_secreto, dos_factores_activo, creado_en }
 * Registro público (publico()): sin password_hash ni secreto 2FA.
 */
'use strict';

const crypto = require('crypto');
const { getSupabase } = require('../config/supabaseClient');
const { ErrorNegocio } = require('../utils/errors');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let memoria = [];

function publico(u) {
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    rol: u.rol,
    dos_factores_activo: !!u.dos_factores_activo,
    creado_en: u.creado_en,
  };
}

function lanzarSiError(error, mensaje) {
  if (error) {
    console.error('[Usuarios]', error.message);
    throw new ErrorNegocio(mensaje, 'ERROR_BASE_DATOS', 500);
  }
}

const normalizarEmail = (e) => String(e || '').trim().toLowerCase();

async function buscarPorEmail(email) {
  const correo = normalizarEmail(email);
  const db = getSupabase();
  if (!db) return memoria.find((u) => u.email === correo) || null;
  const { data, error } = await db.from('usuarios').select('*').eq('email', correo).maybeSingle();
  lanzarSiError(error, 'No se pudo consultar el usuario.');
  return data || null;
}

async function buscarPorId(id) {
  const db = getSupabase();
  if (!db) return memoria.find((u) => u.id === id) || null;
  if (!UUID.test(String(id))) return null;
  const { data, error } = await db.from('usuarios').select('*').eq('id', id).maybeSingle();
  lanzarSiError(error, 'No se pudo consultar el usuario.');
  return data || null;
}

async function listar() {
  const db = getSupabase();
  if (!db) return memoria.map(publico);
  const { data, error } = await db.from('usuarios').select('*').order('creado_en');
  lanzarSiError(error, 'No se pudieron obtener los usuarios.');
  return (data || []).map(publico);
}

async function contarSuperadmins() {
  const todos = await listarInternos();
  return todos.filter((u) => u.rol === 'Superadmin').length;
}

async function listarInternos() {
  const db = getSupabase();
  if (!db) return [...memoria];
  const { data, error } = await db.from('usuarios').select('*');
  lanzarSiError(error, 'No se pudieron obtener los usuarios.');
  return data || [];
}

async function crear({ email, password_hash, rol }) {
  const correo = normalizarEmail(email);
  if (await buscarPorEmail(correo)) {
    throw new ErrorNegocio('Ya existe un usuario con ese correo.', 'USUARIO_DUPLICADO', 409);
  }
  const db = getSupabase();
  const registro = { email: correo, password_hash, rol, dos_factores_secreto: null, dos_factores_activo: false };
  if (!db) {
    const nuevo = { id: crypto.randomUUID(), ...registro, creado_en: new Date().toISOString() };
    memoria.push(nuevo);
    return nuevo;
  }
  const { data, error } = await db.from('usuarios').insert(registro).select().single();
  lanzarSiError(error, 'No se pudo crear el usuario.');
  return data;
}

async function actualizar(id, cambios) {
  const db = getSupabase();
  if (!db) {
    const u = memoria.find((x) => x.id === id);
    if (!u) return null;
    Object.assign(u, cambios);
    return u;
  }
  if (!UUID.test(String(id))) return null;
  const { data, error } = await db.from('usuarios').update(cambios).eq('id', id).select().maybeSingle();
  lanzarSiError(error, 'No se pudo actualizar el usuario.');
  return data || null;
}

async function eliminar(id) {
  const db = getSupabase();
  if (!db) {
    const antes = memoria.length;
    memoria = memoria.filter((u) => u.id !== id);
    return memoria.length < antes;
  }
  if (!UUID.test(String(id))) return false;
  const { data, error } = await db.from('usuarios').delete().eq('id', id).select('id');
  lanzarSiError(error, 'No se pudo eliminar el usuario.');
  return (data || []).length > 0;
}

async function contar() {
  return (await listarInternos()).length;
}

function _reset() {
  memoria = [];
}

module.exports = {
  publico,
  buscarPorEmail,
  buscarPorId,
  listar,
  crear,
  actualizar,
  eliminar,
  contar,
  contarSuperadmins,
  _reset,
};
