'use strict';

require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { crearApp } = require('./src/app');
const userRepo = require('./src/models/userRepository');
const { obtenerJwtSecret, esProduccion } = require('./src/config/env');
const { getSupabase } = require('./src/config/supabaseClient');
const { COSTO_BCRYPT } = require('./src/controllers/authController');

/** Crea el Superadmin inicial si no hay usuarios. Nunca hay contraseñas fijas en el código. */
async function crearAdministradorInicial() {
  if ((await userRepo.contar()) > 0) return;
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  let password = process.env.ADMIN_PASSWORD || '';

  if (!email || !password) {
    if (esProduccion() && getSupabase()) {
      console.warn('[Admin] No hay usuarios. Defina ADMIN_EMAIL y ADMIN_PASSWORD para crear el Superadmin inicial.');
      return;
    }
    if (esProduccion()) return;
    password = crypto.randomBytes(9).toString('base64url');
    await userRepo.crear({ email: 'superadmin@ensilados.local', password_hash: await bcrypt.hash(password, COSTO_BCRYPT), rol: 'Superadmin' });
    console.warn(`[Admin] Modo desarrollo: usuario superadmin@ensilados.local / contraseña temporal: ${password}`);
    return;
  }
  await userRepo.crear({ email, password_hash: await bcrypt.hash(password, COSTO_BCRYPT), rol: 'Superadmin' });
  console.log(`[Admin] Superadmin inicial creado: ${email}`);
}

async function main() {
  obtenerJwtSecret(); // falla pronto si falta en producción
  await crearAdministradorInicial();
  const puerto = Number(process.env.PORT) || 3001;
  crearApp().listen(puerto, () => {
    console.log(`[Servidor] API en el puerto ${puerto} (${getSupabase() ? 'Supabase' : 'modo memoria'})`);
  });
}

main().catch((e) => {
  console.error('[Servidor] No se pudo iniciar:', e.message);
  process.exit(1);
});
