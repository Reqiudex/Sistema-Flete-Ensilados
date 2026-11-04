# Pagos con QR (pasarela-pagos)

El sistema cobra los pedidos con el **QR estático** de la empresa a través de la pasarela propia
`https://apipagos.cerice360.com` (repositorio `Reqiudex/pasarela-pagos`). La pasarela suma a cada cobro un **centavo
único** (por ejemplo, Bs 3.035,35 → **Bs 3.035,36**) y concilia el recibo del banco: así sabe qué pedido se pagó sin que
el QR lleve el monto. El cliente debe pagar **exactamente** ese monto.

## 1. Flujo

1. El cliente registra el pedido (`POST /api/orders`). El backend recalcula precios, flete y total y llama a la RPC
   `crear_pedido` (estado logístico *Pendiente*, pago *Pendiente de pago*).
2. Si `metodo_pago = QR`, **el backend** crea el cobro: `POST /v1/payments` firmado con
   - `amount_cents` = total del pedido en centavos enteros, calculado en el servidor (`pagoService.aCentavos`, sin coma flotante);
   - `reference` = código del pedido (`ESC-1234`);
   - `idempotency_key` = id del pedido (reintentos y doble clic devuelven el mismo cobro; un cobro nuevo tras vencer usa `id-2`, `id-3`…);
   - `return_url` = `PUBLIC_URL/?pedido=ESC-1234` (página que muestra el estado del pago);
   - `expires_in_seconds` = `PASARELA_EXPIRA_SEGUNDOS` (600 por defecto).
3. La respuesta (`id`, `total_amount`, `checkout_url`, `expires_at`) se guarda con la RPC `registrar_pago_pedido`.
4. La confirmación muestra el **monto exacto en grande**, el botón al `checkout_url`, un QR para abrirlo desde el celular y
   la cuenta regresiva; consulta `GET /api/orders/:codigo/pago` cada 4 s hasta *Pagado*.
5. La pasarela envía el webhook `payment.paid` a `POST /api/pagos/webhook`; el pedido queda *Pagado*.

Las credenciales (`PASARELA_API_KEY`, `PASARELA_SECRET`) existen **solo en el backend**. El navegador nunca habla con la
API de la pasarela ni decide si un pago es válido.

## 2. Estados de pago (`pedidos.pago_estado`)

| Estado | Significado | Origen |
|---|---|---|
| `Pendiente` (se muestra *Pendiente de pago*) | Sin pago confirmado; puede tener un cobro QR vigente | Al crear el pedido |
| `Pagado` | Pago QR confirmado por la pasarela, o transferencia verificada por un administrador (con nota) | Webhook, consulta, administrador |
| `Pagado en efectivo` | Dinero recibido en mano; registrado por un administrador con **nota obligatoria** | Administrador |
| `Vencido` | El cobro QR expiró sin pago | Webhook `payment.expired` o consulta |
| `Cancelado` | El cobro se anuló (pedido cancelado) | Cancelación del pedido o webhook `payment.cancelled` |
| `Revision` (se muestra *En revisión*) | Llegó dinero que no se puede aceptar solo: monto base distinto al total del pedido, o pedido ya cancelado | Webhook o consulta |

Reglas:
- El estado de pago es **independiente** del estado logístico (`Pendiente ⇄ En Camino → Entregado / Cancelado`).
- Un pago confirmado (`Pagado`, `Pagado en efectivo`) **nunca se degrada** (lo garantiza la RPC con bloqueo de fila).
- Un `payment.paid` que llega **después** de `payment.expired` (pago tardío aprobado a mano en la pasarela) **se acepta**; si
  mientras tanto se había creado un cobro nuevo, ese cobro se anula en la pasarela para no cobrar dos veces.
- Vencimientos o cancelaciones de un cobro **ya reemplazado** se ignoran.
- Cada cambio queda en `historial_pagos` (estado anterior y nuevo, cobro, usuario u origen, nota).

## 3. Webhook `POST /api/pagos/webhook`

- Nginx reenvía el cuerpo intacto; Express lo recibe **crudo** (`express.raw`) para verificar la firma sobre los bytes exactos.
- Firma: `hex(HMAC_SHA256(PASARELA_SECRET, X-Pasarela-Timestamp + "." + cuerpo_crudo))`, comparada en **tiempo constante**
  (`crypto.timingSafeEqual`). Timestamp fuera de ±5 minutos → `401`. Nunca se revela el motivo exacto.
- **Idempotencia**: `X-Pasarela-Delivery` se inserta en `pagos_webhook_entregas` **dentro de la misma transacción** que el
  cambio de estado (RPC `registrar_pago_pedido`). Una entrega repetida responde `200 {motivo:"duplicado"}` sin cambiar nada;
  si la base falla, no se consume la entrega y la pasarela la reintenta.
- Responde `2xx` en milisegundos; eventos desconocidos o de pedidos inexistentes responden `200` (no tiene sentido reintentar).
- La ruta anterior `POST /api/webhooks/pasarela` sigue funcionando por compatibilidad.

## 4. Fallos y respaldo

| Situación | Comportamiento |
|---|---|
| Pasarela `503 gateway_degraded` / `payments_paused` | El pedido se crea igual como *Pendiente de pago* (`pago.error`); el cliente ve **Reintentar pago** |
| `429 no_free_cents` / `rate_limited` | Igual que arriba, con mensaje "intente en unos segundos" |
| `400` (p. ej. monto mayor al máximo de la app) | Pedido creado; el cliente puede pagar por transferencia |
| Webhook que no llega | **Respaldo por consulta**: cada `PAGOS_RECONCILIAR_SEGUNDOS` (60) el backend consulta `GET /v1/payments/{id}` de los cobros pendientes; además, cada consulta del cliente y el botón **Verificar** del panel contrastan con la pasarela (fuente de verdad) |
| Pasarela sin conexión al consultar | Se devuelve el último estado conocido |
| Pedido cancelado con cobro pendiente | `POST /v1/payments/{id}/cancel` (si ya no está pendiente, se ignora) y pago → *Cancelado* |
| Cola offline del navegador | No crea cobros; el cobro se crea cuando el pedido llega al servidor |
| `PAGOS_QR_HABILITADO=false` o faltan credenciales | Se oculta la opción QR; Transferencia y WhatsApp siguen funcionando |

## 5. Panel administrativo

Columna y filtro de **estado de pago**, monto exacto del cobro vigente, **Verificar**, **Regenerar cobro**, **Pagado en
efectivo** (o transferencia verificada) con nota obligatoria, historial unificado y reportes de cobranza (*pagadas vs.
pendientes*) en el panel, en el PDF y en `GET /api/admin/reports/cobranza.csv`.

## 6. Pruebas (`backend/tests/pagos.test.js`)

- Vectores oficiales de firma (petición y webhook) de `docs/INTEGRACION.md` de la pasarela.
- Webhook válido, firma inválida, secreto ajeno, cuerpo alterado, timestamp viejo, entrega repetida (idempotencia).
- Monto calculado en el servidor aunque el cliente envíe otro; centavos exactos (`0.29`, `1.005`, `4500.1`…).
- Pasarela `503` y `429` al crear el pedido y "Reintentar pago".
- Cancelación de pedido con cobro pendiente, pago tardío de un cobro vencido, regenerar cobro, efectivo con nota.
- Respaldo por consulta, interruptor `PAGOS_QR_HABILITADO`.
- **Integración HTTP** con la pasarela simulada (`backend/scripts/pasarela-simulada.js`): firma real, nonce único,
  centavo único por monto, checkout y webhook firmado de vuelta al backend.

## 7. Probar en local con la pasarela simulada

```bash
cp .env.example .env     # JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD y además:
# PASARELA_API_URL=http://pasarela-simulada:8099  PASARELA_API_KEY=pk_simulada  PASARELA_SECRET=sk_simulada
docker compose --profile simulador up -d --build
```
Abra `http://localhost:3000`, haga un pedido QR y en la página del checkout (`http://localhost:8099/pay/...`) pulse
**Simular pago**: la confirmación cambia a *Pago confirmado*. El simulador **no** debe usarse en producción.
