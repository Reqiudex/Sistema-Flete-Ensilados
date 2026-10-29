/**
 * Cliente de la API REST de Ensilados Santa Cruz.
 * - Único punto de acceso a datos del frontend (ya no se usa Supabase desde el navegador).
 * - Adapta los campos en español de la API a los tipos de la interfaz.
 * - Soporte sin conexión: catálogo y parámetros en caché, cola de pedidos pendientes
 *   y cotización local (Haversine) cuando no hay red.
 */
import {
  FleteParams, FleteQuote, NewOrderPayload, Order, OrderItem, OrderStatus,
  PaymentMethod, Product, UserProfile, UserRole,
} from './types';

/* ------------------------------ Configuración ------------------------------ */

function resolverApiBase(): string {
  const definida = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (definida) return definida.replace(/\/+$/, '').replace(/\/api$/, '') + '/api';
  const host = window.location.hostname;
  if (host === 'tesis.cherry.lat') return 'https://api.tesis.cherry.lat/api';
  return `${window.location.protocol}//${host}:3001/api`;
}
export const API_BASE = resolverApiBase();

const CLAVES = {
  token: 'esc_token',
  productos: 'esc_cache_productos',
  params: 'esc_cache_params',
  cola: 'esc_cola_pedidos',
};

function leer<T>(clave: string): T | null {
  try {
    const v = localStorage.getItem(clave);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function guardar(clave: string, valor: unknown) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* almacenamiento lleno o bloqueado: se ignora */
  }
}

/* ---------------------------------- Errores ---------------------------------- */

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
  /** Sin respuesta del servidor (sin red, servidor caído, CORS). */
  get isNetwork() {
    return this.status === 0;
  }
}

export function mensajeError(err: unknown, porDefecto = 'Ocurrió un error inesperado.'): string {
  return err instanceof Error && err.message ? err.message : porDefecto;
}

/* ---------------------------------- HTTP ---------------------------------- */

export function obtenerToken(): string | null {
  try {
    return localStorage.getItem(CLAVES.token);
  } catch {
    return null;
  }
}

async function http<T>(ruta: string, opciones: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opciones.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opciones.auth) {
    const t = obtenerToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${ruta}`, {
      method: opciones.method || 'GET',
      headers,
      body: opciones.body !== undefined ? JSON.stringify(opciones.body) : undefined,
    });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor.', 0, 'SIN_CONEXION');
  }

  if (res.status === 204) return undefined as T;
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* respuesta sin JSON */
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `Error ${res.status} del servidor.`, res.status, data?.codigo || 'ERROR');
  }
  return data as T;
}

/* --------------------------------- Adaptadores --------------------------------- */

const num = (v: unknown, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

export function aProducto(p: any): Product {
  return {
    id: p.id,
    name: p.nombre,
    description: p.descripcion ?? '',
    unit_price_ton: num(p.precio_ton),
    stock_tons: num(p.stock_tons),
    factor_flete: num(p.factor_flete, 1),
    active: p.activo !== false,
  };
}

function aItem(d: any): OrderItem {
  return {
    id: d.id,
    product_id: d.producto_id,
    quantity_tons: num(d.cantidad_tons),
    subtotal: num(d.subtotal_bs),
    product: d.producto ? { id: d.producto.id, name: d.producto.nombre } : undefined,
  };
}

export function aPedido(p: any): Order {
  return {
    id: p.id,
    order_code: p.codigo_pedido,
    customer_name: p.cliente_nombre,
    customer_phone: p.cliente_telefono,
    lat: num(p.latitud),
    lng: num(p.longitud),
    distance_km: num(p.distancia_km),
    calculation_source: p.fuente_calculo,
    trips: num(p.viajes, 1),
    total_weight_tons: num(p.peso_total_tons),
    shipping_cost: num(p.costo_flete_bs),
    total_amount: num(p.total_bs),
    cost_items_bs: num(p.costo_mercaderia_bs),
    cost_logistics_bs: num(p.costo_logistico_bs),
    net_profit_bs: num(p.ganancia_neta_bs),
    payment_method: p.metodo_pago as PaymentMethod,
    status: p.estado as OrderStatus,
    created_at: p.creado_en,
    items: (p.detalle_pedido || []).map(aItem),
  };
}

export function aUsuario(u: any): UserProfile {
  return {
    id: u.id,
    email: u.email,
    role: u.rol as UserRole,
    two_factor_enabled: !!u.dos_factores_activo,
    created_at: u.creado_en,
  };
}

/** Teléfono boliviano: celular de 8 dígitos (6/7…) o fijo de 7 dígitos; acepta +591. (Igual que el servidor) */
export function telefonoValido(valor: string): boolean {
  let d = valor.replace(/\D/g, '');
  if (d.startsWith('591') && d.length > 8) d = d.slice(3);
  return /^[67]\d{7}$/.test(d) || /^[2-4]\d{6}$/.test(d);
}

/* --------------------------------- Parámetros --------------------------------- */

export const PARAMETROS_POR_DEFECTO: FleteParams = {
  origen: { nombre: 'Planta Ensilados Santa Cruz – San Ramón', lat: -16.6133, lng: -62.4994 },
  tarifa_base_bs: 350,
  precio_km_bs: 12,
  factor_correccion_rural: 1.25,
  capacidad_vehiculo_tons: 30,
  peso_minimo_tons: 0.5,
  pct_costo_mercaderia: 0.6,
  pct_costo_logistico: 0.7,
};

export async function obtenerParametros(): Promise<FleteParams> {
  try {
    const p = await http<FleteParams>('/flete-params');
    guardar(CLAVES.params, p);
    return p;
  } catch {
    return leer<FleteParams>(CLAVES.params) || PARAMETROS_POR_DEFECTO;
  }
}

/* --------------------------------- Catálogo --------------------------------- */

export async function obtenerProductos(): Promise<{ productos: Product[]; desdeCache: boolean }> {
  try {
    const productos = (await http<any[]>('/products')).map(aProducto);
    guardar(CLAVES.productos, productos);
    return { productos, desdeCache: false };
  } catch (e) {
    const cache = leer<Product[]>(CLAVES.productos);
    if (cache && cache.length > 0) return { productos: cache, desdeCache: true };
    throw e;
  }
}

/* ---------------------------------- Flete ---------------------------------- */

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ItemCotizacion {
  product_id: string;
  quantity_tons: number;
  factor_flete: number;
  unit_price_ton: number;
}

/** Misma fórmula que el servidor (fleteModel.js) con los parámetros en caché; solo para uso sin conexión. */
export function cotizarLocal(params: FleteParams, lat: number, lng: number, items: ItemCotizacion[]): FleteQuote {
  const distancia = haversineKm(params.origen.lat, params.origen.lng, lat, lng) * params.factor_correccion_rural;
  const peso = items.reduce((a, i) => a + i.quantity_tons, 0);
  const viajes = Math.max(1, Math.ceil(peso / params.capacidad_vehiculo_tons));
  const costoViaje = params.tarifa_base_bs + distancia * params.precio_km_bs;
  const factor = items.reduce((a, i) => a + i.quantity_tons * (i.factor_flete > 0 ? i.factor_flete : 1), 0);
  const flete = viajes * costoViaje + factor;
  const subtotal = items.reduce((a, i) => a + i.quantity_tons * i.unit_price_ton, 0);
  return {
    distance_km: r2(distancia),
    source: 'haversine',
    trips: viajes,
    shipping_cost: r2(flete),
    subtotal: r2(subtotal),
    total: r2(subtotal + flete),
    estimated_offline: true,
  };
}

export async function calcularFlete(lat: number, lng: number, items: ItemCotizacion[]): Promise<FleteQuote> {
  const r = await http<any>('/calculate-flete', {
    method: 'POST',
    body: { lat, lng, items: items.map((i) => ({ producto_id: i.product_id, cantidad_tons: i.quantity_tons })) },
  });
  return {
    distance_km: num(r.distancia_km),
    source: r.fuente_calculo,
    trips: num(r.viajes, 1),
    shipping_cost: num(r.costo_flete_bs),
    subtotal: num(r.subtotal_bs),
    total: num(r.total_bs),
  };
}

/* --------------------------------- Pedidos --------------------------------- */

interface PedidoPendiente {
  clave: string;
  creado: string;
  payload: any;
  resumen: { nombre: string; items: { nombre: string; cantidad: number }[] };
}

const aPayloadApi = (d: NewOrderPayload, items: { product_id: string; quantity_tons: number }[]) => ({
  cliente_nombre: d.customerName,
  cliente_telefono: d.customerPhone,
  latitud: d.lat,
  longitud: d.lng,
  metodo_pago: d.paymentMethod,
  items: items.map((i) => ({ producto_id: i.product_id, cantidad_tons: i.quantity_tons })),
});

export function pedidosPendientes(): PedidoPendiente[] {
  return leer<PedidoPendiente[]>(CLAVES.cola) || [];
}

export interface ResultadoPedido {
  order: Order;
  enviado: boolean; // false = guardado sin conexión, se enviará al volver la red
}

export async function crearPedido(
  datos: NewOrderPayload,
  items: { product_id: string; quantity_tons: number; name: string; unit_price_ton: number }[],
  cotizacion: FleteQuote | null,
): Promise<ResultadoPedido> {
  const payload = aPayloadApi(datos, items);
  try {
    const pedido = await http<any>('/orders', { method: 'POST', body: payload });
    return { order: aPedido(pedido), enviado: true };
  } catch (e) {
    if (!(e instanceof ApiError) || !e.isNetwork) throw e;

    // Sin conexión: se guarda en la cola y se muestra un borrador provisional
    const cola = pedidosPendientes();
    const clave = `pend-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
    cola.push({
      clave,
      creado: new Date().toISOString(),
      payload,
      resumen: { nombre: datos.customerName, items: items.map((i) => ({ nombre: i.name, cantidad: i.quantity_tons })) },
    });
    guardar(CLAVES.cola, cola);

    const peso = items.reduce((a, i) => a + i.quantity_tons, 0);
    const subtotal = items.reduce((a, i) => a + i.quantity_tons * i.unit_price_ton, 0);
    const flete = cotizacion?.shipping_cost ?? 0;
    return {
      enviado: false,
      order: {
        id: clave,
        order_code: 'PENDIENTE DE ENVÍO',
        customer_name: datos.customerName,
        customer_phone: datos.customerPhone,
        lat: datos.lat,
        lng: datos.lng,
        total_weight_tons: peso,
        shipping_cost: flete,
        total_amount: r2(subtotal + flete),
        payment_method: datos.paymentMethod,
        status: 'Pendiente',
        created_at: new Date().toISOString(),
        pending_sync: true,
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity_tons: i.quantity_tons,
          subtotal: r2(i.quantity_tons * i.unit_price_ton),
          product: { id: i.product_id, name: i.name },
        })),
      },
    };
  }
}

/** Envía los pedidos guardados sin conexión. Devuelve cuántos se enviaron y cuántos fueron rechazados. */
export async function sincronizarPedidos(): Promise<{ enviados: Order[]; rechazados: { nombre: string; motivo: string }[] }> {
  const cola = pedidosPendientes();
  const enviados: Order[] = [];
  const rechazados: { nombre: string; motivo: string }[] = [];
  const restantes: PedidoPendiente[] = [];

  for (const item of cola) {
    try {
      const p = await http<any>('/orders', { method: 'POST', body: item.payload });
      enviados.push(aPedido(p));
    } catch (e) {
      if (e instanceof ApiError && !e.isNetwork && e.status < 500) {
        rechazados.push({ nombre: item.resumen.nombre, motivo: e.message }); // p. ej. stock agotado
      } else {
        restantes.push(item); // sigue sin conexión: se reintenta luego
      }
    }
  }
  guardar(CLAVES.cola, restantes);
  return { enviados, rechazados };
}

/* ---------------------------- Autenticación (admin) ---------------------------- */

export type ResultadoLogin =
  | { requiere2fa: false; token: string; usuario: UserProfile }
  | { requiere2fa: true; tokenPreauth: string };

export async function iniciarSesion(email: string, password: string): Promise<ResultadoLogin> {
  const r = await http<any>('/auth/login', { method: 'POST', body: { email, password } });
  if (r.requiere_2fa) return { requiere2fa: true, tokenPreauth: r.token_preauth };
  return { requiere2fa: false, token: r.token, usuario: aUsuario(r.usuario) };
}

export async function verificar2FA(tokenPreauth: string, codigo: string) {
  const r = await http<any>('/auth/verify-2fa', { method: 'POST', body: { token_preauth: tokenPreauth, codigo } });
  return { token: r.token as string, usuario: aUsuario(r.usuario) };
}

export async function perfil(): Promise<UserProfile> {
  const r = await http<any>('/auth/me', { auth: true });
  return aUsuario(r.usuario);
}

export const configurar2FA = () => http<{ secreto: string; otpauth_url: string }>('/auth/2fa/setup', { method: 'POST', auth: true });
export const activar2FA = (codigo: string) => http<{ mensaje: string }>('/auth/2fa/enable', { method: 'POST', auth: true, body: { codigo } });
export const desactivar2FA = (password: string, codigo: string) =>
  http<{ mensaje: string }>('/auth/2fa/disable', { method: 'POST', auth: true, body: { password, codigo } });
export const cambiarPassword = (password_actual: string, password_nueva: string) =>
  http<{ mensaje: string }>('/auth/change-password', { method: 'POST', auth: true, body: { password_actual, password_nueva } });

/* ---------------------------- Administración ---------------------------- */

export interface FiltroPedidos {
  estado?: string;
  desde?: string;
  hasta?: string;
}
const query = (f: FiltroPedidos) => {
  const p = new URLSearchParams();
  if (f.estado && f.estado !== 'Todos') p.set('estado', f.estado);
  if (f.desde) p.set('desde', f.desde);
  if (f.hasta) p.set('hasta', f.hasta);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const admin = {
  pedidos: async (f: FiltroPedidos = {}) =>
    (await http<any[]>(`/admin/orders${query(f)}`, { auth: true })).map(aPedido),
  crearPedido: async (datos: NewOrderPayload, producto_id: string, cantidad_tons: number) =>
    aPedido(
      await http<any>('/admin/orders', {
        method: 'POST',
        auth: true,
        body: aPayloadApi(datos, [{ product_id: producto_id, quantity_tons: cantidad_tons }]),
      }),
    ),
  cambiarEstado: async (id: string, estado: OrderStatus) =>
    aPedido(await http<any>(`/admin/orders/${id}/status`, { method: 'PATCH', auth: true, body: { estado } })),

  productos: async () => (await http<any[]>('/admin/products', { auth: true })).map(aProducto),
  guardarProducto: async (id: string | null, p: Pick<Product, 'name' | 'description' | 'unit_price_ton' | 'stock_tons' | 'factor_flete'> & { active?: boolean }) => {
    const body: Record<string, unknown> = {
      nombre: p.name,
      descripcion: p.description,
      precio_ton: p.unit_price_ton,
      stock_tons: p.stock_tons,
      factor_flete: p.factor_flete,
    };
    if (p.active !== undefined) body.activo = p.active;
    const r = await http<any>(id ? `/admin/products/${id}` : '/admin/products', { method: id ? 'PUT' : 'POST', auth: true, body });
    return aProducto(r);
  },
  desactivarProducto: (id: string) => http<any>(`/admin/products/${id}`, { method: 'DELETE', auth: true }),

  usuarios: async () => (await http<any[]>('/admin/users', { auth: true })).map(aUsuario),
  crearUsuario: async (email: string, password: string, rol: UserRole) =>
    aUsuario(await http<any>('/admin/users', { method: 'POST', auth: true, body: { email, password, rol } })),
  actualizarUsuario: async (id: string, cambios: { rol?: UserRole; password?: string }) =>
    aUsuario(await http<any>(`/admin/users/${id}`, { method: 'PATCH', auth: true, body: cambios })),
  eliminarUsuario: (id: string) => http<any>(`/admin/users/${id}`, { method: 'DELETE', auth: true }),

  parametros: () => http<FleteParams>('/flete-params'),
  guardarParametros: (cambios: Partial<Omit<FleteParams, 'origen'>>) =>
    http<any>('/admin/flete-params', { method: 'PUT', auth: true, body: cambios }),

  /** Descarga el CSV de pedidos (HU09) con la sesión actual. */
  descargarCsv: async (f: FiltroPedidos = {}) => {
    const t = obtenerToken();
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/admin/reports/orders.csv${query(f)}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    } catch {
      throw new ApiError('No se pudo conectar con el servidor.', 0, 'SIN_CONEXION');
    }
    if (!res.ok) throw new ApiError('No se pudo generar el reporte.', res.status);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};

export const CLAVE_TOKEN = CLAVES.token;
