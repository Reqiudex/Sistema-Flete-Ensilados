# Auditoría de interfaz y experiencia de uso — 17/11/2026

Alcance: sistema de compras y fletes de Ensilados Santa Cruz (`tesis.cerice360.com`, app `tesis-v2` en Coolify,
rama `main`). Solo interfaz y experiencia: no se revisaron ni cambiaron cálculos de flete, pagos ni autenticación.

La app antigua `flete-ensilados` (rama `coolify-deploy`) ya no tiene dominio web propio: el túnel envía
`tesis.cerice360.com` a `tesis-v2` (puerto 8091) y de `flete-ensilados` solo queda `ensiladosapi.cerice360.com`
(API, puerto 3002, marcada en el túnel como "retirar cuando se detenga"). No se auditó ni modificó.

## Método

- Capturas de página completa en 360×800 y 768×1024 (táctil) y en 1366×768 y 1920×1080, con Chromium 129
  (Playwright), recorriendo: inicio → catálogo → carrito → términos → datos y ubicación → validación del
  formulario → acceso de administración. En producción no se envió ningún pedido.
- Panel de administración: entorno local aislado (contenedores propios en `127.0.0.1`, backend en modo memoria
  con datos de demostración y la pasarela apagada), las seis pestañas en los cuatro anchos.
- Accesibilidad: axe-core 4.10 con las reglas WCAG 2.0/2.1/2.2 A y AA en cada vista y ancho, más revisión manual
  de teclado, foco, nombres accesibles y movimiento.
- Rendimiento: Lighthouse 12.2 (móvil con 4G lento simulado y CPU ×4; escritorio), y peso real transferido.
- Cabeceras de seguridad: `curl -I` a la página y a los recursos.

## Mediciones de partida (producción, antes de los cambios)

| Medida | Móvil | Escritorio |
|---|---|---|
| Lighthouse rendimiento | 70 | 94 |
| Lighthouse accesibilidad | 95 | 95 |
| Lighthouse buenas prácticas | 100 | 100 |
| Lighthouse SEO | 91 | 91 |
| Primer pintado (FCP) | 3,8 s | 1,2 s |
| LCP | 3,8 s | 1,2 s |
| Bloqueo total (TBT) | 390 ms | 0 ms |
| CLS | 0,013 | 0,001 |
| JavaScript inicial (br) | 395 KB en un único archivo | ídem |
| Violaciones axe (vistas públicas) | 6 tipos | 6 tipos |
| Violaciones axe (panel) | 5 tipos | 5 tipos |
| Desborde horizontal | no | 768 px con sesión iniciada: 784 px |

## Hallazgos, ordenados por impacto

### Alto — flujo de compra

1. **En móvil el mapa queda debajo del botón "Confirmar y Enviar Pedido".** En el paso 3 la columna de datos
   (con el resumen y el botón de enviar) va primero y el mapa al final. La instrucción dice "arrastre el
   marcador", pero el cliente llega al botón de enviar sin haber visto el mapa.
2. **La ubicación de partida se acepta como si fuera la finca.** El marcador empieza en Santa Cruz de la Sierra
   y el flete se cotiza de inmediato con esa posición; nada indica que todavía no se eligió la propiedad.
3. **Al agregar un producto no hay respuesta visible en móvil.** El carrito está al final de la página (después
   de los tres productos) y el botón de la cabecera solo lleva al catálogo. No hay aviso ni barra de resumen.
4. **Al cambiar de vista o de paso no se vuelve arriba.** Inicio, catálogo, términos y ubicación son vistas
   del mismo documento; si el usuario venía desplazado, aparece a mitad de la vista siguiente. El foco del
   teclado y del lector de pantalla tampoco se mueve, y el título de la pestaña no cambia.
5. **El catálogo no tiene estado de carga ni estado vacío.** Mientras llega la respuesta (o si no hay
   productos) se muestra una cuadrícula vacía sin explicación.
6. **Los pasos del asistente pierden su nombre en móvil** (solo "1 2 3").
7. **El campo con error queda tapado por la cabecera fija** cuando el navegador lleva el foco a un campo
   obligatorio vacío (WCAG 2.4.11, foco no oculto).

### Alto — accesibilidad (WCAG 2.2 AA)

8. Etiquetas no asociadas a sus campos (nombre y celular del cliente, cantidad en tarjetas y en el carrito,
   correo y contraseña del acceso, formularios del panel: tarifas, contraseña, pedido manual, producto,
   administrador). Lectores de pantalla anuncian "campo de edición" sin nombre (1.3.1, 4.1.2).
9. Botones solo con icono sin nombre: quitar del carrito, mostrar contraseña, cerrar aviso, editar/quitar en
   el panel (4.1.2). El botón del carrito decía "Carrito, 0 toneladas" mientras mostraba "0 ton" (2.5.3).
10. Contraste insuficiente: textos `gray-400` sobre blanco (2,5:1) en métricas, carrito, resumen y botón
    secundario "Conocer Más" sobre verde (1.4.3).
11. Los términos están en una caja con desplazamiento que no se alcanza con el teclado (2.1.1).
12. El método de pago es un grupo de botones sin estado anunciado (no indica cuál está elegido).
13. Selectores del panel sin nombre (estado y pago de cada pedido) (4.1.2).
14. Animaciones permanentes (rebotes, pulsos, partículas flotantes, giro lento) sin respetar
    `prefers-reduced-motion` (2.3.3) y sin enlace "saltar al contenido" (2.4.1).
15. Avisos emergentes sin región viva: el lector de pantalla no los lee (4.1.3).
16. Botón de mostrar contraseña de 16×16 px (2.5.8, tamaño mínimo 24×24).

### Medio — rendimiento móvil

17. Un único JavaScript de 395 KB comprimido: el panel de administración, los gráficos (recharts), el generador
    de PDF (jsPDF + html2canvas) y el QR se descargan en la portada aunque el cliente nunca los use
    (Lighthouse: 274 KB sin usar).
18. Fuentes de Google cargadas dos veces (enlace en el HTML y `@import` dentro del CSS, en cadena) y
    bloqueando el primer pintado (~500 ms).
19. `robots.txt` no existe: la ruta devuelve la aplicación (Lighthouse SEO, 22 errores).
20. `index.html` sin `Cache-Control`; tras un despliegue un navegador puede seguir usando el HTML viejo que apunta
    a archivos que ya no existen.

### Medio — panel de administración

21. Con sesión iniciada, la cabecera desborda en 768 px (rol + "Salir" + menú completo); aparece scroll horizontal.
22. El botón "Admin" de la cabecera lleva una flecha de menú desplegable pero no despliega nada.

### Bajo — textos y contenido

23. "1 Toneladas", "Peso total: 1 Toneladas": falta singular.
24. Etiquetas genéricas o en inglés/jerga ("Silo Acopio", "Modo Offline", "SIG Integrado") en lugar de lo que
    el cliente gana.

### Cabeceras de seguridad (producción)

Presentes y correctas: `Content-Security-Policy` estricta (sin `unsafe-inline` en scripts), `X-Frame-Options:
DENY` + `frame-ancestors 'none'`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
(geolocalización solo propia) y HSTS de un año. Mejoras posibles:

- `Cross-Origin-Opener-Policy: same-origin` no está.
- En `/assets/` el `add_header` del bloque anula todas las cabeceras del servidor (comportamiento de Nginx):
  los JS y CSS salen sin CSP, HSTS ni `Referrer-Policy`. No es explotable (son archivos estáticos), pero se
  corrige repitiendo las cabeceras en ese bloque.

### Fuera del alcance de la interfaz (dependen de Luciano)

- **Google Maps muestra "Esta página no puede cargar Google Maps correctamente"** (`ApiProjectMapError`) y
  marcas de "solo para desarrollo". La clave `VITE_GOOGLE_MAPS_API_KEY` necesita la API "Maps JavaScript API"
  habilitada y facturación activa en su proyecto de Google Cloud, y la restricción de referente con
  `https://tesis.cerice360.com/*` y `https://tesis.cherry.lat/*`. El cálculo sigue funcionando (línea recta
  ×1,25 y modo sin conexión), pero el mapa se ve degradado.
- Datos de contacto y bancarios del pie, de la confirmación y del PDF (teléfono +591 789 45612, correo
  info@ensiladossantacruz.com, Banco Unión cuenta 120485763, NIT 348927021): parecen de ejemplo; confirmar
  que son los reales antes de que un cliente transfiera dinero.
- La sección "Servicios Llave en Mano" (siembra, riego, cosecha, fumigación con drones) y la visión "2030" son
  afirmaciones comerciales que debe confirmar la empresa.

## Correcciones aplicadas

Rama `mejoras/uiux-2026-11-17`. Solo interfaz: los datos que se envían al registrar un pedido (nombre, celular,
coordenadas, forma de pago), el cálculo del flete, los pagos, la autenticación y los mensajes de WhatsApp quedan
igual que antes; el servidor sigue validando y calculando todo.

| # | Corrección |
|---|---|
| 1 | Paso 3 en móvil ordenado como datos → mapa → resumen y botón de enviar. |
| 2 | Aviso "Todavía no marcó su finca" hasta que el cliente mueve el marcador, toca el mapa o indica la distancia a mano. Tocar el mapa coloca el marcador. |
| 3 | Aviso anunciado al agregar ("Agregado: 2 toneladas de Silo de Maíz") y barra fija del carrito en móvil. El botón del carrito de la cabecera lleva al carrito. |
| 4 | Al cambiar de vista: vuelve arriba, el foco pasa al contenido o al título del paso y cambia el título de la pestaña. |
| 5 | Catálogo con estado de carga, estado vacío y estado de error con "Reintentar". |
| 6 | Pasos con nombre corto en móvil (Productos · Términos · Entrega) y `aria-current="step"`. |
| 7 | `scroll-margin` bajo la cabecera fija; el error lleva el foco al campo y lo marca con `aria-invalid`. |
| 8-13 | Etiquetas asociadas en todos los formularios (cliente, acceso, panel), nombres en botones de icono y selectores, contraste AA (`gray-600` en lugar de `gray-400`), términos alcanzables con teclado, forma de pago con `aria-pressed`. |
| 14-16 | Enlace "Saltar al contenido", animaciones decorativas quitadas o detenidas con `prefers-reduced-motion`, avisos con región viva y botón de mostrar contraseña de 44 px. |
| 17 | Panel, gráficos, PDF, QR y acceso se cargan bajo demanda (`React.lazy`): JavaScript inicial de 395 KB a 70 KB comprimidos. |
| 18 | Fuentes Inter y Outfit autoalojadas (sin Google Fonts ni `@import` en cadena). |
| 19-20 | `robots.txt` propio; `index.html` con `Cache-Control: no-cache` y assets con huella con un año de caché. |
| 21-22 | Cabecera sin desborde a 768 px con sesión iniciada; quitada la flecha de menú que no desplegaba nada. |
| 23-24 | Singular/plural de toneladas y textos orientados al cliente ("Flete al instante", "Funciona sin señal", sección "Cómo hacer su pedido"). |
| Seguridad | Cabeceras en un archivo común incluido en cada `location` (los JS/CSS ya llevan CSP, HSTS, etc.) y `Cross-Origin-Opener-Policy: same-origin`. |

## Mediciones después de los cambios

Entorno local aislado (127.0.0.1, backend en modo memoria, misma imagen Docker que producción). Chromium 130.

| Medida | Antes (local) | Después (local) |
|---|---|---|
| Lighthouse móvil (mediana de 3) | 54 | **95** (93-98) |
| Lighthouse escritorio | 84 | **100** |
| Accesibilidad / buenas prácticas / SEO | 95 / 100 / 91 | **100 / 100 / 100** |
| LCP móvil | 8,9 s | **1,95 s** |
| CLS | 0,013 | **0** |
| Peso total de la portada | 1.440 KB | **167 KB** |
| Violaciones axe, vistas públicas (4 anchos) | 5 tipos, 75 nodos | **0** |
| Violaciones axe, panel (6 pestañas × 4 anchos) | 4 tipos, 88 nodos; desborde en 768 px | **0**; sin desbordes |

Producción antes de los cambios (referencia): Lighthouse móvil 70, escritorio 94.

Pruebas de extremo a extremo en el entorno local (Playwright, 360/768/1366 px): **48/48 OK**. Cubren el salto al
contenido, el cambio de vista, el aviso y la barra del carrito, los términos, el orden en móvil, la validación
con foco, el pedido completo hasta "Pedido registrado", el error del catálogo con "Reintentar", el panel con los
pedidos nuevos y el menú móvil. Backend: 47/47 pruebas. `npm run typecheck` y `npm run build` sin errores.
`npm run lint` no se puede ejecutar: el repositorio no tiene configuración de ESLint (ya era así antes).

## Publicación y vuelta atrás

- Coolify despliega la app `tesis-v2` desde la rama `main`. La versión anterior es el commit `cddfd0b`.
- Antes de publicar se guarda una copia de los archivos servidos por el contenedor del frontend en
  `~/respaldo/manual/tesis-v2-<fecha>/` y la etiqueta de la imagen.
- **Volver atrás:** `git revert` del merge en `main` (o `git push --force-with-lease origin cddfd0b:main` si se
  prefiere) y redeploy de `tesis-v2` en Coolify. Mientras tanto, Coolify conserva la imagen anterior para
  redesplegarla desde su historial de despliegues.
- No hay cambios de base de datos ni de variables de entorno.

## Publicado en producción (17/11/2026, 12:07)

- Commit `7b95657` en `main`; Coolify desplegó `tesis-v2` solo (frontend y backend sanos).
- Respaldo previo: `~/respaldo/manual/tesis-v2-20261117-1207/` (archivos servidos, configuración de Nginx e
  imágenes del commit anterior `cddfd0b`).
- `~/check-webs.sh` idéntico antes y después: 16 en línea, 0 fallas, 5 apagadas a propósito.

| Medida en `https://tesis.cerice360.com` | Antes | Después |
|---|---|---|
| Lighthouse móvil (mediana de 3) | 70 | **87** (81-93; servidor con carga alta) |
| Lighthouse escritorio | 94 | **94** |
| Accesibilidad / buenas prácticas | 95 / 100 | **100 / 100** |
| SEO | 91 | **92** (90 en escritorio) |
| CLS | 0,013 | **0** |
| Violaciones axe, 28 vistas (7 vistas × 4 anchos) | 6 tipos | **0** |
| Cabeceras de seguridad en `/assets/` | ninguna | todas, más COOP |

SEO no llega a 100 en producción porque Cloudflare antepone su `robots.txt` gestionado ("Content-Signal"),
que Lighthouse marca como inválido. Es un ajuste de la zona `cerice360.com` en Cloudflare, común a todas las
webs; el `robots.txt` propio de la app va a continuación y es válido. Decisión de Luciano si se desactiva.

## Pendiente

- Google Maps (`ApiProjectMapError`): habilitar "Maps JavaScript API" y facturación en el proyecto de Google
  Cloud de la clave, con referentes `https://tesis.cerice360.com/*` y `https://tesis.cherry.lat/*`.
- Confirmar teléfono, correo, cuenta bancaria y NIT del pie, la confirmación y el PDF, y los servicios
  "llave en mano" de la portada.
- El repositorio no tiene configuración de ESLint (`npm run lint` falla desde antes de estos cambios).
