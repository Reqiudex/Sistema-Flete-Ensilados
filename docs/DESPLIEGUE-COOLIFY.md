# Despliegue en Coolify

Todo corre en el Coolify del servidor (`https://coolify.cerice360.com`, proyecto **Webs Produccion**) y se publica con
**Cloudflare Tunnel** (`cerice360-tunnel`). No se usa `docker run` ni `docker compose` manual en producción.

## 0. Mapa de piezas y dominios

| Pieza | Coolify | Puerto en el host | Dominio(s) |
|---|---|---|---|
| Web + API (`/api` por proxy de Nginx) | App **tesis-v2** · repo `Reqiudex/Sistema-Flete-Ensilados` · rama `main` · `docker-compose.coolify.yml` | `8091` | `tesis.cerice360.com` (principal) · `tesis.cherry.lat` |
| Webhook de pagos | (la misma app, ruta `/api/pagos/webhook`) | `8091` | `https://tesis.cerice360.com/api/pagos/webhook` |
| Base de datos + Studio | Servicio **Supabase** (esquema `tesis`) | Kong | `dbtesis.cerice360.com` |
| Pasarela de pagos | App **pasarela-pagos** | `8092` panel · `8093` API | `pagos.cerice360.com` · `apipagos.cerice360.com` |

El backend **no** tiene dominio propio: solo se alcanza por `/api` del mismo dominio (menos superficie expuesta y sin CORS).
La app antigua **flete-ensilados** (rama `coolify-deploy`, puertos 8087/3002, dominios `tesis.cerice360.com` y
`ensiladosapi.cerice360.com`) queda reemplazada por **tesis-v2**: ver el paso 4.

## 1. Base de datos (Supabase de Coolify)

1. Respaldo y aplicación de `database/schema.sql` en el esquema `tesis`: ver [BASE-DE-DATOS.md](BASE-DE-DATOS.md).
2. Datos necesarios del servicio Supabase (Coolify → Supabase → *Environment Variables*):
   `SERVICE_SUPABASESERVICE_KEY` (clave **service_role**, solo para el backend).

## 2. Registrar la app en la pasarela

1. Abra `https://pagos.cerice360.com` → **Apps → Nueva app**.
   - Nombre: *Ensilados Santa Cruz (tesis)*.
   - URL de webhook: **`https://tesis.cerice360.com/api/pagos/webhook`**.
   - Monto máximo por cobro: según los pedidos esperados (un pedido grande puede superar el límite del QR del banco;
     en ese caso el cliente paga por transferencia y el pedido se registra igual).
2. Copie la **API key** (`pk_…`) y el **secreto** (`sk_…`, se muestra **una sola vez**) a las variables del paso 3.

## 3. Variables de la app tesis-v2 (Coolify → tesis-v2 → Environment Variables)

| Variable | Valor |
|---|---|
| `JWT_SECRET` | aleatorio de 32+ caracteres (`openssl rand -hex 32`) |
| `SUPABASE_URL` | `https://dbtesis.cerice360.com` |
| `SUPABASE_SERVICE_ROLE_KEY` | clave service_role (solo backend) |
| `SUPABASE_SCHEMA` | `tesis` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Superadmin inicial (solo se usa si no hay usuarios) |
| `CORS_ORIGINS` | `https://tesis.cerice360.com,https://tesis.cherry.lat` |
| `PUBLIC_URL` | `https://tesis.cerice360.com` |
| `PAGOS_QR_HABILITADO` | `true` (`false` para desplegar sin pasarela) |
| `PASARELA_API_URL` | `https://apipagos.cerice360.com` |
| `PASARELA_API_KEY` / `PASARELA_SECRET` | `pk_…` / `sk_…` del paso 2 (marcar el secreto como *secret*) |
| `PASARELA_EXPIRA_SEGUNDOS` | `600` |
| `PAGOS_RECONCILIAR_SEGUNDOS` | `60` |
| `GOOGLE_MAPS_API_KEY` | (opcional) Distance Matrix |
| `VITE_GOOGLE_MAPS_API_KEY` | (opcional) Maps JavaScript, *Build Variable*, restringida por dominio |
| `WEB_PORT` | `8091` |

Si antes usaba `PASARELA_BASE_URL`, sigue funcionando como alias.

*Deploy*. En Coolify ambos servicios deben quedar **healthy** (frontend en el puerto interno 8080, sin root; backend 3001).

## 4. Dominios (Cloudflare Tunnel)

El túnel `cerice360-tunnel` tiene **dos conectores** (`cloudflared.service` con `/etc/cloudflared/config.yml` y
`cloudflared-tunnel.service` con `~/.cloudflared/config.yml`): **ambos archivos deben ser idénticos**, porque Cloudflare
reparte las peticiones entre ellos. `tesis.cherry.lat` está en el túnel de cherry (`~/.cloudflared/cherry-config.yml`,
servicio de usuario `cloudflared-cherry`).

Para que `tesis.cerice360.com` sirva la versión con pagos:
1. Respalde los dos `config.yml`.
2. En **ambos**, cambie `tesis.cerice360.com → http://localhost:8087` por `http://localhost:8091`.
3. `cloudflared tunnel --config <archivo> ingress validate` y reinicie **un conector a la vez**
   (`sudo systemctl restart cloudflared`, luego `sudo systemctl restart cloudflared-tunnel`): no hay corte.
4. `ensiladosapi.cerice360.com` (puerto 3002) solo lo usaba la app antigua; puede quedar hasta retirar *flete-ensilados*.
5. Cuando todo funcione, detenga **desde Coolify** la app *flete-ensilados*.

DNS: cada subdominio es un `CNAME` a `923c4613-3071-468c-b54c-07c44fa53772.cfargotunnel.com` (proxy naranja).
`tesis.cerice360.com` ya existe; no hay que crear registros nuevos.

## 5. Verificación

```bash
curl https://tesis.cerice360.com/api/health        # {"estado":"ok",...}
curl https://tesis.cerice360.com/api/flete-params  # "pagos_qr": true
~/check-webs.sh
```
- Ingreso al panel con 2FA, catálogo, cotización, pedido.
- En la pasarela → Apps → la app → *Probar webhook* (si existe) o el pedido de prueba de la lista final.

## 6. Lista de verificación de la prueba real (QR)

- [ ] `schema.sql` aplicado en `tesis` (con respaldo previo) y `historial_pagos` existe.
- [ ] App registrada en la pasarela con webhook `https://tesis.cerice360.com/api/pagos/webhook`.
- [ ] `PASARELA_API_KEY` y `PASARELA_SECRET` cargados; redeploy hecho; `pagos_qr: true`.
- [ ] Producto de prueba barato (por ejemplo, activar temporalmente un producto con precio bajo o un pedido de 0,5 TM).
- [ ] Pedido QR desde el celular: la confirmación muestra **Pague exactamente Bs X,YZ** y la cuenta regresiva.
- [ ] Pagar **el monto exacto** con la app del banco escaneando el QR del checkout.
- [ ] En 1–2 minutos la pantalla cambia a **Pago confirmado**.
- [ ] Panel: el pedido aparece *Pagado*; el historial muestra el cambio con origen `pasarela`.
- [ ] Dashboard de la pasarela: el cobro aparece *paid* y el webhook con respuesta 200.
- [ ] Cancelar otro pedido de prueba con cobro pendiente: el cobro aparece *cancelled* en la pasarela.
- [ ] Desactivar/eliminar el producto de prueba.

## 7. Problemas frecuentes

- **502 en `dbtesis`, `studio` o `supabase`**: el túnel apuntaba a IPs internas de contenedores que cambian al reiniciar
  Supabase (pasó el 2026-11-03). Solución definitiva: publicar Kong en un puerto fijo de `127.0.0.1` desde Coolify y
  apuntar el túnel a `http://localhost:<puerto>`.
- **El backend se reinicia en bucle** con "No se pudieron obtener los usuarios": Supabase no responde (ver punto anterior)
  o `SUPABASE_SCHEMA` / clave incorrectos.
- **Webhook 401**: el secreto de Coolify no coincide con el de la app en la pasarela, o el reloj del servidor está desfasado.
- **El QR no aparece**: `PAGOS_QR_HABILITADO=false` o falta alguna de las tres variables de la pasarela.
