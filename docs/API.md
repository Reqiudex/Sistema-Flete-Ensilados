# API REST — Ensilados Santa Cruz

Base: `/api` (producción: `https://api.tesis.cherry.lat/api`). JSON UTF-8. Los campos van en español.
Errores: `{ "error": "mensaje", "codigo": "CODIGO_ESTABLE" }` con el estado HTTP correspondiente.
Rutas `/admin/*` y las marcadas 🔒 requieren `Authorization: Bearer <token>`. 🔑 = solo Superadmin.

## Público

| Método y ruta | Descripción |
|---|---|
| `GET /health` | Estado del servicio |
| `GET /products` | Productos activos `{id, nombre, descripcion, precio_ton, stock_tons, factor_flete, activo}` |
| `GET /flete-params` | Origen y parámetros tarifarios vigentes (el navegador los guarda para cotizar sin conexión) |
| `POST /calculate-flete` | Cotiza el flete. Body: `{lat, lng, items:[{producto_id, cantidad_tons}]}` → `{distancia_km, fuente_calculo, viajes, costo_flete_bs, costo_viaje_bs, costo_transporte_bs, costo_factor_bs, subtotal_bs, total_bs, …}` |
| `POST /orders` | Registra un pedido (máx. 60/hora por IP). Body: `{cliente_nombre, cliente_telefono, latitud, longitud, metodo_pago, items:[{producto_id, cantidad_tons}]}` → `201` pedido completo + `pago` (si `metodo_pago = QR`: cobro creado en la pasarela, o `pago.error` si la pasarela no respondió; el pedido se registra igual). El servidor **ignora cualquier importe** enviado |

Códigos de error frecuentes: `NOMBRE_INVALIDO`, `TELEFONO_INVALIDO`, `COORDENADAS_INVALIDAS`, `COORDENADAS_FUERA_DE_RANGO`, `METODO_PAGO_INVALIDO`, `ITEMS_VACIOS`, `CANTIDAD_INVALIDA`, `PESO_MINIMO` (400); `PRODUCTO_NO_DISPONIBLE`, `STOCK_INSUFICIENTE` (409).
| `POST /orders/:codigo/pago` | Recupera el cobro QR vigente o crea uno nuevo ("Reintentar pago" / tras vencer). `201` → `{codigo_pedido, pago_estado, monto_a_pagar_bs, checkout_url, segundos_restantes, vence_en, tiene_cobro}`. Errores: `503 PAGO_QR_NO_DISPONIBLE`, `429 PAGO_QR_OCUPADO` / `PAGO_QR_LIMITE`, `409 PEDIDO_NO_COBRABLE` / `PAGO_EN_REVISION` |
| `GET /orders/:codigo/pago` | Estado del pago (el servidor lo contrasta con la pasarela mientras esté pendiente). Solo devuelve datos mínimos, nunca datos del cliente |
| `POST /pagos/webhook` | **Solo para la pasarela** (alias anterior: `POST /webhooks/pasarela`). Cuerpo crudo firmado (`X-Pasarela-Signature` = HMAC-SHA256 de `timestamp.cuerpo`). `401` si la firma o el timestamp (±5 min) no son válidos. Idempotente por `X-Pasarela-Delivery` (registrada en la misma transacción que el cambio). Responde `200` también para eventos ignorados (pedido desconocido, cobro reemplazado, duplicado) |

`GET /flete-params` incluye `pagos_qr` (boolean): indica si el pago QR está disponible.

## Autenticación

| Método y ruta | Descripción |
|---|---|
| `POST /auth/login` | `{email, password}` → `{token, usuario}` o, con 2FA activo, `{requiere_2fa:true, token_preauth}` (válido 5 min) |
| `POST /auth/verify-2fa` | `{token_preauth, codigo}` → `{token, usuario}` |
| `GET /auth/me` 🔒 | Usuario actual |
| `POST /auth/2fa/setup` 🔒 | Genera secreto TOTP → `{secreto, otpauth_url}` (se muestra como QR) |
| `POST /auth/2fa/enable` 🔒 | `{codigo}` confirma y activa el 2FA |
| `POST /auth/2fa/disable` 🔒 | `{password, codigo}` |
| `POST /auth/change-password` 🔒 | `{password_actual, password_nueva}` (8–72 caracteres) |

Login y verify-2fa: máx. 10 intentos / 15 min por IP.

## Administración (Admin y Superadmin)

| Método y ruta | Descripción |
|---|---|
| `GET /admin/orders?estado=&pago_estado=&desde=AAAA-MM-DD&hasta=AAAA-MM-DD` | Pedidos con detalle (fechas en hora de Bolivia); filtro opcional por estado de pago |
| `POST /admin/orders` | Venta directa; mismo cuerpo que el pedido público |
| `GET /admin/orders/:id` · `GET /admin/orders/:id/history` | Pedido / historial unificado: cambios de estado (`tipo:"estado"`) y de pago (`tipo:"pago"`, con usuario y nota) |
| `PATCH /admin/orders/:id/status` | `{estado}`. Transiciones: Pendiente→En Camino/Entregado/Cancelado; En Camino→Pendiente/Entregado/Cancelado; Entregado y Cancelado son finales. Cancelar **devuelve el stock** |
| `GET /admin/stats?desde=&hasta=` | Totales (ingresos, fletes, toneladas, costos y ganancia estimados, por estado y producto); excluye cancelados |
| `POST /admin/orders/:id/pago/verificar` | Contrasta el pago QR con la pasarela y devuelve el pedido |
| `PATCH /admin/orders/:id/pago` | `{pago_estado:"Pagado en efectivo"|"Pagado", nota}`: registra un pago verificado fuera de la pasarela. **`nota` obligatoria** (3–500 caracteres), queda en el historial; anula el cobro QR pendiente |
| `POST /admin/orders/:id/pago/regenerar` | Anula el cobro QR pendiente en la pasarela y crea uno nuevo. `409` si ya está pagado o en revisión |
| `GET /admin/reports/cobranza.csv?desde&hasta` | Cobranza: pedidos y montos por estado de pago, total pagado y pendiente |
| `GET /admin/reports/orders.csv` | CSV (`;`, UTF-8 con BOM, compatible con Excel) |
| `GET /admin/products` · `POST` · `PUT /:id` | Catálogo completo (incluye inactivos) / crear / modificar (también `activo`) |
| `DELETE /admin/products/:id` 🔑 | Desactiva el producto (los pedidos históricos se conservan) |

## Solo Superadmin

| Método y ruta | Descripción |
|---|---|
| `PUT /admin/flete-params` | Cambia tarifas: `tarifa_base_bs`, `precio_km_bs`, `factor_correccion_rural`, `capacidad_vehiculo_tons`, `peso_minimo_tons`, `pct_costo_mercaderia`, `pct_costo_logistico` |
| `GET /admin/users` · `POST` | Listar / crear `{email, password, rol}` |
| `PATCH /admin/users/:id` | `{rol?, password?}` |
| `DELETE /admin/users/:id` | No permite borrar la propia cuenta ni al último Superadmin |

## Modelo de pedido

```json
{ "id": "uuid", "codigo_pedido": "ESC-1004", "cliente_nombre": "…", "cliente_telefono": "78911223",
  "latitud": -17.78, "longitud": -63.18, "distancia_km": 160.5, "fuente_calculo": "google|haversine",
  "viajes": 1, "peso_total_tons": 10, "subtotal_bs": 4500, "costo_flete_bs": 2600.5, "total_bs": 7100.5,
  "costo_mercaderia_bs": 2700, "costo_logistico_bs": 1820.35, "ganancia_neta_bs": 2580.15,
  "metodo_pago": "QR|Transferencia|WhatsApp", "estado": "Pendiente|En Camino|Entregado|Cancelado",
  "creado_en": "ISO-8601", "detalle_pedido": [{ "producto_id": "…", "cantidad_tons": 10, "precio_ton_bs": 450, "subtotal_bs": 4500, "producto": {"id":"…","nombre":"Silo de Maíz"} }] }
```
Los costos y la ganancia son **estimaciones** calculadas con los porcentajes configurables (60 % de la mercadería y 70 % del flete por defecto).

## Pago de un pedido
`pago_estado`: `Pendiente` ("Pendiente de pago") → `Pagado` | `Pagado en efectivo` | `Vencido` | `Cancelado` | `Revision`. Es independiente del estado logístico. Un pago confirmado nunca se degrada. Detalle en [PAGOS.md](PAGOS.md).
- El cobro se crea con `amount_cents` = total del pedido en centavos (aritmética entera sobre el decimal, sin coma flotante); la pasarela suma un centavo libre que identifica el pago (`pago_total_bs`).
- `Pagado` solo se acepta si el monto base del cobro coincide con el total del pedido; si no, o si el pedido ya estaba cancelado, queda en `Revision` para decisión del administrador (posible devolución).
- Un `Pagado` nunca se degrada por un evento posterior (`payment.expired` tardío).
- Campos del pedido: `pago_estado, pago_id, pago_total_bs, pago_checkout_url, pago_vence_en, pago_intentos, pagado_en`.
