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
| `POST /orders` | Registra un pedido (máx. 60/hora por IP). Body: `{cliente_nombre, cliente_telefono, latitud, longitud, metodo_pago, items:[{producto_id, cantidad_tons}]}` → `201` pedido completo. El servidor **ignora cualquier importe** enviado |

Códigos de error frecuentes: `NOMBRE_INVALIDO`, `TELEFONO_INVALIDO`, `COORDENADAS_INVALIDAS`, `COORDENADAS_FUERA_DE_RANGO`, `METODO_PAGO_INVALIDO`, `ITEMS_VACIOS`, `CANTIDAD_INVALIDA`, `PESO_MINIMO` (400); `PRODUCTO_NO_DISPONIBLE`, `STOCK_INSUFICIENTE` (409).

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
| `GET /admin/orders?estado=&desde=AAAA-MM-DD&hasta=AAAA-MM-DD` | Pedidos con detalle (fechas en hora de Bolivia) |
| `POST /admin/orders` | Venta directa; mismo cuerpo que el pedido público |
| `GET /admin/orders/:id` · `GET /admin/orders/:id/history` | Pedido / historial de estados |
| `PATCH /admin/orders/:id/status` | `{estado}`. Transiciones: Pendiente→En Camino/Entregado/Cancelado; En Camino→Pendiente/Entregado/Cancelado; Entregado y Cancelado son finales. Cancelar **devuelve el stock** |
| `GET /admin/stats?desde=&hasta=` | Totales (ingresos, fletes, toneladas, costos y ganancia estimados, por estado y producto); excluye cancelados |
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
