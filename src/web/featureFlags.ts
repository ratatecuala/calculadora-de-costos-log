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
  /**
   * Integración I-1 + I-1b (A-68, docs/22 v2): editores dentro de «Cotizar» (solo sin cuenta),
   * snapshot v2 en el navegador, copia mixta a la cuenta y recuperación del borrador.
   * **Apagada** salvo `VITE_FF_INTEGRACION_CARGA=1` en pruebas locales.
   */
  integracionCarga: import.meta.env.VITE_FF_INTEGRACION_CARGA === '1',
  /**
   * I-2 (A-81, docs/22 §17): inventario y recursos también CON CUENTA. La cuenta guarda el snapshot v2
   * y las líneas con `create_job_with_quote_v2`, las lee de vuelta y copia las cotizaciones locales con
   * detalle de carga. Solo actúa junto con `integracionCarga`. **Apagada** salvo
   * `VITE_FF_CARGA_NUBE=1` en pruebas locales: encenderla en staging exige antes las migraciones
   * 20261125120000 y 20261125120100 aplicadas allí (con su propia autorización).
   */
  cargaNube: import.meta.env.VITE_FF_CARGA_NUBE === '1',
} as const;
