/**
 * Repositorio de productos (tabla productos) – HU02 y HU07.
 * Con Supabase persiste en PostgreSQL; sin Supabase usa memoria (demostración y pruebas).
 *
 * Forma de un producto (API):
 *   { id, nombre, descripcion, precio_ton, stock_tons, factor_flete, activo }
 */
'use strict';

const { getSupabase } = require('../config/supabaseClient');
const { ErrorNegocio } = require('../utils/errors');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEMILLA = () => [
  {
    id: 'prod-silo-maiz',
    nombre: 'Silo de Maíz',
    descripcion:
      'Alimento balanceado y fermentado de alta calidad para ganado bovino, elaborado con maíz seleccionado de Santa Cruz. Ideal para complementar dietas en época seca.',
    precio_ton: 450,
    stock_tons: 5000,
    factor_flete: 1.2,
    activo: true,
  },
  {
    id: 'prod-soya',
    nombre: 'Soya',
    descripcion:
      'Grano de soya certificado, rico en proteínas para nutrición animal e industria alimentaria. Alta demanda en el mercado cruceño.',
    precio_ton: 1800,
    stock_tons: 2500,
    factor_flete: 1.5,
    activo: true,
  },
  {
    id: 'prod-sorgo',
    nombre: 'Sorgo',
    descripcion:
      'Excelente alternativa forrajera y energética con alta tolerancia a la sequía. Recurso estratégico en temporadas de escasez hídrica del oriente boliviano.',
    precio_ton: 350,
    stock_tons: 4000,
    factor_flete: 1.0,
    activo: true,
  },
];

let memoria = SEMILLA();

function normalizar(fila) {
  if (!fila) return null;
  return {
    id: fila.id,
    nombre: fila.nombre,
    descripcion: fila.descripcion ?? '',
    precio_ton: Number(fila.precio_ton),
    stock_tons: Number(fila.stock_tons),
    factor_flete: Number(fila.factor_flete),
    activo: fila.activo !== false,
  };
}

function lanzarSiError(error, mensaje) {
  if (error) {
    console.error('[Productos]', error.message);
    throw new ErrorNegocio(mensaje, 'ERROR_BASE_DATOS', 500);
  }
}

async function listarTodos() {
  const db = getSupabase();
  if (!db) return memoria.map((p) => ({ ...p })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  const { data, error } = await db.from('productos').select('*').order('nombre');
  lanzarSiError(error, 'No se pudo obtener el catálogo.');
  return (data || []).map(normalizar);
}

async function listarActivos() {
  return (await listarTodos()).filter((p) => p.activo);
}

async function obtenerPorIds(ids = []) {
  const unicos = [...new Set(ids.map(String))];
  const db = getSupabase();
  if (!db) return memoria.filter((p) => unicos.includes(p.id)).map((p) => ({ ...p }));

  const validos = unicos.filter((id) => UUID.test(id));
  if (validos.length === 0) return [];
  const { data, error } = await db.from('productos').select('*').in('id', validos);
  lanzarSiError(error, 'No se pudieron consultar los productos.');
  return (data || []).map(normalizar);
}

async function obtenerPorId(id) {
  const lista = await obtenerPorIds([id]);
  return lista[0] || null;
}

async function crear(datos) {
  const db = getSupabase();
  const nuevo = { activo: true, ...datos };
  if (!db) {
    const producto = { id: `prod-${Date.now()}-${Math.floor(Math.random() * 1000)}`, ...nuevo };
    memoria.push(producto);
    return { ...producto };
  }
  const { data, error } = await db.from('productos').insert(nuevo).select().single();
  lanzarSiError(error, 'No se pudo crear el producto.');
  return normalizar(data);
}

async function actualizar(id, cambios) {
  const db = getSupabase();
  if (!db) {
    const idx = memoria.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    memoria[idx] = { ...memoria[idx], ...cambios };
    return { ...memoria[idx] };
  }
  if (!UUID.test(String(id))) return null;
  const { data, error } = await db.from('productos').update(cambios).eq('id', id).select().maybeSingle();
  lanzarSiError(error, 'No se pudo actualizar el producto.');
  return normalizar(data);
}

/** "Eliminar" = desactivar (los pedidos históricos conservan la referencia). */
async function desactivar(id) {
  return actualizar(id, { activo: false });
}

/* ------- Solo modo memoria: el stock lo controla la función SQL crear_pedido en Supabase ------- */

function descontarStockMemoria(items) {
  for (const it of items) {
    const p = memoria.find((x) => x.id === it.producto_id);
    if (!p || !p.activo) throw new ErrorNegocio('Producto no disponible.', 'PRODUCTO_NO_DISPONIBLE', 409);
    if (p.stock_tons < it.cantidad_tons) {
      throw new ErrorNegocio(`Stock insuficiente de ${p.nombre} (disponible: ${p.stock_tons} TM).`, 'STOCK_INSUFICIENTE', 409);
    }
  }
  for (const it of items) {
    const p = memoria.find((x) => x.id === it.producto_id);
    p.stock_tons = Math.round((p.stock_tons - it.cantidad_tons) * 100) / 100;
  }
}

function restaurarStockMemoria(items) {
  for (const it of items) {
    const p = memoria.find((x) => x.id === it.producto_id);
    if (p) p.stock_tons = Math.round((p.stock_tons + it.cantidad_tons) * 100) / 100;
  }
}

function _reset() {
  memoria = SEMILLA();
}

module.exports = {
  listarTodos,
  listarActivos,
  obtenerPorId,
  obtenerPorIds,
  crear,
  actualizar,
  desactivar,
  descontarStockMemoria,
  restaurarStockMemoria,
  _reset,
};
