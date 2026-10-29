/**
 * Cliente de Supabase (PostgreSQL) del backend.
 * Si SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no están definidos, devuelve null
 * y los repositorios funcionan en modo memoria (demostración y pruebas).
 *
 * El backend usa la clave de servicio: la base de datos NO se expone al navegador.
 */
'use strict';

let cliente;          // undefined = aún no inicializado
let clienteInyectado = false;

function getSupabase() {
  if (clienteInyectado) return cliente;
  if (cliente !== undefined) return cliente;

  const url = (process.env.SUPABASE_URL || '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !key || url.includes('XXXXXXXX')) {
    cliente = null;
    return cliente;
  }

  const { createClient } = require('@supabase/supabase-js');
  cliente = createClient(url, key, { auth: { persistSession: false } });
  return cliente;
}

/** Solo para pruebas: inyecta un cliente falso (o null para forzar modo memoria). */
function __setClient(fake) {
  cliente = fake;
  clienteInyectado = true;
}

function __resetClient() {
  cliente = undefined;
  clienteInyectado = false;
}

module.exports = { getSupabase, __setClient, __resetClient };
