/**
 * Interruptores de funciones en desarrollo (A-66).
 *
 * `modulosCargaRecursos`: editores de inventario (#47) y recursos (#51). **Desactivado** salvo que
 * la compilación defina `VITE_FF_CARGA_RECURSOS=1` (solo para pruebas locales). Ningún archivo
 * `.env` del repositorio lo activa, y con el valor por defecto Vite elimina el código de la vista
 * previa del paquete. Aun activado, la vista previa NO se conecta al cotizador, no guarda nada y
 * no cambia el resultado económico.
 */
export const FEATURE_FLAGS = {
  modulosCargaRecursos: import.meta.env.VITE_FF_CARGA_RECURSOS === '1',
} as const;
