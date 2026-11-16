# Convenciones de desarrollo y contribución

**Las reglas obligatorias para todos los agentes están en [AGENTS.md](AGENTS.md).**

## Ramas

- `main`: rama estable. **Nada se integra sin autorización del propietario.**
- Ramas de trabajo por **issue, entregable o conjunto coherente de tareas**: `feat/…`, `fix/…`, `docs/…`, `data/…`, `chore/…`. Las sesiones de Claude pueden usar ramas `claude/…`. Se admiten issues grandes y varias ramas activas en paralelo, con responsables, dependencias y archivos afectados claros. Evitar editar los mismos archivos simultáneamente sin coordinación.
- Integración por **squash merge**: un commit por PR.

## Tamaño y trabajo en paralelo

- Los issues **pueden ser grandes** y abarcar varios componentes relacionados; no es obligatorio dividirlos en microtareas.
- **Pueden avanzarse varios issues a la vez** si sus dependencias y puntos de integración están identificados.
- Los PR pueden agrupar cambios relacionados cuando se puedan **revisar, probar y revertir con seguridad**. Separar cuando mezclar cambios aumente el riesgo de error o confusión.
- No integrar un cambio si las pruebas fallan, hay conflictos pendientes o el propietario no lo autorizó.

## Commits

Se usa [Conventional Commits](https://www.conventionalcommits.org/es/) en español:

```
feat(motor): calcular desgaste por km
fix(ui): corregir redondeo del precio sugerido
docs: actualizar registro de decisiones
data(peajes): tarifas 2027 de Costanera Norte (fuente: MOP, 2027-01-02)
```

Tipos: `feat`, `fix`, `docs`, `data`, `test`, `refactor`, `chore`, `ci`.

## Pull requests

Cada PR debe:
1. Enlazar su issue (`Refs #N`), sin cerrar automáticamente el issue antes de verificar y autorizar su cierre.
2. Completar la plantilla, incluida la sección **"Cómo probar"** con pasos que el propietario pueda seguir sin comandos.
3. Pasar la CI (desde E1).
4. Si cambia el motor: actualizar los casos dorados o justificar por qué no cambian, subir `engineVersion` y registrar el cambio en el CHANGELOG.
5. Si cambia un dataset: citar fuente, fecha y licencia.
6. No contener secretos, datos personales ni datos de calibración.

## Etiquetas

| Grupo | Etiquetas |
|---|---|
| Tipo | `épica` · `funcionalidad` · `investigación` · `documentación` · `error` · `decisión del propietario` |
| Área | `área: motor de costos` · `área: interfaz` · `área: integraciones` · `área: seguridad` · `área: pruebas` · `área: datos` · `área: infraestructura` |
| Prioridad | `prioridad: P0` (bloqueante) · `prioridad: P1` (necesaria para la etapa) · `prioridad: P2` (deseable) · `prioridad: P3` (futuro) |
| Estado | `estado: listo` · `estado: en revisión` · `estado: bloqueado` · `estado: requiere decisión` |
| Etapa | `etapa: E0` … `etapa: E5` |

Mientras no existan hitos (#25), la etapa se indica con la etiqueta `etapa:`.

## Definición de "terminado"

Una tarea está terminada cuando se cumple todo lo siguiente:
- su PR está integrado con la CI en verde;
- tiene pruebas, si toca lógica;
- la documentación y el registro de decisiones están actualizados, si corresponde;
- no hay secretos ni datos personales;
- las páginas nuevas pasan la revisión de accesibilidad (sin violaciones críticas, navegación por teclado);
- se cumplen los criterios de aceptación del issue;
- el propietario aprobó, si el cambio es visible para el usuario.

## Código (desde E1)

- TypeScript en modo `strict`. No se usa `any` sin justificación escrita.
- `src/engine` no importa nada de `web`, `worker`, red ni DOM.
- Unidades con tipos distinguibles (km, L, CLP neto, CLP bruto).
- `null` significa "falta el dato", no "cero".
- No se agrega ninguna dependencia nueva sin justificarla en el PR.

## Reportar errores de cálculo

Usa la plantilla **"Error"**. Un error de cálculo tiene prioridad alta aunque parezca pequeño.
