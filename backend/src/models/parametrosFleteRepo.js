/**
 * Repositorio de parámetros tarifarios (tabla parametros_flete, fila única id = 1).
 * Sin Supabase usa memoria. Los valores se guardan en caché 60 s.
 */
'use strict';

const { getSupabase } = require('../config/supabaseClient');
const { PARAMETROS_POR_DEFECTO } = require('./fleteModel');
const { ErrorNegocio } = require('../utils/errors');

const CAMPOS = Object.keys(PARAMETROS_POR_DEFECTO);
const TTL_MS = 60 * 1000;

let memoria = { ...PARAMETROS_POR_DEFECTO };
let cache = null;
let cacheTs = 0;

function normalizar(fila) {
  const salida = {};
  for (const campo of CAMPOS) {
    const n = Number(fila?.[campo]);
    salida[campo] = Number.isFinite(n) ? n : PARAMETROS_POR_DEFECTO[campo];
  }
  return salida;
}

async function obtener() {
  const db = getSupabase();
  if (!db) return { ...memoria };

  if (cache && Date.now() - cacheTs < TTL_MS) return { ...cache };

  const { data, error } = await db.from('parametros_flete').select('*').eq('id', 1).maybeSingle();
  if (error || !data) {
    if (error) console.warn('[Parámetros] No se pudo leer parametros_flete, se usan los valores por defecto:', error.message);
    return { ...PARAMETROS_POR_DEFECTO };
  }
  cache = normalizar(data);
  cacheTs = Date.now();
  return { ...cache };
}

async function actualizar(cambios) {
  const db = getSupabase();
  if (!db) {
    memoria = { ...memoria, ...cambios };
    return { ...memoria };
  }

  const { data, error } = await db
    .from('parametros_flete')
    .upsert({ id: 1, ...cambios, actualizado_en: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new ErrorNegocio('No se pudieron guardar los parámetros de flete.', 'ERROR_PARAMETROS', 500);

  cache = normalizar(data);
  cacheTs = Date.now();
  return { ...cache };
}

function _reset() {
  memoria = { ...PARAMETROS_POR_DEFECTO };
  cache = null;
  cacheTs = 0;
}

module.exports = { obtener, actualizar, _reset };
