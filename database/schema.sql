-- Database schema for Ensilados Santa Cruz
-- This script can be run directly in the Supabase SQL Editor or standard PostgreSQL.

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: products
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    unit_price_ton NUMERIC NOT NULL DEFAULT 0,
    stock_tons NUMERIC NOT NULL DEFAULT 0,
    factor_flete NUMERIC NOT NULL DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: profiles (Admin and Superadmin users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, -- Hashed passwords for security
    role TEXT NOT NULL CHECK (role IN ('Admin', 'Superadmin')),
    two_factor_secret TEXT,
    two_factor_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sequence for ESC-XXXX order codes
CREATE SEQUENCE IF NOT EXISTS order_code_seq START 1000;

-- Table: orders
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_code TEXT UNIQUE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    lat NUMERIC NOT NULL,
    lng NUMERIC NOT NULL,
    total_weight_tons NUMERIC NOT NULL DEFAULT 0,
    shipping_cost NUMERIC NOT NULL DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    payment_method TEXT NOT NULL, -- QR, Transferencia, WhatsApp
    status TEXT NOT NULL DEFAULT 'Pendiente', -- Pendiente, En Camino, Entregado
    cost_items_bs NUMERIC NOT NULL DEFAULT 0, -- Margen de costo de mercadería
    cost_logistics_bs NUMERIC NOT NULL DEFAULT 0, -- Costo operativo real del flete
    net_profit_bs NUMERIC NOT NULL DEFAULT 0, -- Ganancia neta
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: order_items
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity_tons NUMERIC NOT NULL,
    subtotal NUMERIC NOT NULL
);

-- Trigger to auto-generate the ESC-XXXX code
CREATE OR REPLACE FUNCTION set_order_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.order_code IS NULL OR NEW.order_code = '' THEN
        NEW.order_code := 'ESC-' || nextval('order_code_seq');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_set_order_code
BEFORE INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION set_order_code();

-- Trigger to auto-calculate order financial fields
CREATE OR REPLACE FUNCTION set_order_financials()
RETURNS TRIGGER AS $$
BEGIN
    -- Costo del producto = 60% del subtotal (total menos envío)
    NEW.cost_items_bs := ROUND((NEW.total_amount - NEW.shipping_cost) * 0.60, 2);
    -- Costo de flete = 70% del costo cobrado de flete
    NEW.cost_logistics_bs := ROUND(NEW.shipping_cost * 0.70, 2);
    -- Ganancia neta = Total - Costo Producto - Costo Flete
    NEW.net_profit_bs := ROUND(NEW.total_amount - NEW.cost_items_bs - NEW.cost_logistics_bs, 2);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER tr_set_order_financials
BEFORE INSERT OR UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION set_order_financials();

-- Insert Seed Products
INSERT INTO products (name, description, unit_price_ton, stock_tons, factor_flete)
VALUES 
('Silo de maíz', 'Alimento balanceado y fermentado de alta calidad para ganado, elaborado con maíz seleccionado de Santa Cruz.', 450.00, 5000.0, 1.2),
('Soya', 'Grano de soya rico en proteínas para nutrición animal e industrial.', 1800.00, 2500.0, 1.5),
('Sorgo', 'Excelente alternativa forrajera y energética con alta tolerancia a la sequía.', 350.00, 4000.0, 1.0)
ON CONFLICT DO NOTHING;

-- Insert Seed Admin & Superadmin profiles
-- Passwords:
-- superadmin@ensilados.com -> superadmin123 (Hash: $2b$10$rY78H0Kq8i4tVbQy5L0wQ.oBw8mZgA.kU1U8E1S/yA4Uu7p3N2pG.)
-- admin@ensilados.com -> admin123 (Hash: $2b$10$wN1d3K9e3v1WzTq5D7.XyOqU2.j8Q9u4lD72.K.6p1oW5Yh1i3DqS)
INSERT INTO profiles (email, password_hash, role, two_factor_enabled)
VALUES
('superadmin@ensilados.com', '$2b$10$rY78H0Kq8i4tVbQy5L0wQ.oBw8mZgA.kU1U8E1S/yA4Uu7p3N2pG.', 'Superadmin', false),
('admin@ensilados.com', '$2b$10$wN1d3K9e3v1WzTq5D7.XyOqU2.j8Q9u4lD72.K.6p1oW5Yh1i3DqS', 'Admin', false)
ON CONFLICT DO NOTHING;

-- Enable Realtime for tables
ALTER publication supabase_realtime ADD TABLE orders;
ALTER publication supabase_realtime ADD TABLE order_items;
ALTER publication supabase_realtime ADD TABLE products;
ALTER publication supabase_realtime ADD TABLE profiles;
