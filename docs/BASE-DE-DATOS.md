# Base de datos (Supabase de Coolify)

Producción usa el **Supabase propio en Coolify**, publicado en `https://dbtesis.cerice360.com`, con las tablas del sistema
en el esquema **`tesis`** (`SUPABASE_SCHEMA=tesis`). El mismo Supabase aloja otros proyectos en sus propios esquemas o
bases (por ejemplo `cerice360` y la base `pasarela`): no hace falta otro servidor de base de datos.

## 1. Aplicar o actualizar el esquema

`database/schema.sql` es **idempotente**: se puede ejecutar todas las veces que haga falta; crea lo que falta y migra lo
existente (por ejemplo, el nuevo estado *Pagado en efectivo*, `historial_pagos` y la RPC `registrar_pago_pedido`).

1. Haga un respaldo (sección 3).
2. Abra `https://dbtesis.cerice360.com` → **SQL Editor** → *New query*.
3. Escriba en la primera línea `SET search_path = tesis, public;` y pegue debajo todo `database/schema.sql`.
4. *Run*. Debe terminar sin errores (los avisos `NOTICE … does not exist, skipping` son normales).
5. Compruebe: *Table Editor* → esquema `tesis` → existen `historial_pagos` y `pagos_webhook_entregas`.

El script también: deja **RLS activa en todas las tablas sin políticas** (ningún acceso para `anon`/`authenticated`),
revoca sus privilegios y concede a `service_role` (el que usa el backend) acceso al esquema.
El esquema `tesis` debe figurar en `PGRST_DB_SCHEMAS` del servicio Supabase (ya configurado en producción).

Datos de ejemplo opcionales (solo demostración): `database/seed-demo.sql` (catálogo de la tesis; sin usuarios ni contraseñas).

## 2. Funciones (RPC) y tablas

| Objeto | Uso |
|---|---|
| `crear_pedido(p_pedido, p_items)` | Pedido + detalle + descuento de stock + historial en una transacción |
| `actualizar_estado_pedido(p_id, p_estado, p_usuario)` | Transición válida, reposición de stock al cancelar, historial |
| `registrar_pago_pedido(p_id, p_cambios, p_usuario, p_nota, p_entrega, p_evento)` | Datos de pago + entrega de webhook (idempotencia) + `historial_pagos`, atómico; nunca degrada un pago confirmado |
| `historial_pedidos` / `historial_pagos` | Trazabilidad de estados logísticos y de pago |
| `pagos_webhook_entregas` | Entregas de webhook ya procesadas |

Índices para reportes: `(pago_estado, creado_en)`, cobros pendientes por vencimiento, historial por pedido.

## 3. Respaldo y restauración

**Automático (recomendado):** Coolify → servicio Supabase → *Backups* → programe un respaldo diario de PostgreSQL con
retención y, si es posible, destino S3. Pruebe una restauración al menos una vez.

**Manual (solo el esquema `tesis`)**, desde el servidor:

```bash
# Respaldo
docker exec supabase-db-bx4ixq11kl7vwnrall5bdty0 \
  pg_dump -U supabase_admin -d postgres -n tesis --no-owner -Fc > tesis-$(date +%F).dump

# Restauración en una base o esquema de prueba primero; en producción, con el sistema detenido desde Coolify:
docker exec -i supabase-db-bx4ixq11kl7vwnrall5bdty0 \
  pg_restore -U supabase_admin -d postgres --no-owner --clean --if-exists -n tesis < tesis-AAAA-MM-DD.dump
# y vuelva a ejecutar database/schema.sql (permisos, RLS y RPC)
```

Guarde los respaldos fuera del servidor (por ejemplo en el Disco Lento `/mnt/disco-lento` y además en la nube).
Los respaldos contienen nombres y teléfonos de clientes: trátelos como datos personales.
