# Fuentes — catálogo C1 v3 (`c1-candidatos-2026-11-25-v3`)

Descargadas con `curl -sL --max-time 30–90 -A "Mozilla/5.0"` el 2026-11-25 (fecha de registro pedida; reloj del equipo: 2026-11-24 UTC).
Cada archivo está en `evidencia/`; para PDF se guardó además el texto extraído con `pdftotext -layout` (`.txt`) y para HTML un texto plano (`.txt`) donde se comprobaron las citas.
SHA-256 calculado sobre el archivo original (`.pdf` / `.html`).

## 1. Fuentes de datos usadas para campos VERIFICADO

| Archivo | URL | SHA-256 | Uso |
|---|---|---|---|
| toyota-tienda-hilux-257.html | https://tienda.toyota.cl/index.php?id_product=257&rewrite=hilux&controller=product | 886fe39ee18f56407a1052ac5134ba5d374e93f288eed9916d813bfbedf186d8 | Hilux 4x2 2.4 MT SR: versión, año, motor, rendimiento (nota legal con ciclo) |
| toyota-tyc-por-modelo.html | https://toyota.cl/terminos-y-condiciones-comerciales-por-modelo/ | 7b86cc614430e8be417763951d8c01e260544cf3c9f03cbbf535612b0cac0f28 | Contraste: misma nota de consumo para «versión Hilux 4x2 2.4 MT SR» |
| mitsubishi-L200-4x2-2020.pdf | https://mitsubishi-motors.cl/wp-content/uploads/2020/01/L200-4x2-1.pdf | ce1933ba1a69977634cc46875d12277b10a57dfe6f67ac859bbe96aeaa30eb5e | L200 Work CR 4x2 (2020): pesos, carga útil, motor |
| mitsubishi-l200.html | https://mitsubishi-motors.cl/modelos/l200/ | f67fe6b8635eb5f35b809e107c76e11a08752439d8eb11198e723fe69f0e5ef7 | Marca; versiones vigentes (Work CR ya no listada) |
| chevrolet-ft-n400-max-2026.pdf | https://www.chevrolet.cl/content/dam/chevrolet/south-america/chile/espanol/index/visid/vans/n400/pdfs/new/ft-n400-max-cl-03-06-26.pdf | 57420dad1f0e6c904a0c8053e89494ceb2dcbee4dadd14b3e7a00560bc699792 | N400 Max 1.5L MT AC T: PBV, carga útil, volumen, motor |
| chevrolet-n400-van.html | https://www.chevrolet.cl/vans/n400-van | 90a0b0ec20605723f6e3ff8d3a46fcf40c5c191a24edbdecae1e46ff0c6d6787 | Marca y presencia |
| chevrolet-ficha-n400-max-xlsx.pdf | https://www.chevrolet.cl/content/dam/chevrolet/south-america/chile/espanol/index/comprar/catalogos/02-pfds/pickups-comerciales/n400/abril/ficha-tecnica-n400-max.xlsx.pdf | 80cfa2e618ad1bfdde2b32bf3ab1eb317b63f5abeca0f845d48cd679e924a378 | Solo contraste (ficha 2021, versiones MT N / MT AC N, caja 5 vel.) |
| hyundai-porter-ficha-actual.pdf | https://www.hyundai.cl/content/uploads/hyu-porter-ficha-tecnica.pdf | c1fe57b88001cd9ec0b078e4183f03fb791e20357994da45c0d3a3edf3a87446 | Porter camioneta: PBV, carga útil, caja, motor |
| hyundai-porter-h100-2024.pdf | https://www.hyundai.cl/content/uploads/ficha-tecnica-porter-h-100-2024-21.5x28-cm.pdf | 4f47245b65224ab328e74bd6148c13f40d6fa6bb66819c78d01698511b89d712 | Solo contraste (mismos valores, 2024) |
| hyundai-porter.html | https://www.hyundai.cl/nuestros-modelos/comerciales/porter/ | dcedd2057b0b88fa30dbef02808e2ad32ae0498be48b90d6a11bdebb7ac04b28 | Marca y presencia (versión rotulada E6D) |
| kia-ft-frontier-feb2026.pdf | https://www.kia.cl/content/dam/indumotora/general/fichas-tecnicas/2026/NEW-FT-Frontier_feb2026_imp.pdf | 1692a998a287bb9133b9efa5e431fa8b7005e498b0b8781832b2766295e3cacd | Frontier pick-up (2511): PBV, caja, motor, mixto |
| kia-eficiencia-frontier-pup.pdf | https://www.kia.cl/content/dam/indumotora/general/ficha-eficiencia-energetica/ficha-eficiencia-energetica-kia-frontier-PUP.pdf | d239ef1699f0601bc60a44408c9de7fcb86a1e2247cfa82bc2f594cca517d5b2 | Etiqueta de eficiencia P/UP LX 2.5L 6MT (mixto 9,7) |
| kia-frontier-pickup.html | https://www.kia.cl/modelos/comerciales/kia-frontier-pickup.html | f5d9355bd2ee7fb9d884a3677d33a2861c9e90272f064bd9fcfaca733764d510 | Presencia |
| hyundai-hd35-light.pdf | https://api.hyundaicamionesybuses.cl/files/vehiculo/HD35%20Light_compressed.pdf | 42337ed10832c90e36c9204d24ebf4227191811089052d2613c314697fef98f3 | HD35 Light: tara, PBV, carga, consumo ciudad, período |

Contraevidencia de ausencia (no verifica valores):

| Archivo | URL | SHA-256 | Uso |
|---|---|---|---|
| toyota-hiace-cargo-redirige.html | https://toyota.cl/modelos/comerciales/hiace-cargo/ (redirige a /modelos/pickup/) | 564ef47827fdf1d13b758d3418064e3f54d8d54e6210d4bf55167dd973957713 | Hiace sin página oficial vigente |
| nissan-vehiculos-nuevos.html | https://www.nissan.cl/vehiculos/nuevos.html | 38a664a8a114133c8e1198752a555bd277688f41f8c785dfb623694f5cc10d1e | Navara no figura entre modelos nuevos |
| toyota-hilux.html | https://toyota.cl/modelos/pickup/hilux/ | fbfbab933046d6fd4c31e372fba0189d68c47fbf759015e0a9f6a7366a0e7e00 | Enlace a la ficha PDF (host S3 no permitido, no descargada) |
| mitsubishi-eficiencia-l200-4x2.pdf | https://mitsubishi-motors.cl/wp-content/uploads/2024/05/ficha-eficiencia-l200-4x2-1.pdf | 78f4674301abb20b7cc2a589bd9f00fa2da3575fdd8c5d4bc0b5821dcdba1626 | Etiqueta L200 Katana XR 4X2 MT (12,1 km/l mixto) — otra versión, no usada |
| mitsubishi-ficha-l200-2025.pdf | https://mitsubishi-motors.cl/wp-content/uploads/2025/03/202609v2-FICHA-L200-Dsk.pdf | e9679321e45734cddc12480c67619b06c6f8e599a3cc3a61fba399ced2d081ef | Ficha vigente L200: solo imagen (sin texto extraíble; no hay OCR) — no usada |
| consumovehicular-index.html | https://www.consumovehicular.cl/ | 45085670f979cc196f42cae858c42a6e860bb9db4031381b0b2a67cbe004c7b9 | Aplicación de una sola página; los datos vienen de un host de API no permitido |

## 2. Condiciones de reutilización por host

Ninguna de las condiciones encontradas autoriza expresamente copiar datos técnicos a un catálogo de terceros. **Antes de publicar el catálogo, el propietario debe decidir** (p. ej., citar como referencia, pedir permiso o limitarse a datos fácticos con enlace). Esto no es asesoría legal.

| Host | Página de condiciones (archivo · SHA-256) | Resumen |
|---|---|---|
| toyota.cl | https://toyota.cl/terminos-y-condiciones/ (toyota-terminos.html · cc91ab9faed7975abe4c5bde393c704cf053e21f01a20a34106d56a511d2d517) | Todo el contenido, incluidas las «compilaciones de datos», es de Toyota Chile. Solo se permite copiarlo en el computador para fines personales, no comerciales ni de difusión. Copiar o adaptar con fines comerciales exige permiso previo y escrito. |
| tienda.toyota.cl | https://tienda.toyota.cl/index.php?id_cms=3&controller=cms (toyota-tienda-terminos.html · 9cd35434e86cd2578a3a7fcd0dde8fd77b66b74c1bd7feada4ab547375a146cb) | Son condiciones de compra. Mencionan la propiedad intelectual de los materiales exhibidos, pero no regulan expresamente la copia de datos. Aplicar por prudencia las condiciones de toyota.cl. |
| mitsubishi-motors.cl | https://mitsubishi-motors.cl/terminos-condiciones/ (mitsubishi-terminos-condiciones.html · 689a1a37d727ed733e96f6fbc11e57436f05fd870e3ed88c68654d5b7ecf5424) y https://mitsubishi-motors.cl/politicas-privacidad/ (mitsubishi-politicas-privacidad.html · f4babf6d2c9aa36acccdfe5f1c99640711bb9aff2972963e6097c1bd9b7ae6c2) | No se encontraron condiciones publicadas para el sitio (revisar). Las páginas halladas cubren solo la App Mitsubishi y la privacidad, y no hablan de copiar contenidos. |
| www.chevrolet.cl | https://www.chevrolet.cl/aspectos-legales (chevrolet-aspectos-legales.html · ca7f2d7760002f97d13ebf749e525916d4fe43e8b352520fe7878173eb6ed005) | El contenido está protegido «como trabajo de colección o compilación» de GM. No se puede reproducir, distribuir, publicar ni crear trabajos derivados, salvo indicación expresa en contrario. |
| www.hyundai.cl | https://www.hyundai.cl/necesitas-ayuda/aspectos-legales-y-politicas-de-privacidad/ (hyundai-legales.html · 09b21dd5529afbf470b12736e8af409eafca90815f1db9bb7ce002dc004be206) | Se puede descargar el contenido solo para uso privado inmediato y sin fin comercial. Se prohíbe reproducirlo, distribuirlo o comunicarlo públicamente, o usarlo con fines públicos o comerciales. |
| api.hyundaicamionesybuses.cl / www.hyundaicamionesybuses.cl | — | No se encontraron condiciones publicadas (revisar). La ruta /terminos del sitio carga su texto desde la API, que exige un encabezado de autorización; no se consultó. El host api no tiene página de condiciones propia. |
| www.kia.cl | https://www.kia.cl/terminos-y-condiciones.html (kia-terminos.html · b1557e0490d4fb5bef2b9618eb793a2f0102368e55901907cb86412e3b7e65a9); privacidad: kia-privacidad.html · 78451b73fa996fd82f90692048dd26230c698b5159c78f84d2a9b6c1e3eb47e0 | No se encontraron condiciones sobre copia de contenidos (revisar). La página contiene bases de promociones y servicios, y la de privacidad trata cookies y datos personales. |
| www.nissan.cl | https://www.nissan.cl/terminos-y-condiciones-generales-del-sitio.html (nissan-terminos-sitio.html · 614f3ffb45aa728a2a10d428969b963721fdc75b755d937768fa42f311bedddd) | Igual que Toyota: las «compilaciones de datos» son de Nissan Chile. Solo se permite copiarlas para uso personal no comercial; cualquier copia comercial requiere permiso escrito. |
| www.consumovehicular.cl | — | No se encontraron condiciones publicadas (revisar). Es una aplicación de una sola página sin texto en HTML y los datos se sirven desde un host no permitido en esta corrida. |
| www.ford.cl, www.kaufmann.cl, www.peugeot.cl, maxus.cl, energia.gob.cl | — | No se pudo abrir ninguna página (HTTP 403 «Access Denied»), tampoco la de condiciones (revisar). |
| configuradorpro.peugeot.cl | — | HTTP 503; no se pudo leer (revisar). |
| www.anac.cl, www.mtt.gob.cl, www.bcn.cl | — | No se usaron como fuente de datos en esta corrida. |
