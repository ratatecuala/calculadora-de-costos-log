# 14 · QA de experiencia de usuario — teléfono y PC/notebook

**Fecha:** 18-11-2026 · **Frente:** B (experiencia de usuario) · **Base:** rama de desarrollo del PR #34, commit `6dac008`.

**Requisito del propietario:** experiencia completa y paridad funcional en PC/notebook y en teléfono. Maquetar «mobile-first» no significa que el escritorio sea secundario: en escritorio se aprovecha el ancho y en el teléfono los controles táctiles miden ≥ 44 px, sin desplazamiento horizontal.

**Alcance de las correcciones:** solo presentación, accesibilidad y consistencia en `src/web/**`. No se tocaron fórmulas (`src/engine`), servidor, SQL ni el diseño v4 ([10](10-diseno-ux.md)); no se agregaron dependencias ni funciones de producto.

## 1. Método

| Aspecto | Detalle |
|---|---|
| Entorno | `npm run dev` local (Vite) con el **proveedor de rutas simulado** y contador en memoria. Sin cuenta: historial y vehículos en el navegador. |
| Navegador | Playwright 1.63 + Chromium 157 (sin cabeza), `deviceScaleFactor` 1. |
| Teléfono | Pixel 7 (412×915), iPhone 13 (390×844), 360×740 y **320×640** (ancho mínimo). Emulación táctil. |
| PC/notebook | 1440×900, 1366×768 (notebook), 1280×800; además 1024, 820 y 768 px (notebook pequeño, tablet, media pantalla). |
| Cuentas | Segundo servidor local con una configuración de Supabase **ficticia**; todas las solicitudes a `*.supabase.co` se respondieron dentro del navegador (Playwright `page.route`), sin salir a internet. Sirvió para ver la pestaña «Ingresar», «Mi cuenta» y el error del acceso de prueba. El resto de la cuenta se evaluó leyendo el código. |
| Flujos | Calcular ruta (simulada), modo manual de km, cargar costos, margen, precio, confirmación de precio tras un cambio de costo, comparación sin peajes, crear y guardar cotización, vista de cotización, PDF (`page.pdf()` en **A4 y Carta**, con medios de impresión, también desde un ancho de 390 px), enlace de WhatsApp, historial (estados y pago), «Mi vehículo» (crear, validar, editar, predeterminado, borrar con confirmación), errores (dirección inválida, servicio caído, cupo agotado), estados vacíos, teclado (orden de tabulación, foco visible, Enter, etiquetas). |
| Mediciones | En cada pantalla: ancho de documento vs. ventana (desplazamiento horizontal), elementos que salen de la ventana y todo control interactivo de menos de 44 px. Capturas revisadas a mano. |
| Pruebas | `npm test`, `npm run typecheck` y `npm run build` tras cada corrección; pruebas de regresión nuevas en `tests/ux.*.test.ts`. |

Los scripts de Playwright fueron herramientas de revisión temporales y no se incorporan al repositorio.

## 2. Hallazgos

Severidad: **P1** impide o esconde una función principal en un tipo de dispositivo · **P2** dificulta el uso o produce un error de interacción · **P3** consistencia, accesibilidad o pulido.

| ID | Sev. | Flujo | Viewport | Descripción | Evidencia | Estado |
|---|---|---|---|---|---|---|
| H-01 | **P1** | Navegación / cuenta | Teléfonos ≤ ~430 px | Con cuentas activas (staging) hay 4 pestañas y no caben junto a la marca: «Ingresar»/«Cuenta» queda fuera de la pantalla en Pixel 7 (pestaña en x = 353–421 con ventana de 412), iPhone 13 y 360 px; a 320 px también «Mi vehículo», incluso sin cuentas. La barra se desplaza, pero nada lo indica. | Medición de `nav`: `scrollWidth` 313 vs `clientWidth` 203/243/295 (320/360/412 px). Captura a 360 px: la pestaña «Ingresar» no se ve. | **Corregido** `8270dbc`: bajo 560 px las pestañas van en una segunda fila a todo el ancho (verificado: 304/304, 344/344, 396/396). |
| H-02 | P2 | Nueva cotización; calculadora | Todos | «Tus datos (aparecen en la cotización)» se cerraba al escribir la primera letra del nombre comercial y ocultaba Teléfono y Correo (`open={!business.name}`). «Base y regreso» se cerraba al desmarcar una casilla. | Playwright: tras escribir el nombre comercial, `details.open === false`; el campo Teléfono deja de estar visible. | **Corregido** `2acdae5` (componente `Fold`: estado inicial y luego decide el usuario). Verificado `open === true` en los 6 viewports. |
| H-03 | P2 | Todos | Teléfono (y PC) | Controles táctiles bajo 44 px: enlaces de acción («Prefiero ingresar los km a mano», «Cargar ejemplo ficticio», «Restaurar…», «Administrar vehículos», «Usar como predeterminado», «Eliminar», «Desactivar») 25 px; títulos plegables 32 px y el de «Comparar con ruta sin peajes» **16 px**; casillas 40 px; botones pequeños, selectores del historial y campos km/min por tramo 40 px. | Medición automática de todos los controles visibles (Pixel 7: 10 controles bajo 44 px en la calculadora, 6 en «Mi vehículo», 3 en el historial). | **Corregido** `2db8bab`. Tras el cambio solo queda «Regístralo», enlace dentro de un párrafo (excepción «en línea» de WCAG 2.5.8). |
| H-04 | P3 | Comparación sin peajes; plegables | Todos | Chromium no aplica flex/`gap` al contenido de `<details>`: el botón «Comparar sin peajes» no ocupaba el ancho como los demás y los textos quedaban pegados (ayuda del campo pegada a «Costo ruta sin peajes»). | Captura a 1440 px antes/después. | **Corregido** `2acdae5` (contenido en `.fold-body`). |
| H-05 | P2 | Calculadora | 760–1099 px | En notebook pequeño, tablet o ventana a media pantalla la calculadora era una columna estirada de ~990 px; «Tu precio» quedaba a ~1.500 px de altura y la página medía 2.073 px. | Captura a 1024 px. | **Corregido** `1fe1d75`: dos columnas (recorrido + precio / costos + desglose); página de 1.400 px a 1024 y precio visible a ~870 px. Desde 1100 px siguen las 3 columnas v4. |
| H-06 | P3 | Calculadora, documento, PDF, historial | Todos | Campos con «1050», «15000» mientras los resultados dicen «$15.000»; fechas del documento, PDF, enlace público e historial en formato ISO (2026-11-18). | Capturas 1440 px y PDF. | **Corregido** `3b2e65e`: punto de miles al cargar y al salir del campo (sin ocultar decimales escritos) y fechas dd-mm-aaaa. Solo presentación. |
| H-07 | P3 | Formularios | Todos (lector de pantalla y teclado) | (a) El nombre accesible de cada campo numérico era toda la etiqueta, con unidad y ayuda («Peajes y TAG $ Vacío = no lo sé · 0 = no hay peajes»). (b) Errores de «Mi vehículo» no asociados al campo y sin mover el foco. (c) Enter no guardaba el vehículo (no era un `<form>`). (d) Selectores del historial con nombres repetidos «Estado»/«Pago». | Árbol de accesibilidad y recorrido con teclado en Playwright. | **Corregido** `913006f`. Verificado: Enter con nombre vacío deja el foco en el nombre (`aria-invalid`); con rendimiento 500 el foco va al campo y su descripción es «Revisa el rendimiento (máximo 100 km/L)». |
| H-08 | P3 | Teclado | PC | Foco visible solo con el anillo por defecto del navegador (negro), distinto del de los campos (azul). | Captura con Tab. | **Corregido** `2db8bab` (`:focus-visible` azul de la paleta). El orden de tabulación ya era lógico (pestañas → recorrido → ruta → costos → precio). |
| H-09 | P3 | PDF | Todos | Todos los PDF se guardaban como «[Marca] · Cotizador de fletes» (título de la página). | `page.title()`. | **Corregido** `0deac76`: «Cotización N° 0001 · Cliente» mientras se ve la cotización (también en el enlace público). |
| H-10 | P3 | Historial; errores de ruta | Todos | Etiquetas «Costo parcial»/«datos simulados» estiradas a todo el ancho; mensajes de ruta (dirección inválida, servicio caído, cupo) no anunciados a lectores de pantalla. | Captura del historial; árbol de accesibilidad. | **Corregido** `0deac76`. |
| P-01 | P3 | WhatsApp | Todos | El texto de WhatsApp muestra «Válida hasta: 2026-11-25» (ISO). Se arma en `src/shared/clientQuote.ts`, fuera de los archivos de este frente. | Texto generado en la prueba. | **Propuesto**: usar dd-mm-aaaa en `whatsappText` (cambio de una línea, sin efecto en datos guardados). |
| P-02 | P3 | Navegación / cuenta | Todos | La pestaña de la cuenta conectada dice «Cuenta ✓»; un lector de pantalla lee «marca de verificación». | Lectura de código (`App.tsx`). | **Propuesto**: «Mi cuenta» (texto) o el símbolo con `aria-hidden`. Cambio de texto visible: confirmar. |
| P-03 | P3 | Calculadora | PC | La etiqueta «Solo esta cotización» junto a «Rendimiento» empuja ese campo unos píxeles más abajo que su vecino en la grilla. | Captura a 1280/1440 px. | **Propuesto** (pulido menor; no afecta el uso). |
| D-01 | — | Historial | Todos | No existe filtro del historial por estado o pago. Agregarlo es una función nueva. | Lectura de código (`History.tsx`). | **Requiere decisión** del propietario (útil cuando haya muchas cotizaciones; [10 §2](10-diseno-ux.md) lo deja como referencia). |
| D-02 | — | Calculadora | Teléfono | En el teléfono «Crear cotización» queda al final de una página de ~3.000 px; no hay resumen fijo de precio ni botón fijo. | Capturas Pixel 7 / 320 px. | **Requiere decisión** (cambio de diseño: barra fija con precio y «Crear cotización»). Hoy es usable y el orden coincide con v4 («formulario y resultados en una pantalla desplazable»). |
| D-03 | — | Calculadora | Todos | Enter en «Desde/Hasta» no calcula la ruta. Se mantuvo así a propósito: cada cálculo consume cupo (A-42) y solo debe salir del botón. | Lectura de código y prueba. | **Requiere decisión** si se quiere Enter = «Calcular ruta». |
| D-04 | — | Nueva cotización | Todos | Enter no guarda la cotización. Se mantuvo para evitar emitir por accidente un documento numerado al cliente. | Prueba. | **Requiere decisión** (recomendado dejarlo así). |

**Sin problemas encontrados:** desplazamiento horizontal (ninguno en 320–1440 px tras H-01), contraste de la paleta v4, formato de montos `$`, estados vacíos («Aún no tienes cotizaciones», «¿Usas siempre el mismo vehículo? Regístralo»), costo parcial («$X o más», «al menos $X», «como máximo»), confirmación de precio tras un cambio de costo, confirmación antes de borrar un vehículo, mensajes de error de ruta y de acceso de prueba (texto claro, sin códigos), etiquetas asociadas en todos los campos, impresión (oculta navegación, avisos y botones; documento en una página en A4 y Carta, también desde 390 px).

## 3. Paridad PC vs. teléfono (después de las correcciones)

| Flujo | Teléfono (320–412 px) | PC/notebook (1280–1440 px) | Ancho intermedio (760–1099 px) |
|---|---|---|---|
| Navegación | ✔ 2 filas, todas las pestañas visibles | ✔ barra superior | ✔ |
| Calcular / cotizar (ruta simulada, manual, costos, margen, precio, confirmación) | ✔ una columna desplazable (v4) | ✔ 3 columnas v4 | ✔ 2 columnas |
| Comparación sin peajes | ✔ | ✔ | ✔ |
| Guardar cotización | ✔ | ✔ formulario de 760 px centrado | ✔ |
| Vista de cotización, PDF | ✔ (PDF idéntico desde 390 px) | ✔ A4 y Carta | ✔ |
| WhatsApp | ✔ enlace `wa.me` con el texto (fecha ISO, ver P-01) | ✔ (abre WhatsApp Web) | ✔ |
| Historial (estado, pago) | ✔ | ✔ lista de 760 px | ✔ |
| Mi vehículo (crear, validar, editar, predeterminado, borrar) | ✔ | ✔ | ✔ |
| Cuenta (Ingresar, acceso de prueba, error) | ✔ con Supabase simulado en el navegador | ✔ | ✔ |
| Teclado | — | ✔ orden lógico, foco visible, Enter en el formulario de vehículo y de acceso de prueba | ✔ |

En escritorio, las vistas de lectura (historial, vehículos, cotización) usan una columna de 760 px centrada: es el ancho de una hoja y deja líneas legibles; no es una columna de teléfono (412 px). La calculadora sí aprovecha el ancho completo.

## 4. Lo que no se pudo probar localmente

- **Cuenta real (Supabase):** inicio con Google, sesión conectada, guardado en la nube, numeración por cuenta, copia del historial local a la cuenta («Copiar a mi cuenta»), cierre de sesión y cambio de cuenta. Se revisó el código (`AccountView`, `App`, `cloud/*`): los errores se muestran en texto claro y los botones ocupan 44 px tras H-03. Un intento de simular una sesión conectada solo con almacenamiento local no fue aceptado por supabase-js y se descartó.
- **Enlace público real** (`/c/<token>`): creación, copia, desactivación y vista del cliente. Se revisó el código; el documento es el mismo `QuoteDocument` (con fechas chilenas y título de PDF de H-06/H-09).
- **Impresión real en iOS/Android** (Safari/Chrome móvil «Compartir → Imprimir/PDF»): se probó el CSS de impresión con Chromium a 390 px, no en un teléfono físico.
- **Google Routes real:** no autorizado; solo proveedor simulado.

### Cómo probarlo en staging (sin comandos)

1. Abrir staging en un teléfono (o con la ventana a 360 px): comprobar que se ven las 4 pestañas, incluida «Ingresar».
2. «Ingresar» → acceso de prueba con un usuario de prueba; crear un vehículo y una cotización; ver que aparecen en «Mis trabajos» «Guardados en tu cuenta».
3. En la cotización: «Crear enlace», «Copiar enlace», abrirlo en otra ventana privada o en otro teléfono, «Descargar PDF» desde ambos lados (el archivo debe llamarse «Cotización N° …»), y luego «Desactivar» y comprobar «Enlace no disponible».
4. Con historial anónimo previo en el navegador, iniciar sesión y usar «Copiar a mi cuenta»; reintentar para comprobar que no duplica.
5. Repetir 2–3 en un notebook (1366×768) y en una ventana a media pantalla (~960 px: calculadora en dos columnas).

## 5. Pruebas

- Inicio: 154 pruebas en verde. Final: **179 pruebas en verde** (20 archivos), `npm run typecheck` y `npm run build` sin errores.
- Nuevas: `tests/ux.layout.test.ts` (navegación, dos columnas, 44 px, foco, etiquetas), `tests/ux.fold.test.ts` (plegables), `tests/ux.format.test.ts` (miles, fechas, documento, título del PDF), `tests/ux.a11y.test.ts` (nombres y descripciones accesibles, errores asociados, `<form>` de vehículo).
- Cada corrección se verificó además en Chromium en los viewports de §1.
