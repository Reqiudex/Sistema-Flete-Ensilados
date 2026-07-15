-- ============================================================
-- SISTEMA DE GESTIÓN DE FLETES Y PEDIDOS
-- Ensilados Santa Cruz | Tesis de Grado
-- ============================================================
-- Autor:    Sistema desarrollado conforme al Product Backlog
-- Sprint:   Sprint 1 al 4 (HU01–HU09)
-- Motor:    PostgreSQL 15+ / Supabase
-- Origen:   Planta San Ramón, Santa Cruz, Bolivia
--           Coordenadas: LAT -16.6133, LNG -62.4994
-- ============================================================

-- Habilitamos la extensión para generación de UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- TABLA: productos
-- HU02 – Consulta interactiva del catálogo de productos
-- HU07 – CRUD de productos (panel administrativo)
-- ============================================================
-- Almacena el catálogo de ensilados disponibles para venta.
-- Los tres productos base son: Silo de Maíz, Soya y Sorgo.
-- El campo `factor_flete` es un multiplicador de peso que
-- ajusta el costo de transporte según la densidad del producto.
-- ============================================================
CREATE TABLE IF NOT EXISTS productos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre          TEXT NOT NULL,
    descripcion     TEXT,
    precio_ton      NUMERIC(12, 2) NOT NULL DEFAULT 0
                    CHECK (precio_ton >= 0),       -- Precio por Tonelada Métrica en Bs.
    stock_tons      NUMERIC(10, 2) NOT NULL DEFAULT 0
                    CHECK (stock_tons >= 0),        -- Toneladas disponibles en planta
    factor_flete    NUMERIC(4, 2) NOT NULL DEFAULT 1.0
                    CHECK (factor_flete > 0),       -- Multiplicador logístico por densidad
    activo          BOOLEAN NOT NULL DEFAULT true,  -- Control de visibilidad en catálogo
    creado_en       TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE  productos IS 'Catálogo de productos agrícolas ensilados. Fuente: HU02, HU07.';
COMMENT ON COLUMN productos.precio_ton   IS 'Precio unitario por Tonelada Métrica en Bolivianos (Bs.).';
COMMENT ON COLUMN productos.factor_flete IS 'Multiplicador de costo de flete según densidad del producto.';
COMMENT ON COLUMN productos.stock_tons   IS 'Disponibilidad actual en toneladas en la planta de San Ramón.';


-- ============================================================
-- TABLA: usuarios
-- HU06 – Autenticación segura de administrador (JWT)
-- ============================================================
-- Almacena las credenciales del personal administrativo.
-- Los roles permitidos son: 'Admin' y 'Superadmin'.
-- Las contraseñas se almacenan con hash bcrypt (cost factor 10).
-- Esta tabla NO gestiona clientes; los clientes son anónimos.
-- ============================================================
CREATE TABLE IF NOT EXISTS usuarios (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email                TEXT UNIQUE NOT NULL,
    password_hash        TEXT NOT NULL,             -- Hash bcrypt de la contraseña
    rol                  TEXT NOT NULL
                         CHECK (rol IN ('Admin', 'Superadmin')),
    dos_factores_secreto TEXT,                      -- Secreto TOTP (2FA opcional)
    dos_factores_activo  BOOLEAN DEFAULT false,
    creado_en            TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE  usuarios IS 'Usuarios administrativos del sistema. Solo Admin y Superadmin. Fuente: HU06.';
COMMENT ON COLUMN usuarios.rol IS 'Nivel de acceso: Admin (lectura/escritura) o Superadmin (control total).';


-- ============================================================
-- SECUENCIA: Generador del código de pedido ESC-XXXX
-- HU03 – Registro ágil de pedidos en Supabase
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS seq_codigo_pedido START 1000 INCREMENT 1;


-- ============================================================
-- TABLA: pedidos
-- HU03 – Registro ágil de pedidos sin login
-- HU04 – Selección del punto de entrega con Google Maps
-- HU05 – Algoritmo de cálculo de flete
-- HU08 – Gestión de estados de despacho
-- HU09 – Reportes gráficos de ventas
-- ============================================================
-- Registro transaccional principal. Un pedido captura:
--   • Datos mínimos de contacto del cliente (sin registro)
--   • Coordenadas GPS del punto de entrega (Google Maps)
--   • Resultado del algoritmo de flete (distancia + costo)
--   • Totales financieros y margen estimado para reportes
-- ============================================================
CREATE TABLE IF NOT EXISTS pedidos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_pedido       TEXT UNIQUE,                -- Código legible: ESC-1000, ESC-1001, ...

    -- Datos del cliente anónimo (sin registro obligatorio)
    cliente_nombre      TEXT NOT NULL,
    cliente_telefono    TEXT NOT NULL,

    -- Geolocalización del punto de entrega (HU04)
    latitud             NUMERIC(10, 7) NOT NULL,
    longitud            NUMERIC(10, 7) NOT NULL,

    -- Resultado del algoritmo de flete (HU05)
    distancia_km        NUMERIC(8, 2) NOT NULL DEFAULT 0
                        CHECK (distancia_km >= 0),
    fuente_calculo      TEXT NOT NULL DEFAULT 'haversine'
                        CHECK (fuente_calculo IN ('google', 'haversine')),
    -- 'google'    = distancia real de ruta terrestre (Distance Matrix API)
    -- 'haversine' = distancia en línea recta con factor de corrección rural

    -- Resumen financiero del pedido
    peso_total_tons     NUMERIC(10, 2) NOT NULL DEFAULT 0
                        CHECK (peso_total_tons > 0),
    subtotal_bs         NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- Subtotal solo de productos
    costo_flete_bs      NUMERIC(12, 2) NOT NULL DEFAULT 0,   -- Costo total del flete
    total_bs            NUMERIC(14, 2) NOT NULL DEFAULT 0,   -- Total a pagar (subtotal + flete)

    -- Campos calculados para reportes analíticos (HU09)
    -- Inyectados automáticamente por el trigger tr_calcular_financieros
    costo_mercaderia_bs NUMERIC(14, 2) DEFAULT 0,  -- Costo operativo de los productos (~60% subtotal)
    costo_logistico_bs  NUMERIC(12, 2) DEFAULT 0,  -- Costo real del transporte (~70% del flete cobrado)
    ganancia_neta_bs    NUMERIC(14, 2) DEFAULT 0,  -- Margen neto estimado

    -- Método de pago acordado (coordinación externa, no pago online)
    metodo_pago         TEXT NOT NULL DEFAULT 'QR'
                        CHECK (metodo_pago IN ('QR', 'Transferencia', 'WhatsApp')),

    -- Estado de despacho (HU08)
    estado              TEXT NOT NULL DEFAULT 'Pendiente'
                        CHECK (estado IN ('Pendiente', 'En Camino', 'Entregado', 'Cancelado')),

    creado_en           TIMESTAMPTZ DEFAULT NOW(),
    actualizado_en      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE  pedidos IS 'Registro transaccional de pedidos. Captura datos de cliente, geolocalización y flete. Fuente: HU03, HU04, HU05, HU08.';
COMMENT ON COLUMN pedidos.fuente_calculo IS 'Indica si la distancia fue calculada por Google Maps API (preferido) o por fórmula Haversine (contingencia offline).';
COMMENT ON COLUMN pedidos.codigo_pedido  IS 'Código legible autogenerado por trigger. Formato: ESC-NNNN.';


-- ============================================================
-- TABLA: detalle_pedido
-- HU03 – Ítems individuales de cada pedido (relación N:M)
-- ============================================================
-- Detalle de los productos y cantidades por pedido.
-- Permite calcular subtotales por producto y reportes por ítem.
-- ============================================================
CREATE TABLE IF NOT EXISTS detalle_pedido (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pedido_id       UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    producto_id     UUID NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
    cantidad_tons   NUMERIC(10, 2) NOT NULL CHECK (cantidad_tons > 0),
    precio_ton_bs   NUMERIC(12, 2) NOT NULL,        -- Precio snapshot al momento de la compra
    subtotal_bs     NUMERIC(14, 2) NOT NULL          -- cantidad_tons * precio_ton_bs
);

COMMENT ON TABLE  detalle_pedido IS 'Ítems de cada pedido con snapshot de precio. Fuente: HU03.';
COMMENT ON COLUMN detalle_pedido.precio_ton_bs IS 'Precio por TM capturado al momento del pedido (inmutable aunque el catálogo cambie).';


-- ============================================================
-- ÍNDICES de rendimiento para consultas frecuentes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pedidos_estado      ON pedidos (estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_creado_en   ON pedidos (creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_codigo      ON pedidos (codigo_pedido);
CREATE INDEX IF NOT EXISTS idx_detalle_pedido_id   ON detalle_pedido (pedido_id);
CREATE INDEX IF NOT EXISTS idx_detalle_producto_id ON detalle_pedido (producto_id);


-- ============================================================
-- TRIGGER 1: Generación automática del código ESC-XXXX
-- ============================================================
CREATE OR REPLACE FUNCTION fn_generar_codigo_pedido()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.codigo_pedido IS NULL OR NEW.codigo_pedido = '' THEN
        NEW.codigo_pedido := 'ESC-' || nextval('seq_codigo_pedido');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generar_codigo_pedido ON pedidos;
CREATE TRIGGER tr_generar_codigo_pedido
    BEFORE INSERT ON pedidos
    FOR EACH ROW
    EXECUTE FUNCTION fn_generar_codigo_pedido();


-- ============================================================
-- TRIGGER 2: Cálculo automático de campos financieros
-- Para reportes de rentabilidad (HU09)
-- ============================================================
-- Lógica de negocio aplicada automáticamente en BD:
--   costo_mercaderia = 60% del subtotal de productos
--   costo_logistico  = 70% del flete cobrado (costo real del transporte)
--   ganancia_neta    = total - costo_mercaderia - costo_logistico
-- ============================================================
CREATE OR REPLACE FUNCTION fn_calcular_financieros()
RETURNS TRIGGER AS $$
BEGIN
    NEW.costo_mercaderia_bs := ROUND((NEW.subtotal_bs) * 0.60, 2);
    NEW.costo_logistico_bs  := ROUND(NEW.costo_flete_bs * 0.70, 2);
    NEW.ganancia_neta_bs    := ROUND(
        NEW.total_bs - NEW.costo_mercaderia_bs - NEW.costo_logistico_bs,
    2);
    NEW.actualizado_en := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_calcular_financieros ON pedidos;
CREATE TRIGGER tr_calcular_financieros
    BEFORE INSERT OR UPDATE ON pedidos
    FOR EACH ROW
    EXECUTE FUNCTION fn_calcular_financieros();


-- ============================================================
-- TRIGGER 3: Actualizar timestamp en modificaciones
-- ============================================================
CREATE OR REPLACE FUNCTION fn_actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- (Ya incluido en fn_calcular_financieros, aquí como referencia)


-- ============================================================
-- DATOS SEMILLA: Catálogo inicial de productos (HU02)
-- ============================================================
INSERT INTO productos (nombre, descripcion, precio_ton, stock_tons, factor_flete)
VALUES
    (
        'Silo de Maíz',
        'Alimento balanceado y fermentado de alta calidad para ganado bovino, elaborado con maíz seleccionado de Santa Cruz. Ideal para complementar dietas en época seca.',
        450.00,
        5000.00,
        1.2   -- Factor alto por mayor volumen/densidad por TM
    ),
    (
        'Soya',
        'Grano de soya certificado, rico en proteínas para nutrición animal e industria alimentaria. Alta demanda en el mercado cruceño.',
        1800.00,
        2500.00,
        1.5   -- Factor más alto por fragilidad logística
    ),
    (
        'Sorgo',
        'Excelente alternativa forrajera y energética con alta tolerancia a la sequía. Recurso estratégico en temporadas de escasez hídrica del oriente boliviano.',
        350.00,
        4000.00,
        1.0   -- Factor base, producto estándar
    )
ON CONFLICT DO NOTHING;


-- ============================================================
-- DATOS SEMILLA: Usuarios administrativos (HU06)
-- ============================================================
-- IMPORTANTE: Reemplazar estos hashes con hashes reales en producción.
-- Los hashes abajo corresponden a:
--   superadmin@ensilados.com → contraseña: superadmin123
--   admin@ensilados.com      → contraseña: admin123
-- Generados con bcrypt, cost factor 10.
-- ============================================================
INSERT INTO usuarios (email, password_hash, rol, dos_factores_activo)
VALUES
    (
        'superadmin@ensilados.com',
        '$2b$10$rY78H0Kq8i4tVbQy5L0wQ.oBw8mZgA.kU1U8E1S/yA4Uu7p3N2pG.',
        'Superadmin',
        false
    ),
    (
        'admin@ensilados.com',
        '$2b$10$wN1d3K9e3v1WzTq5D7.XyOqU2.j8Q9u4lD72.K.6p1oW5Yh1i3DqS',
        'Admin',
        false
    )
ON CONFLICT (email) DO NOTHING;


-- ============================================================
-- SUPABASE: Habilitar Realtime para sincronización en tiempo real
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE pedidos;
ALTER PUBLICATION supabase_realtime ADD TABLE detalle_pedido;
ALTER PUBLICATION supabase_realtime ADD TABLE productos;


-- ============================================================
-- SUPABASE: Row Level Security (RLS)
-- Protege los datos según el rol del usuario autenticado
-- ============================================================

-- Tabla productos: Lectura pública, escritura solo admin
ALTER TABLE productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "productos_lectura_publica"
    ON productos FOR SELECT
    USING (activo = true);  -- Clientes solo ven productos activos

CREATE POLICY "productos_admin_full"
    ON productos FOR ALL
    USING (auth.role() = 'authenticated');  -- Admins ven y modifican todo

-- Tabla pedidos: Solo admins pueden leer todos; inserción pública (HU03)
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pedidos_insercion_publica"
    ON pedidos FOR INSERT
    WITH CHECK (true);  -- Cualquier usuario puede crear un pedido (sin login)

CREATE POLICY "pedidos_admin_lectura"
    ON pedidos FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "pedidos_admin_update"
    ON pedidos FOR UPDATE
    USING (auth.role() = 'authenticated');

-- Tabla detalle_pedido: mismas reglas que pedidos
ALTER TABLE detalle_pedido ENABLE ROW LEVEL SECURITY;

CREATE POLICY "detalle_insercion_publica"
    ON detalle_pedido FOR INSERT
    WITH CHECK (true);

CREATE POLICY "detalle_admin_lectura"
    ON detalle_pedido FOR SELECT
    USING (auth.role() = 'authenticated');

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================
