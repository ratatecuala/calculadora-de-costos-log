# 34 · Worker privado `medicion-privada` (A-91 Frente B)

**Estado (26-11-2026, hora de Chile):** código **preparado y probado en local**; **no desplegado**. El despliegue espera un token de Cloudflare exclusivo para este entorno, que el propietario debe guardar en la configuración del entorno de la nube (nunca en el chat ni en el repositorio). Autorización: [A-91 en #43](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7183824623). Propuesta original: [31 §7](31-herramienta-medicion-implementacion.md).

## 1. Qué es

Un Worker de Cloudflare **nuevo y separado** que sirve solo el build de la herramienta de medición (`dist-medicion/`, con `VITE_FF_MEDICION=1` **solo en este build**), protegido con usuario y contraseña.

| Pieza | Archivo |
|---|---|
| Worker (control de acceso y servicio de archivos) | `src/medicion-worker/worker.ts` |
| Empaquetado (incrusta `dist-medicion/` en el script) | `scripts/medicion-worker/empaquetar.mjs` → `build-medicion/` (artefacto, ignorado por Git) |
| Configuración de Wrangler | `workers/medicion-privada/wrangler.jsonc` (sin secretos) |
| Pruebas unitarias | `tests/medicion-worker.test.ts` |
| Comprobación de acceso (local o desplegado) | `scripts/medicion-worker/probar-acceso.mjs` |
| Comando de build | `npm run build:medicion-privada` |

## 2. Garantías

- **Contraseña en todo:** `/`, `index.html`, cada archivo de `assets/`, `sw.js`, rutas inexistentes, métodos no permitidos y errores responden **401** sin credenciales válidas. No hay respaldo público ni página de error con contenido.
- **Archivos incrustados en el script**, no en Static Assets de Cloudflare: Static Assets se sirven **antes** del Worker y se saltarían la contraseña.
- **Falla cerrado:** sin el secreto `MEDICION_BASIC_AUTH` (o si no tiene la forma `usuario:contraseña`) responde **503** y no sirve nada.
- **HTTPS:** fuera de `localhost`, HTTP se redirige a HTTPS (308) y se envía HSTS.
- **Sin servidor de datos:** sin Durable Objects, KV, D1, R2, Supabase, analítica, observabilidad ni APIs externas. Los datos quedan solo en el navegador del teléfono (IndexedDB). CSP `connect-src 'self'`.
- **Separado del staging:** otro nombre (`medicion-privada`), otro script, otro secreto y otra configuración. No toca `wrangler.jsonc` de la raíz, el Worker de staging ni su dominio.
- `noindex`, `no-referrer`, `Cache-Control: private, no-store` en todas las respuestas.

## 3. Limitaciones que el propietario debe conocer

- **Revocar la contraseña no borra las copias locales.** Impide nuevas descargas, pero la aplicación y los datos que ya están en un navegador siguen ahí y la copia sin conexión sigue abriendo. Para eliminarlos: en ese navegador, borrar los datos del sitio (Chrome Android: Configuración → Configuración de sitios → Todos los sitios → el sitio → Borrar y restablecer).
- **IndexedDB depende de la dirección.** Si la URL cambia, el teléfono la trata como otro sitio y no ve los datos anteriores: **exportar la copia de seguridad antes** de cambiar de dirección.
- Contraseña compartida (no por persona). Si se filtra, se cambia el secreto (`wrangler secret put MEDICION_BASIC_AUTH`) y se entrega la nueva.
- Safari en iPhone: Basic Auth con service worker **POR VALIDAR** en el dispositivo real.

## 4. Pruebas ejecutadas (Claude, 26-11-2026)

- `tests/medicion-worker.test.ts`: 7/7 (401 en siete rutas y POST, credenciales incorrectas o mal formadas, falla cerrado, tipos de contenido, 404 y 405 autenticados, cabeceras, redirección HTTPS).
- `wrangler dev` local con el build real y `probar-acceso.mjs`: **15/15**. Sin credenciales, `/`, `/index.html`, `/sw.js`, los dos assets y una ruta inexistente → 401; POST y contraseña incorrecta → 401. Con credenciales en Chromium (Pixel 7): la app carga, el service worker toma el control, IndexedDB conserva un registro y la app vuelve a abrir sin conexión. 0 peticiones a otros orígenes.
- **No ejecutado:** despliegue real, plan de la cuenta, teléfono físico.

## 5. Procedimiento de despliegue (para la sesión que tenga el token)

Requisitos previos (A-91): observaciones de GPT corregidas, integración con Codex completa y **CI independiente de #57 en verde** sobre el HEAD a desplegar.

1. **Comprobar costo $0 antes de nada.** Con el token (variables `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` del entorno), consultar las suscripciones de la cuenta y confirmar que Workers está en el plan **gratuito** y que crear un Worker no exige contratar ni aceptar cobros. Si exige pago: **detenerse** y avisar.
2. `npm ci && npm run build:medicion-privada`.
3. Generar la contraseña fuera del repositorio (`openssl rand -base64 24`) y cargarla: `npx wrangler secret put MEDICION_BASIC_AUTH --config workers/medicion-privada/wrangler.jsonc` (valor `tomas:<contraseña>`). No escribirla en ningún archivo del repositorio.
4. `npx wrangler deploy --config workers/medicion-privada/wrangler.jsonc`.
5. `MEDICION_URL=<url> MEDICION_AUTH=<usuario:contraseña> node scripts/medicion-worker/probar-acceso.mjs` → todo ✓. Además, el e2e completo de la herramienta contra la URL (`MEDICION_AUTH=… node scripts/e2e-medicion.mjs <url>`), que cubre exportación e importación.
6. Entregar al propietario **solo por un canal privado** la dirección, el usuario y la contraseña. Nunca en GitHub, el README ni el chat del proyecto sin confirmar con él.

**Revertir:** `npx wrangler delete --config workers/medicion-privada/wrangler.jsonc` (borra el Worker y su secreto) y revocar el token en Cloudflare.

## 6. Primera prueba desde el teléfono (para el propietario)

1. Abre la dirección privada en Chrome del teléfono y escribe el usuario y la contraseña cuando lo pida.
2. Menú ⋮ → «Agregar a la pantalla principal», para abrirla como una app.
3. Crea tu vehículo y un viaje corto de prueba con datos inventados; registra una carga de combustible.
4. Activa el modo avión, cierra y vuelve a abrir la app: debe abrir y mostrar el viaje.
5. Quita el modo avión y descarga la copia de seguridad y el CSV desde «Exportar»; abre el CSV en Excel.
6. Antes del viaje de diciembre, borra los datos de prueba o guárdalos como copia.
