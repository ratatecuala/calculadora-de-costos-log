# 26 · Preparación técnica de la fase 0: datos económicos, staging y coordinación (A-87)

> **Estado: PROPUESTO.** Revisión técnica y documental hecha por Claude el 26-11-2026 (hora de Chile) sobre `f5ea3b5`, con la [autorización A-87](https://github.com/ratatecuala/calculadora-de-costos-log/issues/43#issuecomment-7181640658). **No** cambia código, fórmulas, datos de la app, migraciones, flags ni APIs. **No** hubo investigación externa (A-86): todo sale del repositorio, sus issues y sus documentos. Nada de esto autoriza implementar: cada paso de §6 pide su propia aprobación.

**Objetivo:** que, cuando llegue evidencia económica verificable de Deep Research o de las mediciones del propietario, se pueda incorporar **sin improvisar, sin duplicar lógica y sin alterar cotizaciones ya emitidas**.

## 1. Matriz técnica

Responsables según A-86: **DR** = ChatGPT Deep Research · **GPT** = requisitos, evaluación y auditoría · **Claude** = arquitectura, datos e integración · **Codex** = instrumentos, motor, pruebas y CI · **Prop.** = propietario.

| Componente | Estado actual | Trabajo pendiente | Dependencias | Responsable | Pruebas | Autorización requerida |
|---|---|---|---|---|---|---|
| **1 · Precio de combustible** (93, 95, 97, diésel · #20, #4) | Solo **manual**: `fuelPricePerL` lo escribe el usuario (`src/engine/inputs.ts`, `Calculator.tsx`). El tipo de combustible es `gasolina`/`diesel`/`otro`, **sin octanaje** (`src/shared/vehicle.ts`, columna `vehicles.fuel`). La cotización **no guarda** el precio usado ni su fuente | Referencia diaria por producto (Worker + caché), octanaje en el vehículo, precio usado y procedencia en la cotización (§3) | #8 (cuenta CNE), #20 (condiciones, campos, método del promedio), §3 | DR (condiciones y método) · GPT (requisitos) · Claude (Worker, caché, contrato, migración `vehicles`) · Codex (pruebas del promedio) | Unitarias del promedio y del «último dato válido»; contrato del endpoint; e2e: referencia → precio editado → se conserva; cotización emitida inmutable tras cambiar la referencia | #8 cuenta y registro CNE; método del promedio; migración de octanaje; uso de la API |
| **2 · TAG y peajes** (#21, #10) | Solo **manual**: `tolls` con tres estados (`null` = no sabe, `0` = declaró cero, monto). Correcto según docs/04 §4 | Nada que programar hasta tener fuente. Después: tabla versionada de tarifas por pórtico, sentido, horario, categoría y fecha; asociación ruta→pórticos | Informe DR de #21; decisión #10; **rutas automáticas (Google Routes, no autorizado)** para saber qué pórticos cruza un recorrido | DR · GPT · Claude (modelo de datos) · Codex (pruebas de tarifas) | Casos dorados por pórtico/horario/categoría; «desconocido» nunca se convierte en 0 | #10; sin rutas automáticas, solo ayudas de ingreso manual |
| **3 · Catálogo C-1** (#46, #22) | `datos/catalogo-c1/` v4: **solo candidatos**, no se carga en la app; 0 versiones completas (A-83). Snapshot v2 ya tiene `catalogId` y `catalogDataVersion` (`src/shared/snapshot.ts`). Borrador M1 `vehicle_catalog` en docs/21 §5.1 | Completar o reemplazar versiones (DR), umbrales de `camionMediano`, decidir reutilización por marca, migración M1 y vínculo con «Mis vehículos» | Condiciones de reutilización (4 marcas lo prohíben), D-8/D-9 de #43, §3 | DR (fichas oficiales) · GPT (umbral y criterio) · Claude (M1, vínculo) · Codex (`tests/catalogo-candidatos.test.ts`) | Las reglas de candidatos ya existen; agregar: la ficha nunca sobrescribe lo que el usuario midió; rendimiento homologado rotulado «referencia», no «real» | Cargar el catálogo (migración, D-8, D-9) |
| **4 · Costos según carga y recursos C-2** (#44, #48, #51) | Inventario y recursos **informativos** detrás de flags apagadas (`src/shared/cargo.ts`, `resources.ts`): no entran al costo. El motor usa un km/L único y ayudantes por servicio | Informe C-2; por cada fórmula aprobada: casos dorados y versión de fórmula (`formulaVersion` ya existe en v2) | Informe DR de C-2; D-5 y D-6 de #43; A-50 (cambio de fórmulas) | DR · GPT (fórmula candidata) · Codex (motor y casos dorados) · Claude (snapshot e integración) | Casos dorados recalculados de forma independiente; las cotizaciones v1/v2 se muestran con su costo original | Cada fórmula (D-5), modalidad de ayudantes (D-6), encender flags |
| **5 · Rendimiento declarado y calibrado** (#12, 0B) | El usuario declara `kmPerL` en su vehículo. `npm run campo` (`scripts/campo/`) **calcula la estimación** del motor por viaje, pero **no registra lo medido** (litros lleno a lleno, cartola TAG, tiempos separados) ni compara | Instrumento 0B: columnas de lo medido, clase comparable, intervalo lleno a lleno, informe por clase (n, media, CV, desviación máx., «insuficiente» si n < 3). Más tarde: rendimiento calibrado por vehículo con procedencia | Umbrales de #12 (pendientes), error de llenado (DATO FALTANTE), datos del Chery en `calibracion/` (fuera de Git) | Codex (instrumento e informe) · GPT (método) · Prop. (mediciones) · Claude (dónde vive el valor calibrado, §3) | Pruebas con datos **ficticios**: clases que no se mezclan, n < 3 = insuficiente, CV correcto contra cálculo independiente, ningún dato personal en la salida | Umbrales de #12; usar un valor calibrado en el cotizador (fase 3) |
| **6 · Desgaste, mantención y gastos fijos** | El usuario declara `wearPerKm` ($/km) y `fixedPerHour` ($/h) directamente. docs/03 §2 define `CF = F_anual ÷ H_prod_año`, pero la app pide el resultado ya dividido | Ayuda de cálculo opcional que derive $/km de gastos y km de un periodo, y $/h de gastos anuales y horas productivas, **sin cambiar el motor** (solo prellenar) | Horizonte de medición (DATO FALTANTE); evidencia C-2 de desgaste según carga; 0B | Codex (función pura y pruebas) · Claude (UI y procedencia) · GPT (textos) | Casos dorados de la derivación; resultado idéntico al declarar el mismo número a mano; vacío ≠ 0 | Programar la ayuda (es UI, no fórmula del motor, pero cambia cómo se obtiene un dato) |
| **7 · Procedencia, fecha, vigencia y confiabilidad** | Existe el patrón en `data/tax-rules.json` (`dataVersion`, `verified`, `source`, `verifiedAt`) y en los candidatos C-1. La cotización guarda `engineVersion` y, en v2, `formulaVersion` y `catalogDataVersion`, pero **no** los valores de entrada ni su fuente (docs/03 §6 lo pedía) | Contrato único de procedencia y snapshot **v3** (§3) | Nada externo: es la base de los componentes 1 a 6 | Claude (contrato y snapshot) · Codex (pruebas de compatibilidad) · GPT (auditoría) | Lectura v1/v2/v3; tope de 16 KB; un v3 alterado se rechaza; la vista de una cotización vieja no cambia | Implementar el contrato y v3 (programación) |
| **8 · Staging** (docs/25, #52, I-2, precio entero) | Todo preparado, **nada ejecutado**. 4 migraciones locales sin aplicar: #52, M3′, M4′ y precio entero | Pasos del propietario (§4) y dos correcciones de docs/25 hechas en este commit (§4.1) | Equipo con Windows 11/WSL, contraseña de la base, autorizaciones individuales | Prop. (ejecuta) · Claude y GPT (revisan resultados) · Codex (simulacro con precio entero, §4.1) | 98/98 del simulacro ya ejecutadas con datos ficticios; faltan las reales | Fase 3 de docs/25 (lectura en staging), A-59 y una por cada migración posterior |

## 2. Detalle por componente

### 2.1 Precio de combustible (#20)

- **Archivos:** `src/engine/inputs.ts` (`fuelPricePerL`), `src/web/components/Calculator.tsx` (campo y ejemplo ficticio), `src/shared/vehicle.ts` y `supabase/migrations/20261118000315_esquema_inicial.sql` (`vehicles.fuel` con `check` de tres valores), `src/web/jobs.ts` (snapshot sin el precio).
- **Qué debe entregar DR** (complemento de #20, sin abrir otra investigación): condiciones de uso y reutilización de la API de la CNE; campos exactos por producto (93, 95, 97, diésel) y por modalidad de atención; frecuencia de actualización; cuotas; qué estaciones y modalidades conviene promediar y por qué; cómo citar la fuente.
- **Diseño propuesto:**
  - un *cron* diario del Worker (Cloudflare, plan gratuito) consulta la CNE **una vez** y guarda en caché una referencia por producto: valor, n de estaciones, fecha de consulta, fuente y `dataVersion`;
  - el cliente prellena el precio con esa referencia y la rotula; si el usuario escribe otro precio, ese gana y queda como «declarado»;
  - si la consulta falla, se muestra la última referencia válida con su fecha; si nunca hubo una, se pide el precio manual;
  - el vehículo gana un campo opcional `fuelProduct` (`g93`, `g95`, `g97`, `diesel`). Un vehículo antiguo con `gasolina` sigue válido y se le pide el octanaje solo al usar la referencia.
- **Sin duplicar lógica:** el motor sigue recibiendo un número; la referencia solo **prellena** `TripParams`.
- **Históricos:** la cotización v3 guarda el precio usado y su procedencia (§3); un cambio de la referencia nunca recalcula lo emitido.

### 2.2 TAG y peajes (#21)

- **Archivos:** `src/engine/inputs.ts` (`tolls`), `scripts/campo/evaluar.ts` (`tag_clp`, `fuente_tag`).
- **Qué debe entregar DR:** las opciones A–D de #21 con fuentes oficiales (concesionarias y MOP), granularidad real de las tarifas (pórtico, sentido, horario, categoría vehicular, fecha), si existe un dato abierto reutilizable, y la correspondencia entre las categorías de peaje y los tipos de vehículo de la app.
- **Bloqueo real:** sin rutas automáticas no se sabe qué pórticos cruza un recorrido manual. Mientras Google Routes siga sin autorizar, la automatización completa no es posible. Lo viable antes es una **ayuda de ingreso** (elegir pórticos de una lista con su tarifa vigente), que igual requiere el informe y una aprobación.
- **Para 0B no hace falta programar nada:** la cartola o el comprobante TAG del propietario es el valor medido.

### 2.3 Catálogo C-1 (#46)

- **Archivos:** `datos/catalogo-c1/` (`candidatos.json`, `fuentes.md`, `notas.md`), `tests/catalogo-candidatos.test.ts`, `src/shared/snapshot.ts` (`vehicleV2Schema`), docs/21 §5.
- **Qué debe entregar DR:** reemplazo de las 9 versiones sin verificar por versiones con ficha oficial descargable; criterio y fuente para el umbral de `camionMediano`; condiciones de reutilización por marca. El rendimiento homologado siempre se rotula como **referencia**, nunca como consumo real (docs/04 §5).
- **Diseño:** el catálogo es una tabla de solo lectura con `catalogDataVersion`; «Mis vehículos» copia los valores **al crear** el vehículo y guarda `catalogId`. Lo que el usuario mide o corrige nunca lo pisa una actualización del catálogo.

### 2.4 Costos según carga y recursos C-2 (#44)

- **Archivos:** `src/shared/cargo.ts`, `src/shared/resources.ts`, `src/web/modules/integracion.ts`, flags en `src/web/featureFlags.ts`.
- **Qué debe entregar DR:** exactamente el encargo ya redactado en [20 · C-2](20-encargos-deep-research-cotizador.md#c-2--costo-de-un-flete-según-la-carga-y-los-recursos). No hace falta otro.
- **Incorporación:** cada fórmula aprobada entra como **función pura nueva** en `src/engine/`, con sus casos dorados, y sube `formulaVersion`. El snapshot guarda la versión usada; una cotización vieja se muestra con su costo original y su versión, sin recalcular.

### 2.5 Rendimiento declarado y calibrado (#12)

- **Archivos:** `scripts/campo/evaluar.ts` y `registro.ts`, `datos/pruebas-campo/plantilla.csv` (solo datos ficticios), docs/05 §4, docs/08 §0B.
- **Qué falta en el instrumento 0B** (trabajo de Codex, sin cambiar el motor):
  1. columnas de **lo medido** por viaje: km de TRIP, minutos de marcha, de espera y de carga/descarga por separado, TAG de la cartola, ayudantes pagados;
  2. registro de **llenados**: fecha, odómetro, litros, «lleno» sí o no, para calcular el rendimiento lleno a lleno con la fórmula de docs/05 §4;
  3. **clase comparable** por intervalo: recorrido × carga × aire acondicionado;
  4. informe por clase: n, media, desviación, coeficiente de variación y desviación máxima; «insuficiente» con n < 3; los umbrales se muestran como **por aprobar** hasta que se fijen en #12;
  5. comparación estimado frente a medido **por partida**.
- **Datos:** los reales van solo en `calibracion/` (excluida en `.gitignore`); las pruebas usan datos ficticios.

### 2.6 Desgaste, mantención y gastos fijos

- **Archivos:** `src/engine/inputs.ts` (`wearPerKm`, `fixedPerHour`), `src/shared/vehicle.ts`, docs/03 §2.
- **Qué debe entregar DR:** evidencia de desgaste según carga (pregunta 2 de C-2, ya incluida). **Lo principal no es investigación:** son los gastos reales del propietario en un periodo (neumáticos, aceite, mantención, seguro, permiso, revisión técnica), cuyo horizonte es DATO FALTANTE.
- **Propuesta:** una ayuda opcional que **prellene** `wearPerKm` = gastos del periodo ÷ km del periodo y `fixedPerHour` = gastos anuales ÷ horas productivas al año (la fórmula que ya aprobó docs/03). El motor no cambia.

### 2.7 Procedencia (base de todo lo anterior)

Ver §3. Es el único trabajo que conviene hacer **antes** de recibir los informes, porque los demás dependen de él.

## 3. Arquitectura propuesta para incorporar datos sin retrabajo

1. **Un solo contrato de procedencia** en `src/shared/procedencia.ts`, reutilizado por combustible, TAG, catálogo, calibración y desgaste:
   - `estado`: `verificado` · `estimado` · `supuesto` · `declarado` (por el usuario) · `faltante` (las categorías de AGENTS.md §4);
   - `fuente`: nombre, tipo (`primaria`, `secundaria` o `usuario`) y enlace si es público;
   - `consultadoEl`, `vigenteDesde` y `vigenteHasta` (puede ser `null`);
   - `dataVersion` del conjunto de datos.

   El formato de `data/tax-rules.json` es un caso particular y se migra a este contrato sin cambiar su contenido.
2. **El motor no cambia.** Sigue recibiendo números en `TripParams`. La procedencia viaja **al lado**, en la sesión (`origen` por parámetro) y en el snapshot.
3. **Snapshot v3** (aditivo, como v2 sobre v1):
   - `params`: los valores efectivamente usados (combustible, rendimiento, desgaste, fijos, trabajo, ayudantes, carga, peajes y otros);
   - `procedencia` por parámetro;
   - `dataVersions`: combustible, catálogo, peajes y fórmulas.

   v1 y v2 se siguen leyendo tal cual con `readSnapshot`, sin recalcular. v2 es `.strict()`, así que los campos nuevos exigen v3, no modificar v2. El servidor no valida la versión del JSON (`create_job_with_quote_v2` solo lo guarda, con el tope de 16 KB de `jobs.internal`), así que **v3 no necesita migración**. Sí hay que medir el tamaño (docs/21 §7).
4. **Datos de referencia versionados:**
   - estáticos (catálogo, tarifas de peaje): archivo o tabla de solo lectura con `dataVersion`;
   - dinámicos (combustible): caché del Worker con fecha y fuente.

   La app solo **prellena**; el usuario siempre puede escribir su valor, que queda como «declarado».
5. **Inmutabilidad:** una cotización emitida conserva sus números y su procedencia. Ningún cambio de datos, fórmula o catálogo la recalcula.

## 4. Staging: qué falta y qué haces tú

### 4.1 Lo que revisé en docs/25 (corregido en este commit)

- **1.1 estaba desactualizado:** en el repositorio ya hay **4** migraciones sin aplicar, no 1: #52 (`20261122120000`), M3′ y M4′ de I-2 (`20261125120000` y `20261125120100`) y precio entero (`20261125130000`). Un `supabase db push` aplicaría **las cuatro**.
- **1.2 estaba desactualizado:** el repositorio **sí** tiene `.github/workflows/a83.yml` desde A-83. Lo revisé: solo corre pruebas en PostgreSQL desechable dentro de GitHub, con permiso de solo lectura, y **no** se conecta a Supabase. La integración con GitHub del panel de Supabase sigue **POR CONFIRMAR**.
- **Pendiente técnico (no corregido, es código):** el simulacro (`scripts/simulacro/simulacro-restauracion.sh`) reconoce #52 e I-2, pero **no** la migración de precio entero. Hoy no importa, porque staging no la tiene. Debe agregarse **antes** de aplicarla en staging. Propuesto para Codex.

### 4.2 Tus pasos, en orden

Ninguno es obligatorio hoy: cada uno empieza cuando tú lo decidas. Los comandos exactos están en [25](25-lista-staging-52.md).

| # | Qué haces | Dónde | Necesitas | Resultado esperado | ¿Toca Supabase? |
|---|---|---|---|---|---|
| 1 | Preparar el computador una sola vez: Ubuntu en Windows (WSL), PostgreSQL 17, `age` y tu clave de respaldo | 25 · Fase 0 | 30–60 minutos | La clave guardada en tu gestor de contraseñas | No |
| 2 | Mirar en el panel de Supabase: *Database → Migrations* muestra **solo** las 3 del 18-11, y la integración con GitHub está apagada | 25 · 1.1 y 1.2 | Entrar al panel | Solo 3 migraciones; integración apagada | Solo mirar |
| 3 | Descargar el certificado raíz y configurar la conexión segura con el asistente | 25 · 1.3 | La contraseña de la base | `Conexión correcta … TLS verificado` | Sí, una conexión de prueba |
| 4 | Hacer el respaldo cifrado y guardar una segunda copia | 25 · 2.1 y 2.2 | Elegir el segundo lugar (DATO FALTANTE) | `Respaldo listo` | Sí, solo lectura |
| 5 | Ejecutar el simulacro de restauración en tu computador | 25 · 2.3 | El respaldo del paso 4 | `DATOS VERIFICADOS` | No |
| 6 | Pegar en #52 los resultados de los pasos 4 y 5 (solo números) | #52 | — | Revisión de Claude y GPT | No |
| 7 | **Autorizar y ejecutar** las consultas de solo lectura V1–V17 | 25 · Fase 3 | Una autorización escrita tuya | V17 = `on` y semáforo en verde | Sí, solo lectura |
| 8 | Leer la revisión y decidir **A-59** | 25 · Fases 4 y 5 | — | Tu sí o no en #43 | — |

**Después de A-59** (cada una con su autorización, y en este orden, porque dependen entre sí):
1. aplicar #52, repetir V1–V17, las pruebas de RLS y numeración y el e2e de staging 59/59, y hacer un respaldo nuevo;
2. aplicar M3′ y M4′ de I-2, que exigen #52 aplicada y auditada; la flag `VITE_FF_CARGA_NUBE` sigue **apagada**;
3. agregar precio entero al simulacro (§4.1) y luego aplicar `20261125130000`;
4. redesplegar staging, solo si lo autorizas.

## 5. Coordinación con Codex (A-82 y A-86)

Regla: **archivos separados, una rama por frente, integración secuencial en la rama del PR #34.** Nadie toca `tests/i2-nube.test.ts` sin pedido expreso.

| Frente | Responsable | Archivos exclusivos | Issue | Puede empezar |
|---|---|---|---|---|
| Instrumento 0B: medido, llenados, clase comparable e informe | **Codex** | `scripts/campo/`, `datos/pruebas-campo/` (solo ficticios), sus pruebas | #12 | Al autorizarlo (no espera a DR) |
| Simulacro con precio entero | **Codex** | `scripts/simulacro/` | #52 | Al autorizarlo |
| Contrato de procedencia y snapshot v3 | **Claude** | `src/shared/procedencia.ts`, `src/shared/snapshot.ts`, `src/web/jobs.ts`, `src/web/saveQuote.ts` | #45 | Al autorizarlo (no espera a DR) |
| Ayuda de desgaste y gastos fijos (función pura) | **Codex** | `src/engine/` (archivo nuevo) y pruebas | #28 | Tras el contrato de procedencia |
| Integración de la ayuda en la UI | **Claude** | `Calculator.tsx`, `VehiclesView.tsx` | #28 | Tras la función pura |
| Referencia de combustible (Worker, caché, endpoint) | **Claude** | `src/server/`, `wrangler.jsonc`, migración de `fuelProduct` | #20, #4 | Tras el informe de #20 y #8 |
| Pruebas del promedio de combustible | **Codex** | pruebas nuevas | #20 | Junto con el anterior |
| Carga de C-1 (M1 y vínculo) | **Claude** | `supabase/migrations/` (nueva), `src/web/cloud/vehicles.ts` | #46 | Tras el informe y D-8/D-9 |
| Fórmulas C-2 | **Codex** (motor) y **Claude** (snapshot) | `src/engine/` y `src/shared/snapshot.ts`, en ese orden | #44, #48 | Tras el informe y D-5/D-6 |

No se crean issues ni épicas nuevas: todo cabe en los existentes.

## 6. Orden recomendado y bloqueos

**Mientras esperamos los informes de Deep Research** (cada uno con su aprobación, sin datos externos):
1. instrumento 0B (Codex), para que el propietario empiece a medir el Chery con algo que ya compare estimado contra medido;
2. contrato de procedencia y snapshot v3 (Claude), porque todos los datos futuros lo necesitan;
3. simulacro con precio entero (Codex), para no frenar el paso 3 de staging después;
4. ayuda de desgaste y gastos fijos (Codex y luego Claude).

**Después, según llegue la evidencia:** combustible (#20) → C-1 (#46) → C-2 (#44) → TAG (#21).

**Bloqueos reales:**
- umbrales de #12 sin aprobar: el informe 0B solo puede mostrar «por aprobar»;
- cuenta y registro en la CNE (#8) y condiciones de uso (#20);
- TAG automático depende de rutas automáticas, y Google Routes no está autorizado;
- C-1: 4 marcas prohíben reproducir su contenido; 9 versiones sin verificar;
- staging: respaldo real, simulacro y autorización de la fase 3 de docs/25, luego A-59;
- presupuestos, plazos e iteraciones de cada fase: DATO FALTANTE.

**Pruebas:** este documento no cambia código, así que no se corrieron las suites (A-82 §11.3). La CI de `165606a` está en verde.
