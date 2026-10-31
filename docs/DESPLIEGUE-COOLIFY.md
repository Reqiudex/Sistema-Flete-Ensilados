# Despliegue en Coolify

Arquitectura: **un solo dominio web** (frontend + proxy `/api` hacia el backend) y **un Supabase propio** para la base de datos con su panel web (Studio).

| Pieza | Dónde | Dominio |
|---|---|---|
| Web + API | Aplicación Docker Compose desde este repositorio (`docker-compose.coolify.yml`) | `https://tesis.cherry.lat` |
| Base de datos + panel web | Servicio **Supabase** de Coolify (template oficial) | `https://dbtesis.cerice360.com` |

## 1. Base de datos (Supabase)
1. Coolify → *New Resource* → *Services* → **Supabase**.
2. En el servicio, asigne el dominio `https://dbtesis.cerice360.com` a **Supabase Kong** (el mismo dominio sirve la API y el panel Studio, protegido con el usuario/contraseña del dashboard que genera Coolify).
3. Cree el DNS: registro `A` (o `CNAME`) de `dbtesis.cerice360.com` hacia la IP del servidor Coolify. Si el DNS está en Cloudflare, use proxy desactivado o modo Full (strict).
4. Despliegue y espere a que todos los contenedores estén *healthy*.
5. Abra `https://dbtesis.cerice360.com` → Studio → **SQL Editor** → pegue el contenido de `database/schema.sql` → *Run*. (El script es idempotente: se puede volver a ejecutar.)
6. Anote, de las variables del servicio Supabase: `SERVICE_SUPABASEURL`/dominio público y **`SERVICE_SUPABASESERVICE_KEY`** (clave *service_role*).

## 2. Aplicación (frontend + backend)
1. Coolify → *New Resource* → *Public/Private Repository* → `Reqiudex/Sistema-Flete-Ensilados`, rama `main`.
2. *Build Pack*: **Docker Compose**; *Docker Compose Location*: `/docker-compose.coolify.yml`.
3. Variables de entorno (Environment Variables):

| Variable | Valor |
|---|---|
| `JWT_SECRET` | texto aleatorio de 32+ caracteres (`openssl rand -hex 32`) |
| `SUPABASE_URL` | `https://dbtesis.cerice360.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | clave service_role del paso 1.6 (solo backend) |
| `SUPABASE_SCHEMA` | (opcional) esquema de las tablas; `public` por defecto. Use `tesis` si comparte Supabase con otros proyectos: cree el esquema, ejecute `schema.sql` con `SET search_path = tesis` y agréguelo a `PGRST_DB_SCHEMAS` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Superadmin inicial (cámbiela tras el primer ingreso) |
| `CORS_ORIGINS` | `https://tesis.cherry.lat` |
| `PASARELA_API_KEY` / `PASARELA_SECRET` | `pk_...` / `sk_...` de la app registrada en la pasarela (ver sección 2.1) |
| `PASARELA_BASE_URL` | `https://apipagos.cerice360.com` (por defecto) |
| `PUBLIC_URL` | `https://tesis.cherry.lat` |
| `GOOGLE_MAPS_API_KEY` | (opcional) Distance Matrix; sin clave se usa Haversine × 1,25 |
| `VITE_GOOGLE_MAPS_API_KEY` | (opcional) Maps JavaScript; marcar como *Build Variable*; restringir por dominio |

4. En el servicio **frontend** asigne el dominio `https://tesis.cherry.lat` (puerto 80). El backend no necesita dominio: solo es accesible mediante `/api`.
5. *Deploy*. Compruebe `https://tesis.cherry.lat/api/health` → `{"estado":"ok"}` y que el panel `/admin` permita iniciar sesión con `ADMIN_EMAIL`.

### 2.1 Pagos QR (pasarela-pagos)
1. En el dashboard de la pasarela (`https://pagos.cerice360.com`) → **Apps → Nueva app**: nombre *Ensilados Santa Cruz*, **URL de webhook** `https://tesis.cherry.lat/api/webhooks/pasarela` (HTTPS). Guarde la API key (`pk_`) y el secreto (`sk_`, se muestra una sola vez).
2. Defina en Coolify `PASARELA_API_KEY` y `PASARELA_SECRET` y vuelva a desplegar.
3. Ajuste en la app de la pasarela el **monto máximo por cobro** (`max_amount_cents`) según los pedidos esperados: un pedido de varias toneladas puede superar el límite de un QR bancario; en ese caso el cliente debe usar *Transferencia*.
4. Si la pasarela, Gmail o las variables no están disponibles, el sistema oculta la opción QR y sigue funcionando con *Transferencia* y *WhatsApp*.
5. Compruebe un cobro real de monto bajo: pedido QR → pagar el monto exacto → el estado cambia a *Pagado* en 1–2 minutos y se registra en el panel de la pasarela.

## 3. Verificación y mantenimiento
- Registrar un pedido de prueba y comprobar la fila en Studio → *Table Editor* → `pedidos` (y `historial_pedidos`).
- Activar *Auto Deploy* (webhook de GitHub) para redeploy en cada `push` a `main`.
- Respaldos: Coolify → Supabase → *Backups* de PostgreSQL programados.
- Si cambia `database/schema.sql`, vuelva a ejecutarlo en el SQL Editor.
- La clave `service_role` nunca debe ir al frontend ni al repositorio.

## 4. Problemas frecuentes
- *Cannot connect to Supabase*: revise `SUPABASE_URL` (HTTPS, sin barra final) y que el DNS de `dbtesis.cerice360.com` ya resuelva.
- *Gateway/502 en `/api`*: el backend no está *healthy*; revise sus logs (`JWT_SECRET` ausente o menor de 32 caracteres).
- Sin Supabase configurado el backend arranca en modo memoria (solo demostración); en producción `SUPABASE_URL` es obligatorio en este compose.
