# 09 · Cómo revisar y aprobar cambios (guía para el propietario)

No necesitas programar ni ejecutar comandos. Todo se hace desde la web de GitHub, también en el teléfono.

## Estado actual de las aprobaciones

La documentación del **PR #34** refleja el **alcance actualizado**. La **dirección visual v4 blanco/azul/grafito y las muestras de inicio/calculadora** están aprobadas por el propietario. El 16-11-2026 el propietario aprobó también la **extensión de las demás pantallas** y los criterios funcionales (A-21 a A-29). El **backlog se actualizó** ese día (ver [08](08-hoja-de-ruta.md)). Siguen pendientes **nombre comercial, aprobación de la arquitectura propuesta (proveedor de cuentas, Supabase #35) y límites de API**. Ver [guía UX v4](10-diseno-ux.md). Aprobar un documento no autoriza código, cuentas, despliegues, suscripciones ni cargos. 

## El ciclo de un cambio

1. **Claude trabaja en una rama** y abre un **pull request (PR)**: una propuesta de cambio que todavía no afecta a `main`.
2. **GitHub ejecuta las pruebas automáticamente** (desde E1). En el PR verás:
   - ✅ verde: las pruebas pasaron;
   - ❌ rojo: algo falló. Claude debe corregirlo antes de que lo revises.
3. **Vista previa** (desde E1): el PR incluye un enlace para abrir la versión de prueba en tu teléfono.
4. **Sección "Cómo probar"**: cada PR trae de 3 a 6 pasos con el resultado esperado. Por ejemplo: _"Ingresa 80 km y 10 km/L; debe decir 8 L."_
5. **ChatGPT revisa** el contenido técnico y deja sus observaciones.
6. **Tú decides:**
   - **Aprobar:** comenta en el PR _"Aprobado, puedes integrar"_. Los PR de Claude aparecen creados con tu cuenta, porque Claude actúa a través de la app de GitHub conectada a ella, y GitHub no permite aprobar formalmente un PR propio. Por eso **tu comentario es la aprobación oficial**.
   - **Pedir cambios:** comenta qué no funciona o qué no entiendes. No hace falta usar lenguaje técnico.
7. **Integración:** solo después de tu aprobación expresa, el PR se integra a `main`, ya sea con el botón **Merge pull request** o lo hace Claude por instrucción tuya.

## Qué revisar en un PR de documentación

- ¿Refleja lo que acordamos?
- ¿Lo **pendiente** aparece claramente como pendiente?
- ¿Hay algún dato personal, clave o documento privado? Si lo hay, **no apruebes** y avísalo.

## Qué revisar en un PR de código (desde E1)

- ✅ verde en las pruebas.
- Seguiste los pasos de "Cómo probar" y obtuviste lo esperado.
- Los textos se entienden sin conocimientos contables.
- El trayecto A → B y base/regreso opcionales no duplican kilómetros ni costos.
- La ruta más barata se afirma únicamente cuando se conocen componentes importantes como peajes.
- Se comprueban acceso anónimo, guardado con Google y PDF sin costos internos, según el alcance del PR.

## Qué siempre requiere tu autorización

1. Cualquier gasto o medio de pago.
2. Crear cuentas o asignar su titularidad.
3. Cambiar la visibilidad del repositorio.
4. Publicar en una URL pública.
5. Cambiar las definiciones o fórmulas del motor.
6. Cambiar o agregar fuentes de datos.
7. Ampliar el alcance.
8. Borrar o reorganizar el repositorio o Trello.
9. Los textos legales.
10. Calibrar con datos de terceros.
11. Integrar a `main` cualquier PR.

## Decisiones pendientes

Las encuentras filtrando los issues por la etiqueta **`decisión del propietario`**. Para decidir, comenta en el issue tu elección. Claude la registrará en [07 · Decisiones](07-decisiones.md) mediante un PR.
