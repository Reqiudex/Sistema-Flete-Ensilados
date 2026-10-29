# Ensilados Santa Cruz — Sistema web de compras y cálculo de fletes

Plataforma web para **Ensilados Santa Cruz** (planta en San Ramón, Santa Cruz, Bolivia): catálogo de productos, pedidos sin registro, cálculo automático del flete por geolocalización y panel administrativo. Proyecto de grado de Ingeniería de Sistemas (UDABOL, 2026).

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS, Recharts, jsPDF |
| Backend | Node.js + Express (MVC), API REST en español |
| Base de datos | Supabase / PostgreSQL (con modo memoria para demostración y pruebas) |
| Mapas | Google Maps (Maps JavaScript en el navegador, Distance Matrix en el servidor) con contingencia Haversine |
| Seguridad | JWT + 2FA TOTP (RFC 6238), bcrypt, RLS en la base de datos |
| Despliegue | Docker / Docker Compose, Cloudflare Tunnel (`tesis.cherry.lat`) |

Documentación: [Arquitectura](docs/ARQUITECTURA.md) · [API REST](docs/API.md) · [Guía de usuario](docs/GUIA-USUARIO.md)

## Cómo funciona (resumen)

```
Navegador (React) ──HTTPS──▶ API Express ──service_role──▶ Supabase / PostgreSQL
        │                        │
        │                        └──▶ Google Distance Matrix (si falla: Haversine × 1,25)
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

## Puesta en marcha

### Opción A — Docker (recomendada)

```bash
cp .env.example .env        # completar JWT_SECRET (≥ 32 caracteres), ADMIN_EMAIL, ADMIN_PASSWORD y, si se usa, Supabase/Maps
docker compose up -d --build
```

**Producción en Coolify:** ver [docs/DESPLIEGUE-COOLIFY.md](docs/DESPLIEGUE-COOLIFY.md) (`docker-compose.coolify.yml`, Supabase propio en `dbtesis.cerice360.com`).
Frontend: http://localhost:3000 · API: http://localhost:3001/api/health

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
1. Cree el proyecto y ejecute `database/schema.sql` en el *SQL Editor* (es idempotente).
2. Copie `SUPABASE_URL` y la clave **service_role** en `backend/.env` (jamás en el frontend).
3. Sin esas variables la API usa memoria: los datos se pierden al reiniciar (solo demostración).

### Pruebas
```bash
cd backend && npm test      # 25 pruebas automáticas (flete, validadores, TOTP, CSV, API, roles, 2FA, stock)
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
| `VITE_API_URL` | frontend | URL de la API (sin `/api`); vacío = autodetección |
| `VITE_GOOGLE_MAPS_API_KEY` | frontend | Maps JavaScript; restringir por dominio |

## Seguridad

- Sin credenciales ni secretos en el código; `.env` está en `.gitignore`.
- Contraseñas con bcrypt; sesión JWT de 8 h; token intermedio de 5 min para el 2FA; limitador de intentos en login.
- RLS activo en todas las tablas: el público solo puede leer productos activos; el backend usa `service_role`.
- Validación en servidor de nombre, teléfono boliviano, coordenadas, cantidades, métodos de pago y transiciones de estado; CSV protegido contra inyección de fórmulas.

## Estructura

```
backend/   server.js · src/{config,controllers,middleware,models,routes,services,utils} · tests/
frontend/  src/{api.ts,types.ts,App.tsx,components/}
database/  schema.sql
docs/      ARQUITECTURA.md · API.md · GUIA-USUARIO.md
```

## Licencia
Ver [LICENSE](LICENSE).
