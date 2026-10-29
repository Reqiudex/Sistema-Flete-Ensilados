# Guía de usuario — Ensilados Santa Cruz

Esta guía describe el uso del sistema web desde la perspectiva del **cliente** (quien compra) y del **personal administrativo** (Admin y Superadmin). Todas las pantallas y botones citados corresponden a la versión actual del sistema.

---

## Parte 1. Cliente (no requiere registro)

### 1.1 Conocer la empresa y los productos (HU01, HU02)
1. Abra la página principal. Verá la presentación, los servicios, la historia, misión y visión.
2. Pulse **Cotizar Ensilado y Flete** para ir al catálogo con **Silo de Maíz, Soya y Sorgo**, su precio por tonelada y la disponibilidad en planta.

### 1.2 Armar el pedido (HU03)
1. En cada producto escriba las **toneladas** (múltiplos de 0,5; mínimo 0,5 TM por pedido) y pulse **Agregar**. No se puede pedir más de lo disponible.
2. En el **Carrito de Compra** puede cambiar cantidades o quitar productos. Se muestran el peso total y el subtotal del material.
3. Pulse **Continuar Cotización**.

### 1.3 Términos y condiciones
Lea los términos y marque la casilla de aceptación (incluye el consentimiento para usar su ubicación solo para calcular el flete). Pulse **Continuar a Ubicación**.

### 1.4 Datos y ubicación de entrega (HU04, HU05)
1. Escriba su **nombre completo** y su **celular** (8 dígitos, por ejemplo 78945612; también se acepta fijo de 7 dígitos o con +591).
2. Elija el **método de pago** (QR, Transferencia o WhatsApp). El pago se coordina fuera del sistema; la plataforma no cobra en línea.
3. **Arrastre el marcador rojo** del mapa hasta su finca. El sistema calcula en el momento: distancia, viajes necesarios (un viaje por cada 30 TM o fracción), costo de flete y total estimado.
4. Pulse **Confirmar y Enviar Pedido**.

> El servidor vuelve a calcular precios y flete al registrar el pedido; si hubo cambios en el catálogo, el total definitivo es el que muestra la confirmación.

### 1.5 Confirmación
Recibirá un **código de pedido** (formato `ESC-1004`). Desde esa pantalla puede **descargar el comprobante en PDF** y **enviar el resumen por WhatsApp** a la empresa. El código y el comprobante no son documentos fiscales; la factura se emite aparte.

### 1.6 Trabajar sin señal (zonas rurales)
- Si no hay conexión, el catálogo muestra el **último catálogo guardado** y aparece un aviso.
- Si el mapa de Google no carga, pulse **Usar Cotizador Offline** e indique con el deslizador la **distancia aproximada** a San Ramón. El flete se estima con la misma fórmula del servidor.
- Si al enviar el pedido no hay internet, queda **guardado en su dispositivo** (pantalla "Pedido Guardado en su Dispositivo") y **se envía solo** cuando vuelva la señal, siempre que abra la aplicación. Al enviarse recibirá el código definitivo. Si en ese tiempo se agotó el stock, se le avisará que el pedido no pudo registrarse.
- El flete y el total definitivos los confirma siempre el servidor.

### 1.7 Problemas frecuentes
| Mensaje | Qué hacer |
|---|---|
| "Ingrese un número válido…" | Escriba un celular de 8 dígitos que empiece con 6 o 7 |
| "El pedido mínimo es de 0,5 toneladas" | Aumente la cantidad |
| "Solo hay X TM disponibles" / "Stock insuficiente" | Reduzca la cantidad; otro cliente pudo comprar antes |
| "Las coordenadas están fuera del área de cobertura" | Mueva el marcador a un punto dentro de Bolivia |

---

## Parte 2. Personal administrativo

### 2.1 Ingreso (HU06)
1. En el menú superior, abra **Administración**.
2. Escriba su correo y contraseña. **No hay cuentas de ejemplo**: el primer Superadmin se crea al instalar el sistema (ver README).
3. Si tiene activado el doble factor, ingrese el **código de 6 dígitos** de su aplicación autenticadora (Google Authenticator, Authy o Microsoft Authenticator). Tras 10 intentos fallidos debe esperar unos minutos.
4. La sesión dura 8 horas. Use **Cerrar sesión** (icono de salida) al terminar.

**Permisos**

| Función | Admin | Superadmin |
|---|:--:|:--:|
| Estadísticas, pedidos, ventas directas, CSV/PDF | ✔ | ✔ |
| Crear y editar productos | ✔ | ✔ |
| Desactivar / reactivar productos | — | ✔ |
| Administrar usuarios | — | ✔ |
| Editar tarifas de flete | — | ✔ |
| Contraseña propia y 2FA | ✔ | ✔ |

### 2.2 Estadísticas (HU09)
Pestaña **Estadísticas & CRM**: ventas totales, ganancia neta estimada, toneladas, pedidos pendientes, flete promedio y gráficos (tendencia mensual, ganancia vs. costos, ventas por producto). Los **pedidos cancelados no se cuentan**. Use el filtro **Desde / Hasta** de la pestaña *Gestión Pedidos* para acotar el período; el panel se actualiza con ese rango. **Exportar Reporte PDF** genera el informe de lo que está en pantalla.
> Costos y ganancia son **estimaciones**: se calculan con porcentajes configurables (por defecto 60 % del subtotal para mercadería y 70 % del flete para logística).

### 2.3 Gestión de pedidos (HU08)
Pestaña **Gestión Pedidos**:
- Filtre por estado (Todos, Pendiente, En Camino, Entregado, Cancelado) y por fechas.
- Cambie el **estado** con el selector. Solo se ofrecen las transiciones permitidas: *Pendiente ⇄ En Camino*, y desde cualquiera de ellos a *Entregado* o *Cancelado*. **Entregado y Cancelado son finales.**
- **Cancelar** (icono ✕) pide confirmación y **devuelve el stock** al inventario. Los pedidos no se eliminan: quedan registrados con su historial de estados (quién y cuándo).
- En pedidos *En Camino* el botón **Ruta** abre Google Maps con el trayecto planta → finca para el chofer.
- **Exportar CSV** descarga los pedidos filtrados (separador `;`, abre directo en Excel).
- **Nuevo Pedido Manual** registra una venta directa: cliente, celular, método de pago, producto, toneladas y coordenadas. El **flete y el total se calculan solos** y se descuenta el stock.

### 2.4 Productos (HU07)
Pestaña **Productos**: **Agregar Producto** (nombre, descripción, precio por tonelada, stock y factor de flete) y el lápiz para editar. El **factor de flete** suma `toneladas × factor` al costo del transporte (productos más voluminosos o frágiles, mayor factor). El Superadmin puede **Desactivar** un producto (deja de verse en el catálogo pero los pedidos antiguos lo conservan) y **Reactivarlo**.

### 2.5 Administradores (solo Superadmin)
Pestaña **Administradores**: crear usuarios (correo, contraseña de 8+ caracteres, rol), cambiar rol o restablecer contraseña, y eliminar. No se puede eliminar la propia cuenta ni al último Superadmin.

### 2.6 Tarifas de flete (solo Superadmin)
Pestaña **Tarifas de Flete**: tarifa base por viaje (350 Bs), precio por km (12 Bs), factor de corrección rural (1,25), capacidad por viaje (30 TM), pedido mínimo (0,5 TM) y porcentajes de costo estimado. Los cambios rigen desde la siguiente cotización. Los pedidos ya registrados conservan sus importes.

### 2.7 Mi cuenta y doble factor (HU06)
Pestaña **Mi Cuenta & 2FA**:
- **Cambiar contraseña**: exige la contraseña actual y una nueva de 8 a 72 caracteres.
- **Activar doble factor**: pulse *Activar Doble Factor*, escanee el **código QR** con su aplicación (o escriba la clave manual) e ingrese el código de 6 dígitos para confirmar. Desde ese momento, cada ingreso pedirá el código.
- **Desactivar**: requiere su contraseña y un código vigente.
- Si pierde el celular, otro Superadmin puede restablecer su contraseña y desactivar su 2FA directamente en la base de datos (campo `dos_factores_activo`).

### 2.8 Sincronización
El indicador superior muestra **Conectado al servidor** o **Sin conexión**. El botón de flechas recarga pedidos, productos y usuarios. El panel administrativo **requiere conexión**: no funciona sin internet.
