# 07 · Registro de decisiones

Este documento distingue **lo aprobado** de **lo pendiente**. Cada decisión nueva se registra aquí mediante un PR.

## Aprobadas por el propietario

| # | Decisión | Fecha |
|---|---|---|
| A-01 | Repositorio **público** | 2026-11-16 |
| A-02 | **Ningún cargo variable** de APIs autorizado inicialmente | 2026-11-16 |
| A-03 | Las cuentas de servicios quedan bajo **titularidad y control del propietario** | 2026-11-16 |
| A-04 | Roles: propietario (decide), Claude (desarrollador principal), ChatGPT (contraparte técnica) | 2026-11-16 |
| A-05 | Arquitectura: TypeScript estricto, React + Vite, Cloudflare Workers, motor independiente, **proyecto único** | 2026-11-16 |
| A-06 | Etapas **E0–E5** | 2026-11-16 |
| A-07 | Trello se organiza **después** de GitHub. GitHub es la fuente de verdad técnica. | 2026-11-16 |
| A-08 | No se integra nada a `main` sin autorización del propietario | 2026-11-16 |

## Acordadas en planificación técnica (se formalizan al aprobar el PR #23)

| # | Decisión | Detalle |
|---|---|---|
| T-01 | Dos modos: "Soy fletero" y "Necesito transportar algo" | [01](01-alcance.md) |
| T-02 | Las cinco medidas del motor y la clasificación de partidas | [03](03-motor-de-costos.md) |
| T-03 | Tercerización: Δ = (A + B) − (Q + G + S) | [03](03-motor-de-costos.md) |
| T-04 | La remuneración del dueño es una **meta**, no un pago | [03](03-motor-de-costos.md) |
| T-05 | Sin factores de carga ni de velocidad hasta tener datos de calibración. Valores por defecto solo con fuente y etiqueta. | [03](03-motor-de-costos.md), [05](05-pruebas-y-calibracion.md) |
| T-06 | `null` ≠ `0`; "costo parcial" cuando falta un componente | [03](03-motor-de-costos.md) |
| T-07 | Hasta 2 paradas intermedias en v1 | [01](01-alcance.md) |
| T-08 | "Abrir en Google Maps" obligatorio; mapa incrustado fuera de la v1 | [01](01-alcance.md) |
| T-09 | Peajes manuales siempre disponibles | [01](01-alcance.md) |
| T-10 | Comparador con 4 estados; una categoría genérica nunca es "compatible" | [01](01-alcance.md) |
| T-11 | Ingreso de direcciones decidido por experimento (texto frente a Autocomplete), sin adoptar Autocomplete por defecto | #19 |
| T-12 | Reproducibilidad del motor separada de la reproducción de rutas externas | [03](03-motor-de-costos.md) |
| T-13 | Inventario de datos personales y minimización | [06](06-seguridad-y-privacidad.md) |
| T-14 | Flujo de entrega por PR con vista previa; el propietario aprueba sin comandos | [09](09-revision-y-aprobacion.md) |
| T-15 | Rama `main` creada con un commit vacío para recibir PR (sin contenido integrado) | Este PR |

## Pendientes del propietario

| Issue | Decisión | Bloquea a |
|---|---|---|
| #7 | Licencia del repositorio público | Publicación (E5) |
| #8 | Contratación de servicios y titularidad de cuentas | E1 (vista previa), E2, E3 |
| #9 | Facturación de Google y topes de uso | #19, E2 |
| #10 | Solución de peajes | E3 |
| #11 | Políticas del comparador (umbrales, categorías no calibradas, textos) | E4 |
| #12 | Criterios finales de calibración | E5 |
| #13 | Dominio y nombre definitivo | Publicación (E5) |
| #14 | Publicación pública de la aplicación | v1.0 |

## Investigaciones técnicas pendientes

| Issue | Tema | ¿Genera gasto? |
|---|---|---|
| #15 | Términos de Google Maps Platform | No |
| #16 | Marco tributario y regulatorio | No |
| #17 | Privacidad: Ley 21.719 | No |
| #18 | Límites de Cloudflare | No |
| #19 | Experimento de direcciones y facturación de Routes | Dentro del tramo gratuito; requiere #8 y #9 |
| #20 | API CNE | No (el registro requiere autorización, #8) |
| #21 | Automatización de peajes | No, salvo la prueba de Google (requiere #9) |
| #22 | Catálogo de categorías de vehículo | No |
