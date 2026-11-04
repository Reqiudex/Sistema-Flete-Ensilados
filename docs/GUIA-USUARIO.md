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
2. Elija el **método de pago**: **QR** (paga desde la app de su banco y se confirma solo), **Transferencia** o **WhatsApp** (los verifica el personal). La plataforma no procesa tarjetas ni guarda datos bancarios.
3. **Arrastre el marcador rojo** del mapa hasta su finca. El sistema calcula en el momento: distancia, viajes necesarios (un viaje por cada 30 TM o fracción), costo de flete y total estimado.
4. Pulse **Confirmar y Enviar Pedido**.

> El servidor vuelve a calcular precios y flete al registrar el pedido; si hubo cambios en el catálogo, el total definitivo es el que muestra la confirmación.

### 1.5 Confirmación
Recibirá un **código de pedido** (formato `ESC-1004`). Desde esa pantalla puede **descargar el comprobante en PDF** y **enviar el resumen por WhatsApp** a la empresa. El código y el comprobante no son documentos fiscales; la factura se emite aparte.

### 1.5.1 Pagar con QR (HU10)
Si eligió **QR**, el cobro se crea automáticamente al registrar el pedido y la confirmación muestra el recuadro **Pago con QR**:
1. **Pague exactamente** el monto grande que aparece, con centavos (por ejemplo *Bs 3.035,36*). Es el total del pedido más un centavo que identifica su pago; si paga otro monto, no se confirma solo.
2. Pulse **Abrir el QR del banco y pagar** (o, en la computadora, escanee con el celular el código que aparece debajo), escanee el QR con la aplicación de su banco y pague.
3. La cuenta regresiva (**Vence en mm:ss**, 10 minutos por defecto) indica cuánto tiempo tiene. Mantenga la pantalla abierta: se actualiza sola cada pocos segundos y muestra **Pago confirmado** cuando el banco lo confirma (normalmente en 1–2 minutos).
4. Si el cobro vence antes de pagar, pulse **Generar nuevo cobro** (no pague un cobro vencido: el monto puede cambiar en centavos).
5. Si la pasarela no responde en ese momento, el pedido queda igualmente registrado como **Pendiente de pago** y aparece el botón **Reintentar pago**.
6. Si pagó un monto distinto o un cobro ya vencido, el pago queda **en revisión** y el personal lo confirmará.
7. Puede cerrar la página: el enlace de retorno de la pasarela (`…/?pedido=ESC-1234`) vuelve a mostrar el estado del pago de su pedido.

Si el pago QR no está disponible, solo verá *Transferencia* y *WhatsApp*. Los pedidos guardados sin conexión no generan cobro hasta que se envían al servidor; entonces el cobro se crea automáticamente.

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
Arriba se resume la **cobranza**: *Ventas pagadas* (QR, efectivo y verificadas), *Pendientes de pago* y *Pagos en revisión*, con el botón **Cobranza CSV**. El **Reporte PDF** incluye la misma tabla de pagadas vs. pendientes.

Pestaña **Estadísticas & CRM**: ventas totales, ganancia neta estimada, toneladas, pedidos pendientes, **cobrado y por cobrar**, flete promedio y gráficos (tendencia mensual, ganancia vs. costos, ventas por producto). Los **pedidos cancelados no se cuentan**. Use el filtro **Desde / Hasta** de la pestaña *Gestión Pedidos* para acotar el período; el panel se actualiza con ese rango. **Exportar Reporte PDF** genera el informe de lo que está en pantalla.
> Costos y ganancia son **estimaciones**: se calculan con porcentajes configurables (por defecto 60 % del subtotal para mercadería y 70 % del flete para logística).

### 2.3 Gestión de pedidos (HU08)
Pestaña **Gestión Pedidos**:
- Filtre por estado (Todos, Pendiente, En Camino, Entregado, Cancelado) y por fechas.
- Cambie el **estado** con el selector. Solo se ofrecen las transiciones permitidas: *Pendiente ⇄ En Camino*, y desde cualquiera de ellos a *Entregado* o *Cancelado*. **Entregado y Cancelado son finales.**
- **Cancelar** (icono ✕) pide confirmación y **devuelve el stock** al inventario. Los pedidos no se eliminan: quedan registrados con su historial de estados (quién y cuándo).
- En pedidos *En Camino* el botón **Ruta** abre Google Maps con el trayecto planta → finca para el chofer.
- **Exportar CSV** descarga los pedidos filtrados (separador `;`, abre directo en Excel).
- La columna **Pago** muestra el estado del cobro: *Pendiente de pago*, *Pagado*, *Pagado en efectivo*, *Vencido*, *Cancelado* o *En revisión*, y en pedidos QR el **monto exacto** del cobro vigente. El selector **Pago** filtra la lista por estado de pago. El estado de pago es independiente del estado logístico (Pendiente / En Camino / Entregado / Cancelado).
- Los pagos QR se confirman solos (webhook firmado de la pasarela; si un aviso no llega, el sistema consulta los cobros pendientes cada minuto).
- **Verificar**: consulta a la pasarela en ese momento.
- **Regenerar cobro**: anula el cobro QR actual en la pasarela y crea uno nuevo (por ejemplo, cuando venció y el cliente pide pagar otra vez).
- **Pagado en efectivo**: abre un formulario para registrar un pago recibido fuera de la pasarela. Elija *Pagado en efectivo* o *Transferencia / depósito verificado* y escriba una **nota obligatoria** (quién pagó, dónde, número de recibo). Queda en el historial con su usuario. Si había un cobro QR pendiente, se anula.
- Un pago **En revisión** (monto distinto, o dinero recibido en un pedido cancelado) requiere que usted decida: verifíquelo, regístrelo manualmente o gestione la devolución.
- Al **cancelar** un pedido se repone el stock y se anula su cobro QR pendiente.
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
