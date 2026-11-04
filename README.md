# Ensilados Santa Cruz — Sistema web de compras y cálculo de fletes

Plataforma web para **Ensilados Santa Cruz** (planta en San Ramón, Santa Cruz, Bolivia): catálogo de productos, pedidos sin registro, cálculo automático del flete por geolocalización, **pago con QR** mediante la pasarela propia y panel administrativo. Proyecto de grado de Ingeniería de Sistemas (UDABOL, 2026).

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS, Recharts, jsPDF |
| Backend | Node.js + Express (MVC), API REST en español |
| Base de datos | Supabase / PostgreSQL (con modo memoria para demostración y pruebas) |
| Mapas | Google Maps (Maps JavaScript en el navegador, Distance Matrix en el servidor) con contingencia Haversine |
| Seguridad | JWT + 2FA TOTP (RFC 6238), bcrypt, RLS en la base de datos |
| Pagos | Pasarela propia `apipagos.cerice360.com` (QR estático con centavo único, webhooks firmados HMAC) |
| Despliegue | Coolify (Docker Compose) + Cloudflare Tunnel (`tesis.cerice360.com`, `tesis.cherry.lat`) |

Documentación: [Arquitectura](docs/ARQUITECTURA.md) · [API REST](docs/API.md) · [Guía de usuario](docs/GUIA-USUARIO.md) · [Pagos QR](docs/PAGOS.md) · [Base de datos](docs/BASE-DE-DATOS.md) · [Despliegue en Coolify](docs/DESPLIEGUE-COOLIFY.md) · [Trazabilidad tesis ↔ sistema](docs/TRAZABILIDAD.md) · [Cambios para la tesis](docs/TESIS-CAMBIOS.md)

## Cómo funciona (resumen)

```
Navegador (React) ──HTTPS──▶ API Express ──service_role──▶ Supabase / PostgreSQL
        │                        │
        │                        ├──▶ Google Distance Matrix (si falla: Haversine × 1,25)
        │                        └──▶ Pasarela de pagos (cobro firmado) ◀── webhook firmado (pago confirmado)
        └─ sin conexión: catálogo en caché + cotización local + cola de pedidos pendientes
```

El navegador **nunca** habla con la base de datos: todo pasa por la API, que valida los datos y **recalcula precios, flete y totales** (los importes enviados por el cliente se ignoran).

### Algoritmo del flete

```
viajes      = máx(1, ⌈ peso_total / capacidad_vehículo ⌉)         (30 TM por defecto)
costo_viaje = tarifa_base + km × precio_km                         (350 Bs + 12 Bs/km)
FLETE       = viajes × costo_viaje + Σ (toneladas_i × factor_flete_i)
```
`km` es la distancia por carretera de Google; si no está disponible se usa Haversine × 1,25 (corrección rural). Los parámetros se editan en el panel (Superadmin → *Tarifas de Flete*).

### Funcionalidad por historia de usuario

| HU | Descripción | Dónde |
|---|---|---|
| HU01 | Información de la empresa | Página principal |
| HU02 | Catálogo de productos | `GET /api/products` · catálogo |
| HU03 | Pedido sin registro (stock descontado en transacción) | `POST /api/orders` · RPC `crear_pedido` |
| HU04 | Ubicación en mapa interactivo | `MapComponent` |
| HU05 | Cálculo automático del flete | `POST /api/calculate-flete` · `fleteModel.js` |
| HU06 | Autenticación de administradores (JWT + TOTP) | `/api/auth/*` |
| HU07 | Gestión de productos | `/api/admin/products` |
| HU08 | Gestión de pedidos y estados (con historial) | `/api/admin/orders` · RPC `actualizar_estado_pedido` |
| HU09 | Reportes de ventas (gráficos, PDF, CSV) | Panel · `/api/admin/stats` · `/api/admin/reports/orders.csv` |
| HU10 | Pago con QR (monto exacto, confirmación automática, efectivo con nota, cobranza) | `pagoService` · `/api/pagos/webhook` · RPC `registrar_pago_pedido` · [PAGOS.md](docs/PAGOS.md) |

## Puesta en marcha

### Opción A — Docker (recomendada)

```bash
cp .env.example .env        # completar JWT_SECRET (≥ 32 caracteres), ADMIN_EMAIL, ADMIN_PASSWORD y, si se usa, Supabase/Maps
docker compose up -d --build
```

**Pagos QR:** integrados con la pasarela propia (repositorio privado `Reqiudex/pasarela-pagos`). Variables `PAGOS_QR_HABILITADO` y `PASARELA_*` en `.env.example`. Para probar sin la pasarela real: `docker compose --profile simulador up -d --build` con la pasarela simulada (ver [PAGOS.md](docs/PAGOS.md#7-probar-en-local-con-la-pasarela-simulada)).

**Producción en Coolify:** ver [docs/DESPLIEGUE-COOLIFY.md](docs/DESPLIEGUE-COOLIFY.md) (`docker-compose.coolify.yml`, Supabase propio en `dbtesis.cerice360.com`).
Frontend: http://localhost:3000 (la API va por `/api`) · API directa: http://127.0.0.1:3001/api/health

Generar un `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### Opción B — Desarrollo local

```bash
# API
cd backend && cp .env.example .env && npm install && npm run dev       # http://localhost:3001
# Web
cd frontend && cp .env.example .env && npm install && npm run dev      # http://localhost:3000
```

### Primer acceso
No existen usuarios ni contraseñas predefinidas. Al arrancar sin usuarios, el servidor crea el **Superadmin** con `ADMIN_EMAIL` / `ADMIN_PASSWORD`. En desarrollo, si no se definen, genera `superadmin@ensilados.local` con una contraseña aleatoria que se imprime **una sola vez** en la consola. Cambie la contraseña y active el 2FA desde *Mi Cuenta & 2FA*.

### Base de datos (Supabase)
1. Ejecute `database/schema.sql` en el *SQL Editor* (es idempotente; con esquema propio anteponga `SET search_path = tesis, public;`). Ver [BASE-DE-DATOS.md](docs/BASE-DE-DATOS.md) para respaldos y restauración. Datos de ejemplo opcionales: `database/seed-demo.sql`.
2. Copie `SUPABASE_URL` y la clave **service_role** en `backend/.env` (jamás en el frontend).
3. Sin esas variables la API usa memoria: los datos se pierden al reiniciar (solo demostración).

### Pruebas
```bash
cd backend && npm test      # 46 pruebas automáticas (flete, validadores, TOTP, CSV, API, roles, 2FA, stock, pagos QR y webhooks)
cd frontend && npm run build
```

## Variables de entorno

| Variable | Dónde | Descripción |
|---|---|---|
| `JWT_SECRET` | backend | Obligatoria en producción (≥ 32 caracteres) |
| `JWT_EXPIRES_IN` | backend | Duración de la sesión (por defecto `8h`) |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | backend | Base de datos; sin ellas, modo memoria |
| `GOOGLE_MAPS_API_KEY` | backend | Distance Matrix; sin clave se usa Haversine |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | backend | Superadmin inicial (solo si no hay usuarios) |
| `CORS_ORIGINS` | backend | Orígenes permitidos separados por coma |
| `SUPABASE_SCHEMA` | backend | Esquema de las tablas (`public`; en producción `tesis`) |
| `PUBLIC_URL` | backend | URL pública (retorno del checkout de pago) |
| `PAGOS_QR_HABILITADO` | backend | `false` despliega sin la pasarela |
| `PASARELA_API_URL`, `PASARELA_API_KEY`, `PASARELA_SECRET` | backend | Pasarela de pagos (solo servidor) |
| `PASARELA_EXPIRA_SEGUNDOS`, `PAGOS_RECONCILIAR_SEGUNDOS` | backend | Vigencia del cobro (600) y respaldo por consulta (60) |
| `VITE_API_URL` | frontend | URL de la API; `/api` = mismo dominio vía Nginx |
| `VITE_GOOGLE_MAPS_API_KEY` | frontend | Maps JavaScript; restringir por dominio |

## Seguridad

- Sin credenciales ni secretos en el código; `.env` está en `.gitignore`.
- Contraseñas con bcrypt; sesión JWT de 8 h; token intermedio de 5 min para el 2FA; limitador de intentos en login.
- RLS activo en todas las tablas sin acceso para `anon`/`authenticated`; el backend usa `service_role`.
- Pagos: credenciales de la pasarela solo en el servidor, webhook con firma HMAC en tiempo constante, ventana de 5 min e idempotencia; el monto se calcula en el servidor.
- Contenedores sin root, límite de peticiones por IP real del cliente, cabeceras de seguridad.
- Validación en servidor de nombre, teléfono boliviano, coordenadas, cantidades, métodos de pago y transiciones de estado; CSV protegido contra inyección de fórmulas.

## Estructura

```
backend/   server.js · src/{config,controllers,middleware,models,routes,services,utils} · tests/
frontend/  src/{api.ts,types.ts,App.tsx,components/}
database/  schema.sql · seed-demo.sql
docs/      ARQUITECTURA.md · API.md · GUIA-USUARIO.md · PAGOS.md · BASE-DE-DATOS.md · DESPLIEGUE-COOLIFY.md · TRAZABILIDAD.md · TESIS-CAMBIOS.md
```

## Licencia
Ver [LICENSE](LICENSE).
