/**
 * Validaciones de entrada (backend). Cada función devuelve { ok, value } o { ok:false, error }.
 * Se valida siempre en el servidor, aunque el frontend ya valide.
 */
'use strict';

const METODOS_PAGO = ['QR', 'Transferencia', 'WhatsApp'];
const ESTADOS = ['Pendiente', 'En Camino', 'Entregado', 'Cancelado'];
const ROLES = ['Admin', 'Superadmin'];

/** Transiciones de estado permitidas (Entregado y Cancelado son finales). */
const TRANSICIONES = {
  Pendiente: ['En Camino', 'Entregado', 'Cancelado'],
  'En Camino': ['Pendiente', 'Entregado', 'Cancelado'],
  Entregado: [],
  Cancelado: [],
};

const ok = (value) => ({ ok: true, value });
const fallo = (error, codigo) => ({ ok: false, error, codigo });

function validarNombre(valor) {
  const v = String(valor ?? '').trim().replace(/\s+/g, ' ');
  if (v.length < 3 || v.length > 100) return fallo('El nombre debe tener entre 3 y 100 caracteres.', 'NOMBRE_INVALIDO');
  return ok(v);
}

/** Teléfono boliviano: celular de 8 dígitos (6xxxxxxx / 7xxxxxxx) o fijo de 7 dígitos. Acepta +591. */
function validarTelefono(valor) {
  let digitos = String(valor ?? '').replace(/\D/g, '');
  if (digitos.startsWith('591') && digitos.length > 8) digitos = digitos.slice(3);
  if (/^[67]\d{7}$/.test(digitos) || /^[2-4]\d{6}$/.test(digitos)) return ok(digitos);
  return fallo('Ingrese un número válido (celular de 8 dígitos o fijo de 7 dígitos).', 'TELEFONO_INVALIDO');
}

function validarCoordenadas(lat, lng) {
  const la = Number(lat);
  const lo = Number(lng);
  if (lat === '' || lng === '' || lat == null || lng == null || !Number.isFinite(la) || !Number.isFinite(lo)) {
    return fallo('Las coordenadas (latitud, longitud) deben ser números válidos.', 'COORDENADAS_INVALIDAS');
  }
  // Bolivia y áreas limítrofes
  if (la < -23 || la > -9 || lo < -70 || lo > -57) {
    return fallo('Las coordenadas están fuera del área de cobertura (Bolivia).', 'COORDENADAS_FUERA_DE_RANGO');
  }
  return ok({ lat: la, lng: lo });
}

function validarMetodoPago(valor) {
  return METODOS_PAGO.includes(valor)
    ? ok(valor)
    : fallo(`Método de pago inválido. Opciones: ${METODOS_PAGO.join(', ')}.`, 'METODO_PAGO_INVALIDO');
}

function validarEstado(valor) {
  return ESTADOS.includes(valor)
    ? ok(valor)
    : fallo(`Estado inválido. Opciones válidas: ${ESTADOS.join(', ')}.`, 'ESTADO_INVALIDO');
}

function transicionPermitida(actual, nuevo) {
  return (TRANSICIONES[actual] || []).includes(nuevo);
}

/** Unifica ítems repetidos del mismo producto y valida cantidades (0 < t ≤ 1000). */
function validarItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return fallo('El pedido debe contener al menos un producto.', 'ITEMS_VACIOS');
  }
  if (items.length > 20) return fallo('El pedido supera el máximo de 20 productos distintos.', 'ITEMS_EXCESO');

  const mapa = new Map();
  for (const item of items) {
    const id = String(item?.producto_id ?? '').trim();
    const cantidad = Number(item?.cantidad_tons);
    if (!id) return fallo('Cada ítem debe indicar producto_id.', 'ITEM_SIN_PRODUCTO');
    if (!Number.isFinite(cantidad) || cantidad <= 0 || cantidad > 1000) {
      return fallo('La cantidad de cada producto debe ser mayor a 0 y no superar 1000 toneladas.', 'CANTIDAD_INVALIDA');
    }
    mapa.set(id, Math.round(((mapa.get(id) || 0) + cantidad) * 100) / 100);
  }
  return ok([...mapa.entries()].map(([producto_id, cantidad_tons]) => ({ producto_id, cantidad_tons })));
}

function validarEmail(valor) {
  const v = String(valor ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || v.length > 120) {
    return fallo('Correo electrónico inválido.', 'EMAIL_INVALIDO');
  }
  return ok(v);
}

function validarPassword(valor) {
  const v = String(valor ?? '');
  if (v.length < 8 || v.length > 72) {
    return fallo('La contraseña debe tener entre 8 y 72 caracteres.', 'PASSWORD_DEBIL');
  }
  return ok(v);
}

function validarRol(valor) {
  return ROLES.includes(valor) ? ok(valor) : fallo('Rol inválido. Debe ser Admin o Superadmin.', 'ROL_INVALIDO');
}

function validarProducto(body, { parcial = false } = {}) {
  const salida = {};
  const b = body || {};

  if (!parcial || b.nombre !== undefined) {
    const n = String(b.nombre ?? '').trim();
    if (n.length < 2 || n.length > 80) return fallo('El nombre del producto debe tener entre 2 y 80 caracteres.', 'PRODUCTO_NOMBRE');
    salida.nombre = n;
  }
  if (!parcial || b.descripcion !== undefined) {
    const d = String(b.descripcion ?? '').trim();
    if (d.length > 1000) return fallo('La descripción no puede superar 1000 caracteres.', 'PRODUCTO_DESCRIPCION');
    salida.descripcion = d;
  }
  if (!parcial || b.precio_ton !== undefined) {
    const v = Number(b.precio_ton);
    if (!Number.isFinite(v) || v < 0 || v > 1000000) return fallo('El precio por tonelada debe estar entre 0 y 1.000.000 Bs.', 'PRODUCTO_PRECIO');
    salida.precio_ton = Math.round(v * 100) / 100;
  }
  if (!parcial || b.stock_tons !== undefined) {
    const v = Number(b.stock_tons);
    if (!Number.isFinite(v) || v < 0 || v > 1000000) return fallo('El stock debe estar entre 0 y 1.000.000 toneladas.', 'PRODUCTO_STOCK');
    salida.stock_tons = Math.round(v * 100) / 100;
  }
  if (!parcial || b.factor_flete !== undefined) {
    const v = Number(b.factor_flete);
    if (!Number.isFinite(v) || v < 0.1 || v > 10) return fallo('El factor de flete debe estar entre 0,1 y 10.', 'PRODUCTO_FACTOR');
    salida.factor_flete = Math.round(v * 100) / 100;
  }
  if (b.activo !== undefined) salida.activo = Boolean(b.activo);
  return ok(salida);
}

function validarParametrosFlete(body) {
  const campos = {
    tarifa_base_bs: [0, 100000],
    precio_km_bs: [0, 10000],
    factor_correccion_rural: [1, 3],
    capacidad_vehiculo_tons: [1, 200],
    peso_minimo_tons: [0, 100],
    pct_costo_mercaderia: [0, 1],
    pct_costo_logistico: [0, 1],
  };
  const salida = {};
  for (const [campo, [min, max]] of Object.entries(campos)) {
    if (body?.[campo] === undefined) continue;
    const v = Number(body[campo]);
    if (!Number.isFinite(v) || v < min || v > max) {
      return fallo(`${campo} debe estar entre ${min} y ${max}.`, 'PARAMETRO_INVALIDO');
    }
    salida[campo] = v;
  }
  if (Object.keys(salida).length === 0) return fallo('No se envió ningún parámetro válido.', 'PARAMETROS_VACIOS');
  return ok(salida);
}

module.exports = {
  METODOS_PAGO,
  ESTADOS,
  ROLES,
  TRANSICIONES,
  validarNombre,
  validarTelefono,
  validarCoordenadas,
  validarMetodoPago,
  validarEstado,
  transicionPermitida,
  validarItems,
  validarEmail,
  validarPassword,
  validarRol,
  validarProducto,
  validarParametrosFlete,
};
