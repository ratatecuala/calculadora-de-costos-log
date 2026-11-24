# Notas — verificación del catálogo C1 v3 (2026-11-25)

Estado: **CANDIDATOS PARA REVISIÓN — no cargar en producción** (sin cambios). No se tocó el repositorio.

## Método

1. Entrada: `datos/catalogo-c1/candidatos.json` (15 versiones, todo SECUNDARIO). Las 128 marcas VERIFICADO de `scratchpad/c1v2` se trataron como no verificadas: solo se usaron sus URL como pistas. No se reutilizó ningún archivo de `scratchpad/dl/`; todo se descargó de nuevo en esta corrida.
2. Descarga con `curl -sL -A "Mozilla/5.0"` solo en los hosts permitidos. Un archivo entra en `evidencia/` solo con HTTP 200; las respuestas 404/403 no se guardaron y quedan registradas en este documento.
3. Texto: `pdftotext -layout` para los PDF y un conversor HTML→texto propio para el HTML. Una **cita** es un fragmento exacto del `.txt`; la comparación normaliza solo los espacios.
4. Un campo es VERIFICADO solo si el valor exacto aparece en el archivo descargado, para esa versión y columna. Cuando la tabla tiene celdas combinadas, la nota de la fuente lo explica.
5. Las versiones que no se pudieron abrir conservan sus valores como SECUNDARIO, con la nota anterior más el motivo del bloqueo. En las versiones verificadas, un valor previo que no aparece en la fuente oficial pasa a `null` (`confidence: DATO_FALTANTE`), con el valor anterior citado en la nota.
6. `segment`: en pick-ups y furgones se conserva el segmento por carrocería; en camiones se registra la categoría comercial que declara la marca (p. ej. «COMERCIALES CLASE B»). `confidence: SUPUESTO`, porque la etiqueta interna no es un dato de la fuente. No se definieron umbrales de camión mediano.
7. Nivel de `verificacion`:
   - **completa**: make, model, version, fuel, km_per_l_ref, gvw_kg y payload_kg en VERIFICADO;
   - **parcial**: al menos un campo técnico en VERIFICADO;
   - **sin_verificar**: ningún campo verificado.
8. Autocomprobación: el script `work/build.py` y una segunda comprobación independiente recalcularon el SHA-256 y buscaron cada cita en su `.txt`. Resultado: **62/62 citas encontradas**, y cada valor numérico aparece literalmente en su cita.

## Resultado

- Campos (20 por versión × 15): **62 VERIFICADO**, **99 SECUNDARIO**, **6 SUPUESTO** (segmento), **133 null**.
- **0 completa**, **6 parcial** (Hilux, L200 Work CR 2020, N400 Max, Porter, Kia Frontier pick-up, HD35 Light), **9 sin_verificar**.

## Hallazgos y conflictos

- **Toyota Hilux 4x2 2.4 MT SR**: la misma página muestra 13,9 km/l mixto sin ciclo y 13,2 km/l mixto en la nota legal (ciclo CE, homologado en el MTT). Se usó 13,2. El «Peso 1.930 kg» de la tienda no dice qué peso es, así que no se asignó. La ficha PDF está en `tcl-s3-bucket.s3.amazonaws.com`, un host no permitido, y no se descargó.
- **Mitsubishi L200 Work CR 4x2**: la ficha es de 2020 y la versión ya no aparece en la página vigente, que solo lista Katana/Dakar Euro 6C. La ficha vigente de 2025 es una imagen sin texto y no hay OCR disponible.
  - Alternativa verificable para el propietario: la etiqueta de la **L200 Katana XR 4X2 MT** indica 12,1 km/l mixto (ciudad 9,4 y carretera 14,6). Es otra versión y no se mezcló con esta.
- **Chevrolet N400 Max**: se redefinió como «1.5L MT AC T» según la ficha de mayo de 2026, que trae caja de 6 velocidades; la ficha de 2021 traía 5. La ficha 2026 publica Mixto 15,9 y Carretera 13,5: un mixto mayor que el de carretera es inconsistente, así que el rendimiento queda en `null`.
- **Hyundai Porter**: la ficha descargable dice «E6C» y la página de versiones dice «E6D». Peso bruto, ancho y alto de la caja vienen de celdas combinadas, explicadas en cada nota. El rendimiento «7.4/11.4 Ciudad/Carretera» de la página es del modelo, no de la versión, y no trae ciclo; no se usó.
- **Kia Frontier P/UP LX**: mixto 9,7 tanto en la etiqueta (2023) como en la ficha (feb-2026). Las dos difieren en la norma (Euro 6d frente a 6e) y en el valor urbano (7,7 frente a 7,5).
  - Carga útil sin asignar: solo se publica la carga «sobre chasis» (1.600 kg) y el peso de la caja (216 kg).
  - Volumen sin asignar: «11 m³» no corresponde a una caja pick-up.
- **Hyundai HD35 Light**: solo se publica el consumo en **ciudad** (7,3 km/l, ciclo CE/MTT), más bajo que un mixto. La ficha cubre la configuración de junio de 2022 a junio de 2023 y no imprime el combustible, que queda SECUNDARIO. No se pudo comprobar si se vende hoy.
- **JAC X200**: jac.cl no está en la lista de hosts permitidos y no hay ficha en hosts oficiales permitidos.

## Páginas bloqueadas o fallidas

| URL | Resultado |
|---|---|
| www.consumovehicular.cl (todas las rutas) | La aplicación responde con un HTML vacío; los datos vienen de `api-consumovehicular.minenergia.cl`, que no está en la lista permitida y no se intentó. **Ningún rendimiento se contrastó con consumovehicular.** |
| www.ford.cl (página XL 4x2, PDF de ficha y condiciones) | HTTP 403 «Access Denied» (CDN), también al reintentar |
| www.kaufmann.cl (Sprinter, Canter, PDF) | HTTP 403 (CDN), también al reintentar |
| maxus.cl (T60 DX y PDF) | HTTP 403 (CDN), también al reintentar |
| www.peugeot.cl (Partner, Boxer) | HTTP 403 (CDN) |
| configuradorpro.peugeot.cl | HTTP 503 |
| energia.gob.cl | HTTP 403 |
| www.mtt.gob.cl | Sin respuesta (redirige a mtt.gob.cl, código 000) |
| www.autocosmos.cl | Sin conexión (no está en la lista; solo se probó la portada) |
| www.nissan.cl/content/dam/Nissan/cl/fichastecnicas/FICHA%20TECNICA%20NUEVA%20NAVARA.pdf | HTTP 404; Navara no figura en /vehiculos/nuevos.html |
| toyota.cl/modelos/comerciales/hiace/ | HTTP 404; /hiace-cargo/ redirige a /modelos/pickup/ |
| tcl-s3-bucket.s3.amazonaws.com (FT_Hilux2026.pdf) | Host no permitido; no se intentó |

Se reintentó una vez con un User-Agent de navegador completo y no se intentó ninguna otra forma de evadir los bloqueos.

## Pendiente para el propietario

1. Decidir si se reemplazan las 9 versiones sin verificar o se esperan los sitios bloqueados. Alternativas en hosts accesibles, solo como pistas (no verificadas en esta corrida):
   - Chevrolet Colorado WT;
   - Chevrolet NKR (camión);
   - Hyundai Staria furgón;
   - L200 Katana XR 4x2.
2. Habilitar el acceso a `api-consumovehicular.minenergia.cl` (fuente pública del Ministerio de Energía) para contrastar los rendimientos. Requiere autorización del propietario.
3. Revisar las condiciones de reutilización (fuentes.md §2) antes de publicar datos copiados de los sitios de las marcas.
