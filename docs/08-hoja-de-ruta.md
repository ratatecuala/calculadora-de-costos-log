# 08 · Hoja de ruta E0–E5

Estado: **aprobada**. No se comprometen fechas: dependen de las decisiones del propietario y de la disponibilidad de vehículos para calibrar.

Las entregas E1 a E4 son **internas**: se prueban en URLs de vista previa. Solo E5 publica, y con autorización expresa (#14).

| Etapa | Épica | Entregable | Público | Requisitos para empezar |
|---|---|---|---|---|
| **E0** Decisiones y preparación | #1 | Documentación aprobada, decisiones de cuentas y facturación, investigaciones sin costo, 10 casos dorados | — | — |
| **E1** Motor y calculadora manual | #2 | Las cinco medidas probadas, km y peajes manuales, ambos modos en formato básico, vista previa por PR | Interno | #23, #24, #18, #8 (Cloudflare) |
| **E2** Calculadora con rutas | #3 | Routes Essentials (hasta 2 paradas y regreso), ingreso de direcciones según #19, "Abrir en Google Maps", protecciones de cuota, perfiles locales, modo degradado | Interno | E1, #9, #19 |
| **E3** Precios y peajes | #4 | Precio CNE con fecha y respaldo, peajes según #10 | Interno o beta | E2, #20, #21, #10 |
| **E4** Comparador y cotizaciones | #5 | 4 estados de compatibilidad, evaluador de tercerización, catálogo con fuente | Beta cerrada | E1, #22, #11, #16 |
| **E5** Calibración y v1.0 | #6 | Calibración, pruebas de comprensión, revisión de seguridad y privacidad, textos legales, publicación | **Público** | E2–E4, #12, #13, #7, #14 |

## Orden crítico

```
#23 docs aprobadas ─┬─> #24 casos dorados ─> E1 (motor + formulario manual)
                    └─> #18 Cloudflare ────┘
#8 cuentas ─> #9 facturación ─> #19 experimento de direcciones ─> E2
#20 CNE + #21 peajes ─> #10 decisión de peajes ─> E3
#22 catálogo + #11 políticas + #16 IVA ─> E4
#12 criterios + #13 dominio + #7 licencia ─> E5 ─> #14 publicación
```

## Principio de control

Cada etapa se detalla en issues concretos **solo cuando empieza**. Hoy existen issues detallados para E0 y E1; E2 a E5 tienen su alcance como lista de verificación dentro de su épica.
