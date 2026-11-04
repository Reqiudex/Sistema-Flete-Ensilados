-- ============================================================
-- Datos de DEMOSTRACIÓN (opcional) – Ensilados Santa Cruz
-- Catálogo de ejemplo de la tesis. No contiene usuarios, contraseñas ni datos de clientes.
-- Idempotente: inserta solo los productos que falten (por nombre) y reactiva los desactivados. Ejecutar después de schema.sql
-- (en producción con esquema propio: SET search_path = tesis, public; antes del script).
-- ============================================================
INSERT INTO productos (nombre, descripcion, precio_ton, stock_tons, factor_flete)
SELECT s.nombre, s.descripcion, s.precio_ton, s.stock_tons, s.factor_flete
FROM (VALUES
    ('Silo de Maíz', 'Alimento balanceado y fermentado de alta calidad para ganado bovino, elaborado con maíz seleccionado de Santa Cruz. Ideal para complementar dietas en época seca.', 450.00, 5000.00, 1.2),
    ('Soya', 'Grano de soya certificado, rico en proteínas para nutrición animal e industria alimentaria. Alta demanda en el mercado cruceño.', 1800.00, 2500.00, 1.5),
    ('Sorgo', 'Excelente alternativa forrajera y energética con alta tolerancia a la sequía. Recurso estratégico en temporadas de escasez hídrica del oriente boliviano.', 350.00, 4000.00, 1.0)
) AS s(nombre, descripcion, precio_ton, stock_tons, factor_flete)
WHERE NOT EXISTS (SELECT 1 FROM productos p WHERE p.nombre = s.nombre);

UPDATE productos p SET activo = true
WHERE p.nombre IN ('Silo de Maíz', 'Soya', 'Sorgo') AND NOT p.activo;
