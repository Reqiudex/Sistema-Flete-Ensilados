-- ============================================================
-- SISTEMA DE GESTIÓN DE FLETES Y PEDIDOS – Ensilados Santa Cruz
-- Tesis de Grado | Esquema de base de datos v2.0
-- Motor: PostgreSQL 15+ / Supabase | Origen: Planta San Ramón (-16.6133, -62.4994)
-- ============================================================
-- Script idempotente: puede ejecutarse varias veces sin duplicar datos.
-- Seguridad: el backend usa la clave service_role (que omite RLS). La clave pública
-- (anon) solo puede leer productos activos; todo lo demás queda bloqueado por RLS.
-- No contiene usuarios ni contraseñas: el Superadmin inicial lo crea el backend
-- al arrancar con ADMIN_EMAIL / ADMIN_PASSWORD.
-- ============================================================

-- ------------------------------------------------------------
-- productos (HU02, HU07)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS productos (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre       TEXT NOT NULL,
    descripcion  TEXT,
    precio_ton   NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (precio_ton >= 0),
    stock_tons   NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (stock_tons >= 0),
    factor_flete NUMERIC(4, 2)  NOT NULL DEFAULT 1.0 CHECK (factor_flete > 0),
    activo       BOOLEAN NOT NULL DEFAULT true,
    creado_en    TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE  productos IS 'Catálogo de productos ensilados (HU02, HU07). "Eliminar" = activo=false.';
COMMENT ON COLUMN productos.factor_flete IS 'Multiplicador logístico: aporta toneladas × factor al costo de flete.';

-- ------------------------------------------------------------
-- usuarios (HU06)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                TEXT UNIQUE NOT NULL,
    password_hash        TEXT NOT NULL,                 -- bcrypt, cost 10
    rol                  TEXT NOT NULL CHECK (rol IN ('Admin', 'Superadmin')),
    dos_factores_secreto TEXT,                          -- secreto TOTP (RFC 6238) en Base32
    dos_factores_activo  BOOLEAN NOT NULL DEFAULT false,
    creado_en            TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE usuarios IS 'Personal administrativo. Los clientes son anónimos (HU03).';

-- ------------------------------------------------------------
-- parametros_flete (HU05): fila única editable por el Superadmin
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS parametros_flete (
    id                      INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    tarifa_base_bs          NUMERIC(10, 2) NOT NULL DEFAULT 350  CHECK (tarifa_base_bs >= 0),
    precio_km_bs            NUMERIC(10, 2) NOT NULL DEFAULT 12   CHECK (precio_km_bs >= 0),
    factor_correccion_rural NUMERIC(4, 2)  NOT NULL DEFAULT 1.25 CHECK (factor_correccion_rural >= 1),
    capacidad_vehiculo_tons NUMERIC(8, 2)  NOT NULL DEFAULT 30   CHECK (capacidad_vehiculo_tons > 0),
    peso_minimo_tons        NUMERIC(8, 2)  NOT NULL DEFAULT 0.5  CHECK (peso_minimo_tons >= 0),
    pct_costo_mercaderia    NUMERIC(4, 3)  NOT NULL DEFAULT 0.60 CHECK (pct_costo_mercaderia BETWEEN 0 AND 1),
    pct_costo_logistico     NUMERIC(4, 3)  NOT NULL DEFAULT 0.70 CHECK (pct_costo_logistico BETWEEN 0 AND 1),
    actualizado_en          TIMESTAMPTZ DEFAULT NOW()
);
COMMENT ON TABLE parametros_flete IS 'Tarifas del algoritmo de flete y porcentajes de costo estimado (valores configurables).';
INSERT INTO parametros_flete (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- pedidos (HU03, HU04, HU05, HU08, HU09)
-- ------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS seq_codigo_pedido START 1000 INCREMENT 1;

CREATE TABLE IF NOT EXISTS pedidos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_pedido       TEXT UNIQUE,                    -- ESC-1000, ESC-1001, ...
    cliente_nombre      TEXT NOT NULL,
    cliente_telefono    TEXT NOT NULL,
    latitud             NUMERIC(10, 7) NOT NULL,
    longitud            NUMERIC(10, 7) NOT NULL,
    distancia_km        NUMERIC(8, 2)  NOT NULL DEFAULT 0 CHECK (distancia_km >= 0),
    fuente_calculo      TEXT NOT NULL DEFAULT 'haversine' CHECK (fuente_calculo IN ('google', 'haversine')),
    viajes              INT  NOT NULL DEFAULT 1 CHECK (viajes >= 1),
    peso_total_tons     NUMERIC(10, 2) NOT NULL CHECK (peso_total_tons > 0),
    subtotal_bs         NUMERIC(14, 2) NOT NULL DEFAULT 0,
    costo_flete_bs      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_bs            NUMERIC(14, 2) NOT NULL DEFAULT 0,
    costo_mercaderia_bs NUMERIC(14, 2) DEFAULT 0,       -- calculado por trigger
    costo_logistico_bs  NUMERIC(12, 2) DEFAULT 0,       -- calculado por trigger
    ganancia_neta_bs    NUMERIC(14, 2) DEFAULT 0,       -- calculado por trigger
    metodo_pago         TEXT NOT NULL DEFAULT 'QR' CHECK (metodo_pago IN ('QR', 'Transferencia', 'WhatsApp')),
    estado              TEXT NOT NULL DEFAULT 'Pendiente'
                        CHECK (estado IN ('Pendiente', 'En Camino', 'Entregado', 'Cancelado')),
    creado_en           TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en      TIMESTAMPTZ DEFAULT NOW()
);
-- Migración desde la versión 1 (si la tabla ya existía sin la columna)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS viajes INT NOT NULL DEFAULT 1;
-- Migración: ampliar el CHECK de estado para admitir 'Cancelado'
DO $$
DECLARE c TEXT;
BEGIN
    FOR c IN SELECT conname FROM pg_constraint
             WHERE conrelid = 'pedidos'::regclass AND contype = 'c'
               AND pg_get_constraintdef(oid) ILIKE '%estado%' AND pg_get_constraintdef(oid) NOT ILIKE '%Cancelado%'
    LOOP
        EXECUTE format('ALTER TABLE pedidos DROP CONSTRAINT %I', c);
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'pedidos'::regclass AND conname = 'pedidos_estado_check') THEN
        ALTER TABLE pedidos ADD CONSTRAINT pedidos_estado_check
            CHECK (estado IN ('Pendiente', 'En Camino', 'Entregado', 'Cancelado'));
    END IF;
END $$;

-- ------------------------------------------------------------
-- detalle_pedido (HU03): una línea por producto y pedido
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS detalle_pedido (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id     UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id   UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad_tons NUMERIC(10, 2) NOT NULL CHECK (cantidad_tons > 0),
    precio_ton_bs NUMERIC(12, 2) NOT NULL,              -- precio vigente al comprar (inmutable)
    subtotal_bs   NUMERIC(14, 2) NOT NULL,
    UNIQUE (pedido_id, producto_id)
);

-- ------------------------------------------------------------
-- historial_pedidos (HU08): trazabilidad de cada cambio de estado
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS historial_pedidos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id       UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    estado_anterior TEXT,
    estado_nuevo    TEXT NOT NULL,
    usuario         TEXT NOT NULL DEFAULT 'sistema',
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pedidos_estado    ON pedidos (estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_creado_en ON pedidos (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_detalle_pedido    ON detalle_pedido (pedido_id);
CREATE INDEX IF NOT EXISTS idx_detalle_producto  ON detalle_pedido (producto_id);
CREATE INDEX IF NOT EXISTS idx_historial_pedido  ON historial_pedidos (pedido_id, creado_en);

-- ------------------------------------------------------------
-- Triggers
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_generar_codigo_pedido() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.codigo_pedido IS NULL OR NEW.codigo_pedido = '' THEN
        NEW.codigo_pedido := 'ESC-' || nextval('seq_codigo_pedido');
    END IF;
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generar_codigo_pedido ON pedidos;
CREATE TRIGGER tr_generar_codigo_pedido BEFORE INSERT ON pedidos
    FOR EACH ROW EXECUTE FUNCTION fn_generar_codigo_pedido();

-- Indicadores financieros estimados (HU09) con los porcentajes de parametros_flete.
-- Debe coincidir con calcularFinancieros() del backend.
CREATE OR REPLACE FUNCTION fn_calcular_financieros() RETURNS TRIGGER AS $$
DECLARE pm NUMERIC; pl NUMERIC;
BEGIN
    SELECT pct_costo_mercaderia, pct_costo_logistico INTO pm, pl FROM parametros_flete WHERE id = 1;
    pm := COALESCE(pm, 0.60);
    pl := COALESCE(pl, 0.70);
    NEW.costo_mercaderia_bs := ROUND(NEW.subtotal_bs * pm, 2);
    NEW.costo_logistico_bs  := ROUND(NEW.costo_flete_bs * pl, 2);
    NEW.ganancia_neta_bs    := ROUND(NEW.total_bs - NEW.costo_mercaderia_bs - NEW.costo_logistico_bs, 2);
    NEW.actualizado_en      := NOW();
    RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_calcular_financieros ON pedidos;
CREATE TRIGGER tr_calcular_financieros BEFORE INSERT OR UPDATE ON pedidos
    FOR EACH ROW EXECUTE FUNCTION fn_calcular_financieros();

-- ------------------------------------------------------------
-- RPC crear_pedido: pedido + detalle + descuento de stock + historial, en UNA transacción.
-- Errores: STOCK_INSUFICIENTE:<producto>, PRODUCTO_NO_DISPONIBLE
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION crear_pedido(p_pedido JSONB, p_items JSONB) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_item RECORD;
    v_nombre TEXT;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'PEDIDO_SIN_ITEMS';
    END IF;

    INSERT INTO pedidos (cliente_nombre, cliente_telefono, latitud, longitud, distancia_km, fuente_calculo,
                         viajes, peso_total_tons, subtotal_bs, costo_flete_bs, total_bs, metodo_pago)
    VALUES (p_pedido->>'cliente_nombre', p_pedido->>'cliente_telefono',
            (p_pedido->>'latitud')::NUMERIC, (p_pedido->>'longitud')::NUMERIC,
            (p_pedido->>'distancia_km')::NUMERIC, p_pedido->>'fuente_calculo',
            (p_pedido->>'viajes')::INT, (p_pedido->>'peso_total_tons')::NUMERIC,
            (p_pedido->>'subtotal_bs')::NUMERIC, (p_pedido->>'costo_flete_bs')::NUMERIC,
            (p_pedido->>'total_bs')::NUMERIC, p_pedido->>'metodo_pago')
    RETURNING id INTO v_id;

    -- Orden fijo por producto para evitar bloqueos mutuos entre pedidos concurrentes
    FOR v_item IN
        SELECT (e->>'producto_id')::UUID AS producto_id, (e->>'cantidad_tons')::NUMERIC AS cantidad,
               (e->>'precio_ton_bs')::NUMERIC AS precio, (e->>'subtotal_bs')::NUMERIC AS subtotal
        FROM jsonb_array_elements(p_items) e ORDER BY 1
    LOOP
        UPDATE productos SET stock_tons = stock_tons - v_item.cantidad
         WHERE id = v_item.producto_id AND activo AND stock_tons >= v_item.cantidad;
        IF NOT FOUND THEN
            SELECT nombre INTO v_nombre FROM productos WHERE id = v_item.producto_id AND activo;
            IF v_nombre IS NULL THEN RAISE EXCEPTION 'PRODUCTO_NO_DISPONIBLE'; END IF;
            RAISE EXCEPTION 'STOCK_INSUFICIENTE: %', v_nombre;
        END IF;
        INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad_tons, precio_ton_bs, subtotal_bs)
        VALUES (v_id, v_item.producto_id, v_item.cantidad, v_item.precio, v_item.subtotal);
    END LOOP;

    INSERT INTO historial_pedidos (pedido_id, estado_anterior, estado_nuevo, usuario)
    VALUES (v_id, NULL, 'Pendiente', COALESCE(p_pedido->>'usuario', 'cliente'));
    RETURN v_id;
END; $$ LANGUAGE plpgsql;

-- ------------------------------------------------------------
-- RPC actualizar_estado_pedido: valida la transición, restituye stock al cancelar, registra historial.
-- Errores: PEDIDO_NO_ENCONTRADO, TRANSICION_INVALIDA
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION actualizar_estado_pedido(p_id UUID, p_estado TEXT, p_usuario TEXT DEFAULT 'sistema')
RETURNS VOID AS $$
DECLARE v_actual TEXT; v_ok BOOLEAN;
BEGIN
    SELECT estado INTO v_actual FROM pedidos WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_NO_ENCONTRADO'; END IF;
    IF v_actual = p_estado THEN RETURN; END IF;

    v_ok := (v_actual = 'Pendiente'  AND p_estado IN ('En Camino', 'Entregado', 'Cancelado'))
         OR (v_actual = 'En Camino'  AND p_estado IN ('Pendiente', 'Entregado', 'Cancelado'));
    IF NOT v_ok THEN RAISE EXCEPTION 'TRANSICION_INVALIDA: % -> %', v_actual, p_estado; END IF;

    IF p_estado = 'Cancelado' THEN
        UPDATE productos p SET stock_tons = p.stock_tons + d.cantidad_tons
          FROM detalle_pedido d WHERE d.pedido_id = p_id AND d.producto_id = p.id;
    END IF;

    UPDATE pedidos SET estado = p_estado WHERE id = p_id;
    INSERT INTO historial_pedidos (pedido_id, estado_anterior, estado_nuevo, usuario)
    VALUES (p_id, v_actual, p_estado, COALESCE(p_usuario, 'sistema'));
END; $$ LANGUAGE plpgsql;

-- Las funciones solo las ejecuta el backend (service_role)
REVOKE ALL ON FUNCTION crear_pedido(JSONB, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION actualizar_estado_pedido(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION crear_pedido(JSONB, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION actualizar_estado_pedido(UUID, TEXT, TEXT) TO service_role;

-- ------------------------------------------------------------
-- Datos semilla: catálogo inicial (HU02). Solo si el catálogo está vacío.
-- ------------------------------------------------------------
INSERT INTO productos (nombre, descripcion, precio_ton, stock_tons, factor_flete)
SELECT * FROM (VALUES
    ('Silo de Maíz', 'Alimento balanceado y fermentado de alta calidad para ganado bovino, elaborado con maíz seleccionado de Santa Cruz. Ideal para complementar dietas en época seca.', 450.00, 5000.00, 1.2),
    ('Soya', 'Grano de soya certificado, rico en proteínas para nutrición animal e industria alimentaria. Alta demanda en el mercado cruceño.', 1800.00, 2500.00, 1.5),
    ('Sorgo', 'Excelente alternativa forrajera y energética con alta tolerancia a la sequía. Recurso estratégico en temporadas de escasez hídrica del oriente boliviano.', 350.00, 4000.00, 1.0)
) AS s(nombre, descripcion, precio_ton, stock_tons, factor_flete)
WHERE NOT EXISTS (SELECT 1 FROM productos);

-- ------------------------------------------------------------
-- Row Level Security: todo bloqueado salvo lectura pública de productos activos.
-- El backend (service_role) omite RLS; el navegador nunca accede directamente a las tablas.
-- ------------------------------------------------------------
ALTER TABLE productos         ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_pedido    ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametros_flete  ENABLE ROW LEVEL SECURITY;

-- Se eliminan políticas permisivas de la versión 1 si existían
DROP POLICY IF EXISTS "productos_admin_full"        ON productos;
DROP POLICY IF EXISTS "pedidos_insercion_publica"   ON pedidos;
DROP POLICY IF EXISTS "pedidos_admin_lectura"       ON pedidos;
DROP POLICY IF EXISTS "pedidos_admin_update"        ON pedidos;
DROP POLICY IF EXISTS "detalle_insercion_publica"   ON detalle_pedido;
DROP POLICY IF EXISTS "detalle_admin_lectura"       ON detalle_pedido;

DROP POLICY IF EXISTS "productos_lectura_publica" ON productos;
CREATE POLICY "productos_lectura_publica" ON productos FOR SELECT USING (activo = true);

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================
