# Arquitectura

## Componentes
```
frontend (React/Vite)  ──►  backend (Express)  ──►  Supabase (PostgreSQL)
   api.ts: único cliente         controllers → services → repositories        tablas + RPC + RLS
   caché + cola offline          validación, JWT, roles, límites              (service_role)
                                 ├──► Google Distance Matrix (fallback Haversine)
                                 └──► pasarela-pagos (QR Banco Ganadero): cobros firmados HMAC  ◄── webhooks firmados
```
Capas del backend (MVC con capa de servicios):
- `routes/` define endpoints y middleware (`auth`, `rateLimit`).
- `controllers/` traduce HTTP ↔ servicios; `public`, `auth`, `admin`.
- `services/` lógica de negocio: `orderService` (recalcula todo en servidor), `distanceService` (Google), `statsService`, `pagoService` (cobro QR, conciliación y webhooks) y `pasarelaService` (cliente firmado de la pasarela).
- `models/` repositorios (Supabase o memoria) y `fleteModel.js` (funciones puras del algoritmo).
- `utils/` validadores, TOTP RFC 6238 propio, CSV, errores de negocio.
- `config/` entorno (sin secretos por defecto) y cliente Supabase.

## Decisiones de diseño
| Decisión | Motivo |
|---|---|
| El navegador no accede a Supabase | La clave `service_role` y las reglas de negocio quedan en el servidor; RLS cierra el acceso directo |
| El servidor ignora los importes del cliente | Evita manipulación de precios, fletes y totales |
| Stock y estados en funciones SQL (`crear_pedido`, `actualizar_estado_pedido`) | Pedido + detalle + stock + historial se confirman en una sola transacción; el bloqueo de filas evita sobreventa concurrente |
| Cancelación en lugar de borrado | Trazabilidad e integridad de reportes; el stock se repone |
| Parámetros de tarifa en la tabla `parametros_flete` | La empresa ajusta tarifas sin modificar código; el trigger de costos usa los mismos porcentajes |
| Modo memoria sin Supabase | Demostración y pruebas automáticas sin infraestructura |
| Offline por capas | Caché de catálogo/parámetros, cotización local con la misma fórmula, cola de pedidos que se reenvía al volver la red |
| Pago QR mediante pasarela externa y webhook firmado | El dinero se confirma con el recibo del banco (conciliado por la pasarela), no con lo que diga el navegador; la firma HMAC, el timestamp, la idempotencia por entrega y la comparación del monto base impiden confirmaciones falsas o duplicadas. Ante la duda se consulta `GET /v1/payments/{id}` (fuente de verdad) |
| `pago_estado` separado de `estado` | Entrega y cobro son procesos distintos: un pedido puede estar *En Camino* con pago *Pendiente* (transferencia) o cobrado y cancelado (→ *Revision*) |
| 2FA TOTP propio (sin dependencias) | Compatible con Google Authenticator/Authy; verificado con el vector de prueba del RFC 6238 |

## Modelo de datos
`productos` 1—N `detalle_pedido` N—1 `pedidos` 1—N `historial_pedidos`; `usuarios` (administradores); `parametros_flete` (fila única). Trigger `fn_generar_codigo_pedido` (`ESC-NNNN`) y `fn_calcular_financieros` (costos estimados). Detalle completo en `database/schema.sql`.

## Estados del pedido
```
Pendiente ⇄ En Camino
   │            │
   ├────────────┼──► Entregado (final)
   └────────────┴──► Cancelado (final, repone stock)
```

## Flujo de pago QR
```
Cliente ──pedido──► API (estado Pendiente, pago Pendiente)
Cliente ──POST /orders/:codigo/pago──► API ──POST /v1/payments (HMAC)──► Pasarela ──► monto exacto + checkout
Cliente paga el QR del banco ─► banco envía recibo a Gmail ─► Pasarela concilia (SPF/DKIM/DMARC)
Pasarela ──webhook payment.paid (HMAC)──► POST /api/webhooks/pasarela ──► pedido: pago_estado = Pagado
```

## Seguridad
JWT de acceso (8 h) con `proposito: acceso`; token de pre-autenticación (5 min, `pre2fa`) que no sirve como sesión; el middleware comprueba en cada petición que el usuario siga existiendo y usa su rol actual. Webhook de pagos: cuerpo crudo verificado con HMAC-SHA256 en tiempo constante y ventana de 5 minutos; el secreto de la pasarela vive solo en el servidor. Contraseñas bcrypt (coste 10), límites de intentos, cabeceras de seguridad, CORS por lista, JSON limitado a 100 kB.

## Pruebas
`backend/tests` (`npm test`, incluye `pagos.test.js` con los vectores oficiales de firma de la pasarela, `node:test`, sin dependencias de prueba): fórmula del flete, Haversine, TOTP (RFC 6238), validadores, CSV, y flujos de API (pedido, stock, estados, historial, roles, 2FA en dos pasos, usuarios, productos, parámetros).
