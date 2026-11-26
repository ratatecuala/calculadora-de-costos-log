/** Ayuda siempre disponible después del alta (A-92): lenguaje simple, ejemplos locales. */
import { BoletaEjemplo, TableroEjemplo } from '../ilustraciones';
import { useCtx } from '../ui';

export function PantallaAyuda() {
  const { irA } = useCtx();
  return (
    <div className="m-ayuda-pantalla" data-ayuda>
      <h1 className="m-titulo">¿Cómo funciona?</h1>
      <section className="m-tarjeta" aria-label="Para qué sirve">
        <h2>Para qué sirve</h2>
        <p>Anotas tus viajes y tus recargas. Con eso comparamos lo que pensabas gastar con lo que realmente gastaste. Tus datos quedan solo en este teléfono.</p>
      </section>
      <section className="m-tarjeta" aria-label="Un viaje paso a paso">
        <h2>Un viaje, paso a paso</h2>
        <ol className="m-pasos">
          <li>Antes de salir, si quieres, anota cuánto crees que costará.</li>
          <li>Toca «Iniciar viaje» y anota el TRIP o el kilometraje total, tal como aparecen (no hace falta poner el TRIP en cero).</li>
          <li>Maneja tranquilo: no uses el teléfono mientras conduces.</li>
          <li>Al llegar, toca «Finalizar viaje» y anota los kilómetros de nuevo.</li>
          <li>Si pagaste TAG, peajes u otros gastos, agrégalos en la ficha del viaje.</li>
        </ol>
        <p className="m-nota">Todo se puede anotar después, con la hora corregida.</p>
      </section>
      <section className="m-tarjeta" aria-label="Tu tablero">
        <h2>Tu tablero</h2>
        <TableroEjemplo />
        <p>
          El <strong>TRIP</strong> (parcial) cuenta un tramo y se puede poner en cero, pero no es necesario: basta con anotar lo que marca al salir y al llegar. El{' '}
          <strong>kilometraje total</strong> (ODO u odómetro) suma todo lo que ha andado el vehículo y nunca se reinicia.
        </p>
      </section>
      <section className="m-tarjeta" aria-label="Recargas">
        <h2>Recargas</h2>
        <p>Anota los litros y el precio de cada recarga, aunque no llenes el estanque. Si llenas el estanque dos veces seguidas, podemos calcular tu rendimiento real.</p>
        <BoletaEjemplo />
      </section>
      <section className="m-tarjeta" aria-label="Lo que no sabes">
        <h2>Si no sabes un dato</h2>
        <p>
          Déjalo en blanco o elige «No lo sé». Si tu vehículo no tiene ese contador o indicador, elige esa opción: no es lo mismo. Nunca lo reemplazamos por cero ni por un valor inventado.
        </p>
      </section>
      <button type="button" className="m-btn m-btn-primario m-grande" onClick={() => irA('inicio')}>
        Volver al inicio
      </button>
    </div>
  );
}
