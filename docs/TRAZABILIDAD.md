# Trazabilidad tesis ↔ sistema

> **Estado de este documento:** la columna *Sección de la tesis* está **pendiente** porque el documento de la tesis
> (UDABOL 2026, "Ensilados Santa Cruz") no estaba disponible en el repositorio ni en el servidor al redactarlo. Los
> requisitos se tomaron de las historias de usuario HU01–HU09 ya documentadas en el README y la guía de usuario, más la
> HU10 nueva (pago con QR). Al incorporar la tesis se deben completar la sección, los requisitos no funcionales, los casos
> de uso y los criterios de aceptación literales, y marcar cualquier contradicción tesis ↔ código.

Estados: **Completo** (implementado y con prueba), **Parcial**, **Falta**. Las pruebas están en `backend/tests`
(`api.test.js`, `flete.test.js`, `utils.test.js`, `pagos.test.js`); "E2E" = recorrido en navegador con Playwright
(escritorio y celular, tema claro y oscuro del sistema operativo).

## Historias de usuario

| Requisito | Sección de la tesis | Dónde está implementado | Estado | Prueba |
|---|---|---|---|---|
| HU01 Información de la empresa (presentación, servicios, misión, visión, contacto) | pendiente | `frontend/src/App.tsx` (inicio), `Footer.tsx` | Completo | E2E (página de inicio) |
| HU02 Catálogo de productos con precio por tonelada y disponibilidad | pendiente | `GET /api/products` · `productRepository` · `CatalogCart.tsx` | Completo | "Catálogo y parámetros públicos" |
| HU03 Pedido sin registro, stock descontado en transacción | pendiente | `POST /api/orders` · `orderService.crearPedido` · RPC `crear_pedido` | Completo | "Pedido: ignora importes del cliente, descuenta stock…", "Pedido con stock insuficiente → 409…", "Pedido: valida teléfono y nombre" |
| HU04 Ubicación en mapa interactivo (y contingencia sin mapa) | pendiente | `MapComponent.tsx` (Google Maps, cotizador offline) | Completo | "Peso mínimo y coordenadas inválidas se rechazan"; E2E |
| HU05 Cálculo automático del flete | pendiente | `fleteModel.js` (fuente única) · `api.ts → cotizarLocal` · `POST /api/calculate-flete` · `distanceService` | Completo | `flete.test.js` (6 pruebas), "Cálculo de flete lo hace el servidor…", "Parámetros de flete modificables…" |
| HU06 Autenticación de administradores (JWT + 2FA TOTP) | pendiente | `/api/auth/*` · `authController` · `utils/totp.js` · `AuthScreen.tsx` | Completo | "TOTP: vector RFC 6238", "2FA real…", "Middleware: token de pre-autenticación…", "Login…"; E2E con 2FA |
| HU07 Gestión de productos | pendiente | `/api/admin/products` · panel *Productos* | Completo | "Productos: CRUD con validación y desactivación" |
| HU08 Gestión de pedidos y estados con historial | pendiente | `/api/admin/orders` · RPC `actualizar_estado_pedido` · `historial_pedidos` | Completo | "Estados: transiciones válidas, cancelar restaura stock…" |
| HU09 Reportes de ventas (gráficos, PDF, CSV) | pendiente | `/api/admin/stats` · `/api/admin/reports/orders.csv` · panel *Estadísticas* | Completo | "Estadísticas excluyen cancelados; CSV se genera", "CSV: separador ; y neutralización de fórmulas"; E2E (descarga PDF y CSV) |
| **HU10 Pago con QR** (nueva) | a agregar (ver [TESIS-CAMBIOS.md](TESIS-CAMBIOS.md)) | `pagoService` · `pasarelaService` · `/api/pagos/webhook` · RPC `registrar_pago_pedido` · `PagoQr.tsx` | Completo | 21 pruebas de `pagos.test.js`; E2E (pedido → QR → pagado) |

## Requisitos de HU10 (pago con QR)

| Requisito | Dónde | Estado | Prueba |
|---|---|---|---|
| Cobro creado al registrar el pedido, monto recalculado en el servidor en centavos enteros | `publicController.crearPedido` → `pagoService.cobroInicial` / `aCentavos` | Completo | "Al crear el pedido se crea el cobro…", "Centavos exactos…" |
| `reference` = código, `idempotency_key` = id del pedido, `return_url` = página del pedido | `pagoService.iniciarPago` | Completo | "Al crear el pedido…", "Pago tardío…" (clave `id-2`) |
| Credenciales solo en el backend | `config/env.pasarelaConfig` | Completo | "Iniciar pago…" (el secreto no viaja) |
| Estado de pago separado del logístico, con historial | `pedidos.pago_estado` · `historial_pagos` | Completo | "Estados…", "Marcar pagado en efectivo…" |
| Webhook: cuerpo crudo, firma en tiempo constante, ventana 5 min, idempotencia | `app.js` (`express.raw`) · `pasarelaService.verificarWebhook` · RPC | Completo | "Firma… vectores oficiales", "Webhook con firma inválida…", "Webhook real por HTTP…" |
| `paid` → Pagado, `expired` → Vencido (con cobro nuevo), `cancelled` → Cancelado; `paid` tardío aceptado | `pagoService.procesarWebhook` | Completo | "Vencimiento, nuevo cobro…", "Pago tardío…" |
| Respaldo por consulta si no llega el webhook | `pagoService.reconciliarPendientes` (cada 60 s) | Completo | "Respaldo por consulta…" |
| Monto exacto grande, checkout, QR, cuenta regresiva, consulta periódica | `PagoQr.tsx` | Completo | E2E |
| 503/429 → pedido "Pendiente de pago" + "Reintentar pago" | `cobroInicial` · `PagoQr.tsx` | Completo | "Si la pasarela responde 503 o 429…"; E2E |
| La cola offline no crea cobros | `api.ts → crearPedido/sincronizarPedidos` (el cobro lo crea el servidor al recibir el pedido) | Completo | revisión de código |
| Panel: columna y filtro de pago, regenerar cobro, efectivo con nota, cancelar cobro al cancelar pedido | `AdminDashboard.tsx` · `/api/admin/orders/:id/pago*` | Completo | "Regenerar cobro…", "Marcar pagado en efectivo…", "Cancelar un pedido con cobro pendiente…"; E2E |
| Reportes pagadas vs. pendientes (panel, PDF, CSV) | `statsService` · `/api/admin/reports/cobranza.csv` · plantilla PDF | Completo | "Confirmación manual de transferencia… reporte de cobranza"; E2E |
| Modo memoria y pasarela simulada | repositorios en memoria · `scripts/pasarela-simulada.js` | Completo | "Integración por HTTP con la pasarela simulada…" |
| Interruptor `PAGOS_QR_HABILITADO` | `config/env` | Completo | "PAGOS_QR_HABILITADO=false…" |

## Requisitos no funcionales (verificados)

| Requisito | Dónde | Estado | Evidencia |
|---|---|---|---|
| Seguridad de datos: el navegador no accede a la base; RLS sin acceso para `anon`/`authenticated` | `database/schema.sql` | Completo | Prueba en PostgreSQL de Supabase: `permission denied` para `anon` |
| Atomicidad de pedidos, estados y pagos | RPC `crear_pedido`, `actualizar_estado_pedido`, `registrar_pago_pedido` | Completo | Prueba SQL: entrega repetida → `duplicado`, pago no se degrada |
| Disponibilidad sin conexión (zonas rurales) | caché, cotizador offline, cola de pedidos | Completo | Guía de usuario 1.6 |
| Responsivo (celular y escritorio) | Tailwind | Completo | E2E Pixel 7 / iPhone 13 / 1366 px |
| Límite de peticiones y cabeceras de seguridad | `rateLimit.js`, `nginx.conf`, `seguridad.js` | Completo | E2E: bloqueo por IP real sin afectar a otra IP |
| Contenedores sin privilegios y sin secretos | `Dockerfile`s, `.dockerignore`, `docker-compose.coolify.yml` | Completo | `id -u` 101 (nginx) y 1000 (node) |
| Dependencias sin vulnerabilidades altas/críticas | `npm audit --omit=dev` | Completo | backend 0, frontend 0 (jspdf 4.2.1) |

## Contradicciones detectadas y resueltas

| Tema | Antes | Ahora |
|---|---|---|
| Términos del carrito | "el sistema no incorpora mecanismos de pago electrónico en línea" | Explica el pago QR con monto exacto y que no se procesan tarjetas ni datos bancarios |
| Guía de usuario | "El pago se coordina fuera del sistema; la plataforma no cobra en línea" | QR con confirmación automática; transferencia/WhatsApp/efectivo verificados por el personal |
| Lectura pública de productos en la base (`anon`) | Permitida por política RLS | Eliminada: el catálogo se sirve por la API (requisito de RLS estricta) |
