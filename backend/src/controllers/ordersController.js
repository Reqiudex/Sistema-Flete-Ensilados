/**
 * ============================================================
 * CONTROLADOR: ordersController.js
 * Sistema de Pedidos Anónimos – Ensilados Santa Cruz
 * ============================================================
 * HU03: Registro ágil de pedidos directamente en base de datos
 *       (Supabase) sin login obligatorio del cliente.
 * HU08: Gestión de pedidos y actualización de estados de despacho.
 *
 * ENDPOINTS EXPUESTOS:
 *   POST   /api/orders          → Crear nuevo pedido (anónimo, HU03)
 *   GET    /api/admin/orders    → Listar todos los pedidos (admin, HU08)
 *   PATCH  /api/admin/orders/:id/estado → Actualizar estado de despacho (HU08)
 *
 * FLUJO TRANSACCIONAL (HU03):
 *   1. Recibe datos del cliente (nombre, teléfono) y carrito
 *   2. Recibe coordenadas GPS y costo de flete calculado (HU04, HU05)
 *   3. Inserta el pedido principal en tabla `pedidos`
 *   4. Inserta cada ítem del carrito en tabla `detalle_pedido`
 *   5. El trigger de BD genera automáticamente el código ESC-XXXX
 *   6. Retorna el pedido completo con código generado
 *
 * MODO DEMO (sin Supabase configurado):
 *   Si SUPABASE_URL no está en el .env, usa el store en memoria
 *   para permitir demostraciones del sistema sin BD.
 * ============================================================
 */

'use strict';

const supabase   = require('../config/supabaseClient');
const ordersStore = require('../models/ordersStore'); // Fallback para modo demo

/**
 * POST /api/orders
 *
 * Registra un nuevo pedido de forma anónima (sin login de cliente).
 * Operación transaccional: primero inserta el pedido, luego el detalle.
 * Si alguno falla, el ON DELETE CASCADE garantiza consistencia.
 *
 * @param {Object} req.body
 * @param {string}   req.body.cliente_nombre    - Nombre completo del cliente
 * @param {string}   req.body.cliente_telefono  - Teléfono / WhatsApp del cliente
 * @param {number}   req.body.latitud           - Latitud del punto de entrega
 * @param {number}   req.body.longitud          - Longitud del punto de entrega
 * @param {number}   req.body.distancia_km      - Distancia calculada por algoritmo
 * @param {string}   req.body.fuente_calculo    - 'google' | 'haversine'
 * @param {number}   req.body.peso_total_tons   - Peso total del pedido en TM
 * @param {number}   req.body.subtotal_bs       - Subtotal de productos en Bs.
 * @param {number}   req.body.costo_flete_bs    - Costo total de flete en Bs.
 * @param {number}   req.body.total_bs          - Total a pagar (subtotal + flete)
 * @param {string}   req.body.metodo_pago       - 'QR' | 'Transferencia' | 'WhatsApp'
 * @param {Array}    req.body.items             - Ítems del carrito
 *   @param {string}   item.producto_id         - UUID del producto
 *   @param {number}   item.cantidad_tons       - Toneladas del producto
 *   @param {number}   item.precio_ton_bs       - Precio unitario al momento de compra
 *   @param {number}   item.subtotal_bs         - Subtotal del ítem
 */
async function crearPedido(req, res) {
  const {
    cliente_nombre,
    cliente_telefono,
    latitud,
    longitud,
    distancia_km,
    fuente_calculo = 'haversine',
    peso_total_tons,
    subtotal_bs,
    costo_flete_bs,
    total_bs,
    metodo_pago,
    items = [],
  } = req.body;

  // --------------------------------------------------------
  // 1. Validación de campos obligatorios
  // --------------------------------------------------------
  const camposRequeridos = {
    cliente_nombre,
    cliente_telefono,
    latitud,
    longitud,
    peso_total_tons,
    subtotal_bs,
    costo_flete_bs,
    total_bs,
    metodo_pago,
  };

  const faltantes = Object.entries(camposRequeridos)
    .filter(([, valor]) => valor === undefined || valor === null || valor === '')
    .map(([campo]) => campo);

  if (faltantes.length > 0) {
    return res.status(400).json({
      error: `Faltan campos obligatorios: ${faltantes.join(', ')}`,
      codigo: 'CAMPOS_INCOMPLETOS',
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'El pedido debe contener al menos un producto (items).',
      codigo: 'ITEMS_VACIOS',
    });
  }

  const metodosValidos = ['QR', 'Transferencia', 'WhatsApp'];
  if (!metodosValidos.includes(metodo_pago)) {
    return res.status(400).json({
      error: `Método de pago inválido. Opciones: ${metodosValidos.join(', ')}.`,
      codigo: 'METODO_PAGO_INVALIDO',
    });
  }

  if (parseFloat(peso_total_tons) <= 0) {
    return res.status(400).json({
      error: 'El peso total del pedido debe ser mayor a cero.',
      codigo: 'PESO_INVALIDO',
    });
  }

  // --------------------------------------------------------
  // 2. Construcción del objeto pedido principal
  // --------------------------------------------------------
  const nuevoPedido = {
    cliente_nombre:   cliente_nombre.trim(),
    cliente_telefono: cliente_telefono.trim(),
    latitud:          parseFloat(latitud),
    longitud:         parseFloat(longitud),
    distancia_km:     parseFloat(distancia_km) || 0,
    fuente_calculo:   fuente_calculo,
    peso_total_tons:  parseFloat(peso_total_tons),
    subtotal_bs:      parseFloat(subtotal_bs),
    costo_flete_bs:   parseFloat(costo_flete_bs),
    total_bs:         parseFloat(total_bs),
    metodo_pago:      metodo_pago,
    estado:           'Pendiente', // Estado inicial de todo pedido nuevo
    // Nota: codigo_pedido es generado automáticamente por el trigger de BD
  };

  // --------------------------------------------------------
  // 3A. RUTA PRINCIPAL: Persistencia en Supabase
  // --------------------------------------------------------
  if (supabase) {
    try {
      // Paso 1: Insertar el pedido principal
      const { data: pedidoCreado, error: errorPedido } = await supabase
        .from('pedidos')
        .insert(nuevoPedido)
        .select()          // Retorna el registro insertado con codigo_pedido generado
        .single();

      if (errorPedido) {
        console.error('[Pedido] Error al insertar pedido en Supabase:', errorPedido);
        throw new Error(errorPedido.message);
      }

      // Paso 2: Preparar e insertar el detalle de ítems
      const detalleItems = items.map(item => ({
        pedido_id:     pedidoCreado.id,
        producto_id:   item.producto_id,
        cantidad_tons: parseFloat(item.cantidad_tons),
        precio_ton_bs: parseFloat(item.precio_ton_bs),
        subtotal_bs:   parseFloat(item.subtotal_bs),
      }));

      const { error: errorDetalle } = await supabase
        .from('detalle_pedido')
        .insert(detalleItems);

      if (errorDetalle) {
        // Si el detalle falla, el ON DELETE CASCADE limpia el pedido huérfano
        console.error('[Pedido] Error al insertar detalle de pedido:', errorDetalle);
        // Intentamos eliminar el pedido para mantener consistencia
        await supabase.from('pedidos').delete().eq('id', pedidoCreado.id);
        throw new Error('Error al registrar el detalle de productos del pedido.');
      }

      // Paso 3: Recuperar el pedido completo con su detalle para la respuesta
      const { data: pedidoCompleto } = await supabase
        .from('pedidos')
        .select(`
          *,
          detalle_pedido (
            id,
            cantidad_tons,
            precio_ton_bs,
            subtotal_bs,
            producto:producto_id (
              id, nombre, descripcion
            )
          )
        `)
        .eq('id', pedidoCreado.id)
        .single();

      console.log(
        `[Pedido] Nuevo pedido registrado en Supabase: ${pedidoCreado.codigo_pedido}`
      );

      return res.status(201).json({
        mensaje:  'Pedido registrado exitosamente.',
        pedido:   pedidoCompleto || pedidoCreado,
      });

    } catch (error) {
      console.error('[Pedido] Error transaccional:', error.message);
      return res.status(500).json({
        error:  'Error interno al registrar el pedido. Por favor, intente nuevamente.',
        codigo: 'ERROR_SERVIDOR',
        detalle: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  // --------------------------------------------------------
  // 3B. RUTA DE CONTINGENCIA: Store en memoria (modo demo)
  // Activo cuando Supabase no está configurado.
  // --------------------------------------------------------
  console.warn('[Pedido] Supabase no configurado. Guardando en store de demo.');

  const pedidoMock = ordersStore.createOrder({
    ...nuevoPedido,
    items: items.map(item => ({
      product_id:    item.producto_id,
      quantity_tons: parseFloat(item.cantidad_tons),
      subtotal:      parseFloat(item.subtotal_bs),
      product:       { name: item.nombre_producto || 'Producto' },
    })),
  });

  return res.status(201).json({
    mensaje: 'Pedido registrado en modo demo (Supabase no configurado).',
    pedido:  pedidoMock,
  });
}

/**
 * GET /api/admin/orders
 *
 * Lista todos los pedidos con su detalle de ítems.
 * Acceso restringido al panel administrativo (middleware JWT).
 *
 * @param {Object} req.query
 * @param {string} [req.query.estado]      - Filtrar por estado ('Pendiente', etc.)
 * @param {string} [req.query.fecha_desde] - Fecha de inicio (ISO 8601)
 * @param {string} [req.query.fecha_hasta] - Fecha de fin    (ISO 8601)
 */
async function listarPedidos(req, res) {
  const { estado, fecha_desde, fecha_hasta } = req.query;

  if (supabase) {
    try {
      let query = supabase
        .from('pedidos')
        .select(`
          *,
          detalle_pedido (
            id,
            cantidad_tons,
            precio_ton_bs,
            subtotal_bs,
            producto:producto_id (
              id, nombre
            )
          )
        `)
        .order('creado_en', { ascending: false });

      // Aplicar filtros opcionales
      if (estado) {
        query = query.eq('estado', estado);
      }
      if (fecha_desde) {
        query = query.gte('creado_en', new Date(fecha_desde).toISOString());
      }
      if (fecha_hasta) {
        // Incluir el día completo
        const hasta = new Date(fecha_hasta);
        hasta.setHours(23, 59, 59, 999);
        query = query.lte('creado_en', hasta.toISOString());
      }

      const { data: pedidos, error } = await query;

      if (error) throw new Error(error.message);

      return res.json({ pedidos: pedidos || [], total: pedidos?.length || 0 });

    } catch (error) {
      console.error('[Pedidos] Error al listar pedidos:', error.message);
      return res.status(500).json({
        error:  'Error al obtener los pedidos.',
        codigo: 'ERROR_CONSULTA',
      });
    }
  }

  // Modo demo
  const pedidos = ordersStore.getOrders();
  return res.json({ pedidos, total: pedidos.length });
}

/**
 * PATCH /api/admin/orders/:id/estado
 *
 * Actualiza el estado de despacho de un pedido (HU08).
 * Estados válidos: 'Pendiente' → 'En Camino' → 'Entregado' | 'Cancelado'
 *
 * @param {string} req.params.id - UUID del pedido
 * @param {string} req.body.estado - Nuevo estado del pedido
 */
async function actualizarEstadoPedido(req, res) {
  const { id }     = req.params;
  const { estado } = req.body;

  const estadosValidos = ['Pendiente', 'En Camino', 'Entregado', 'Cancelado'];
  if (!estadosValidos.includes(estado)) {
    return res.status(400).json({
      error: `Estado inválido. Opciones válidas: ${estadosValidos.join(', ')}.`,
      codigo: 'ESTADO_INVALIDO',
    });
  }

  if (supabase) {
    try {
      const { data: pedidoActualizado, error } = await supabase
        .from('pedidos')
        .update({ estado, actualizado_en: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw new Error(error.message);
      if (!pedidoActualizado) {
        return res.status(404).json({
          error: 'Pedido no encontrado.',
          codigo: 'PEDIDO_NO_ENCONTRADO',
        });
      }

      console.log(`[Pedido] Estado actualizado: ${id} → ${estado}`);
      return res.json({
        mensaje: `Estado del pedido actualizado a "${estado}".`,
        pedido:  pedidoActualizado,
      });

    } catch (error) {
      console.error('[Pedido] Error al actualizar estado:', error.message);
      return res.status(500).json({
        error:  'Error al actualizar el estado del pedido.',
        codigo: 'ERROR_ACTUALIZACION',
      });
    }
  }

  // Modo demo
  const actualizado = ordersStore.updateOrderStatus(id, estado);
  if (!actualizado) {
    return res.status(404).json({ error: 'Pedido no encontrado (demo).' });
  }
  return res.json({ mensaje: `Estado actualizado a "${estado}".`, pedido: actualizado });
}

module.exports = {
  crearPedido,
  listarPedidos,
  actualizarEstadoPedido,
};
